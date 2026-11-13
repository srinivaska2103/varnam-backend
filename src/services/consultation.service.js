import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { formatWhatsAppMessage } from '../utils/whatsappTemplates.js';

/**
 * Valid consultation status transition matrix
 */
const VALID_CONSULTATION_TRANSITIONS = {
  REQUESTED: ['CONFIRMED', 'RESCHEDULED', 'CANCELLED'],
  CONFIRMED: ['RESCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  RESCHEDULED: ['CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'],
  COMPLETED: [], // Terminal state
  CANCELLED: ['REQUESTED', 'CONFIRMED'], // Can reopen if requested
  NO_SHOW: ['RESCHEDULED', 'CANCELLED'],
};

export const consultationService = {
  /**
   * Conflict Detection Engine for Consultations
   * Checks if another active consultation in the same business overlaps with the proposed time
   */
  async checkConsultationConflict(businessId, startIso, endIso, excludeConsultationId = null) {
    if (!startIso || !endIso) {
      return { hasConflict: false };
    }

    const start = new Date(startIso);
    const end = new Date(endIso);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid start or end date format');
    }

    if (start >= end) {
      throw ApiError.badRequest('scheduled_end must be later than scheduled_start');
    }

    // Overlapping condition: (A_start < B_end) AND (A_end > B_start)
    // Only check active consultations (not CANCELLED or NO_SHOW)
    const overlapping = await prisma.consultations.findFirst({
      where: {
        business_id: businessId,
        ...(excludeConsultationId ? { id: { not: excludeConsultationId } } : {}),
        status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        scheduled_start: { lt: end },
        scheduled_end: { gt: start },
      },
      select: {
        id: true,
        requested_name: true,
        consultation_type: true,
        scheduled_start: true,
        scheduled_end: true,
        status: true,
      },
    });

    if (overlapping) {
      return {
        hasConflict: true,
        conflict: {
          id: overlapping.id,
          name: overlapping.requested_name,
          type: overlapping.consultation_type,
          start: overlapping.scheduled_start,
          end: overlapping.scheduled_end,
          status: overlapping.status,
        },
      };
    }

    return { hasConflict: false };
  },

  /**
   * Schedule / Create a Consultation
   */
  async createConsultation(businessId, userId, data) {
    let customerId = data.customer_id || null;
    let customerName = data.requested_name;
    let customerPhone = data.requested_phone;

    // 1. Validate Customer ownership if provided
    if (customerId) {
      const customer = await prisma.customers.findFirst({
        where: { id: customerId, business_id: businessId },
      });
      if (!customer) {
        throw ApiError.badRequest('Customer does not belong to your business or does not exist');
      }
      if (!customerName) customerName = customer.full_name;
      if (!customerPhone) customerPhone = customer.phone;
    }

    // 2. Validate Enquiry ownership if provided
    if (data.enquiry_id) {
      const enquiry = await prisma.enquiries.findFirst({
        where: { id: data.enquiry_id, business_id: businessId },
      });
      if (!enquiry) {
        throw ApiError.badRequest('Enquiry does not belong to your business or does not exist');
      }
      if (!customerId && enquiry.customer_id) {
        customerId = enquiry.customer_id;
      }
      if (!customerName) customerName = enquiry.customer_name;
      if (!customerPhone) customerPhone = enquiry.customer_phone;
    }

    // 3. Validate Booking ownership if provided
    if (data.booking_id) {
      const booking = await prisma.bookings.findFirst({
        where: { id: data.booking_id, business_id: businessId },
      });
      if (!booking) {
        throw ApiError.badRequest('Booking does not belong to your business or does not exist');
      }
      if (!customerId) customerId = booking.customer_id;
    }

    if (!customerName) {
      throw ApiError.badRequest('Client name (requested_name) or linked customer/enquiry is required');
    }
    if (!customerPhone) {
      throw ApiError.badRequest('Client phone number (requested_phone) is required');
    }

    // 4. Overlap & Conflict Check
    if (data.scheduled_start && data.scheduled_end) {
      const conflictCheck = await this.checkConsultationConflict(
        businessId,
        data.scheduled_start,
        data.scheduled_end
      );
      if (conflictCheck.hasConflict) {
        throw ApiError.conflict(
          `Schedule conflict detected: Overlaps with an existing ${conflictCheck.conflict.type} consultation for "${conflictCheck.conflict.name}" from ${new Date(conflictCheck.conflict.start).toLocaleTimeString()} to ${new Date(conflictCheck.conflict.end).toLocaleTimeString()}`
        );
      }
    }

    // 5. Create Consultation & Customer Preferences in a transaction
    const consultation = await prisma.$transaction(async (tx) => {
      const created = await tx.consultations.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          enquiry_id: data.enquiry_id || null,
          booking_id: data.booking_id || null,
          requested_name: customerName,
          requested_phone: customerPhone,
          consultation_type: data.consultation_type || 'IN_PERSON',
          status: data.status || 'REQUESTED',
          requested_at: data.requested_at ? new Date(data.requested_at) : new Date(),
          scheduled_start: data.scheduled_start ? new Date(data.scheduled_start) : null,
          scheduled_end: data.scheduled_end ? new Date(data.scheduled_end) : null,
          location_name: data.location_name || null,
          location_address: data.location_address || null,
          location_map_url: data.location_map_url || null,
          meeting_url: data.meeting_url || null,
          notes: data.notes || null,
          confirmed_by: data.confirmed_by || (data.status === 'CONFIRMED' ? userId : null),
        },
      });

      // If customer preferences are passed and customer is identified, persist them
      if (customerId && data.preferences) {
        await tx.customer_preferences.upsert({
          where: {
            business_id_customer_id: {
              business_id: businessId,
              customer_id: customerId,
            },
          },
          update: {
            ...(data.preferences.makeup_preferences !== undefined ? { makeup_preferences: data.preferences.makeup_preferences } : {}),
            ...(data.preferences.hairstyle_preferences !== undefined ? { hairstyle_preferences: data.preferences.hairstyle_preferences } : {}),
            ...(data.preferences.skin_notes !== undefined ? { skin_notes: data.preferences.skin_notes } : {}),
            ...(data.preferences.outfit_notes !== undefined ? { outfit_notes: data.preferences.outfit_notes } : {}),
            ...(data.preferences.inspiration_links !== undefined ? { inspiration_links: data.preferences.inspiration_links } : {}),
            ...(data.preferences.special_requirements !== undefined ? { special_requirements: data.preferences.special_requirements } : {}),
            updated_at: new Date(),
          },
          create: {
            business_id: businessId,
            customer_id: customerId,
            makeup_preferences: data.preferences.makeup_preferences || null,
            hairstyle_preferences: data.preferences.hairstyle_preferences || null,
            skin_notes: data.preferences.skin_notes || null,
            outfit_notes: data.preferences.outfit_notes || null,
            inspiration_links: data.preferences.inspiration_links || [],
            special_requirements: data.preferences.special_requirements || null,
          },
        });
      }

      // If linked to an enquiry, update enquiry status to CONSULTATION if appropriate
      if (data.enquiry_id) {
        const enq = await tx.enquiries.findUnique({ where: { id: data.enquiry_id } });
        if (enq && enq.status === 'NEW') {
          await tx.enquiries.update({
            where: { id: data.enquiry_id },
            data: { status: 'CONSULTATION' },
          });
        }
        await tx.enquiry_activities.create({
          data: {
            business_id: businessId,
            enquiry_id: data.enquiry_id,
            activity_type: 'CONSULTATION_SCHEDULED',
            title: `Consultation (${data.consultation_type || 'IN_PERSON'}) Scheduled`,
            details: `Consultation booked for ${customerName} on ${data.scheduled_start ? new Date(data.scheduled_start).toISOString() : 'To be confirmed'}`,
            created_by: userId,
          },
        });
      }

      return created;
    });

    const result = await this.getConsultationById(businessId, consultation.id);

    // Schedule consultation reminders non-blockingly
    (async () => {
      try {
        if (!result.scheduled_start) return;

        const biz = await prisma.businesses.findUnique({
          where: { id: businessId },
          select: { name: true, business_phone: true, whatsapp_phone: true, business_email: true, address_line1: true },
        });

        const bizName = biz?.name || 'Bridal Studio';
        const startDt = new Date(result.scheduled_start);
        const dateStr = startDt.toISOString().split('T')[0];
        const timeStr = startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const custEmail = result.customers?.email || result.customer?.email;

        if (custEmail) {
          // Confirmation & Immediate receipt
          const template = emailTemplates.consultation({
            clientName: result.requested_name,
            dateStr,
            timeStr,
            consultationType: result.consultation_type,
            notes: result.notes,
            businessName: bizName,
          });

          await notificationService.queueNotification({
            businessId,
            recipient: custEmail,
            channel: 'EMAIL',
            subject: template.subject,
            messageBody: template.html,
            idempotencyKey: `cons_conf_${result.id}_${custEmail}`,
            customerId: result.customer_id,
            consultationId: result.id,
          }).then((job) => job && notificationService.processJob(job.id));

          // 24 hours prior reminder
          const time24hBefore = new Date(startDt.getTime() - 24 * 60 * 60 * 1000);
          if (time24hBefore > new Date()) {
            await notificationService.queueNotification({
              businessId,
              recipient: custEmail,
              channel: 'EMAIL',
              subject: `Reminder: Consultation tomorrow at ${timeStr} - ${bizName}`,
              messageBody: template.html,
              scheduledAt: time24hBefore,
              idempotencyKey: `cons_rem_24h_${result.id}`,
              customerId: result.customer_id,
              consultationId: result.id,
            });
          }

          // 2 hours prior reminder
          const time2hBefore = new Date(startDt.getTime() - 2 * 60 * 60 * 1000);
          if (time2hBefore > new Date()) {
            await notificationService.queueNotification({
              businessId,
              recipient: custEmail,
              channel: 'EMAIL',
              subject: `Reminder: Consultation in 2 hours at ${timeStr} - ${bizName}`,
              messageBody: template.html,
              scheduledAt: time2hBefore,
              idempotencyKey: `cons_rem_2h_${result.id}`,
              customerId: result.customer_id,
              consultationId: result.id,
            });
          }
        }

        // WhatsApp Template 4: Consultation Reminder to Customer
        const custPhone = result.requested_phone || result.customers?.phone;
        const studioPhone = biz?.whatsapp_phone || biz?.business_phone || '';
        if (custPhone) {
          try {
            const waParams = {
              customer_name: result.requested_name || result.customers?.full_name || 'Client',
              studio_name: bizName,
              consultation_date: dateStr,
              consultation_time: timeStr,
              studio_location: result.location_name || result.location_address || biz?.address_line1 || 'Studio',
              phone_number: studioPhone || 'Our Studio',
            };
            const waBody = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams);

            await notificationService.queueNotification({
              businessId,
              recipient: custPhone,
              channel: 'WHATSAPP',
              subject: 'Consultation Reminder',
              messageBody: waBody,
              templateName: 'consultation_reminder',
              templateParams: waParams,
              idempotencyKey: `wa_cons_conf_${result.id}_${custPhone}`,
              customerId: result.customer_id,
              consultationId: result.id,
            }).then((job) => job && notificationService.processJob(job.id));
          } catch (waErr) {
            console.error('[ConsultationService] WhatsApp reminder error:', waErr.message);
          }
        }
      } catch (e) {
        console.error('[ConsultationService] Reminder error:', e.message);
      }
    })();

    return result;
  },

  /**
   * List consultations with pagination, filters, and search
   */
  async listConsultations(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const andConditions = [{ business_id: businessId }];

    if (query.status) {
      if (query.status === 'RESCHEDULED') {
        // Match consultations that have status = 'RESCHEDULED' OR have recorded reschedule entries in consultation_reschedules
        andConditions.push({
          OR: [
            { status: 'RESCHEDULED' },
            { consultation_reschedules: { some: {} } },
          ],
        });
      } else {
        andConditions.push({ status: query.status });
      }
    }
    if (query.consultation_type) {
      andConditions.push({ consultation_type: query.consultation_type });
    }
    if (query.customer_id) {
      andConditions.push({ customer_id: query.customer_id });
    }
    if (query.enquiry_id) {
      andConditions.push({ enquiry_id: query.enquiry_id });
    }
    if (query.booking_id) {
      andConditions.push({ booking_id: query.booking_id });
    }

    if (query.startDate || query.endDate) {
      const dateCond = {};
      if (query.startDate) {
        dateCond.gte = new Date(query.startDate);
      }
      if (query.endDate) {
        dateCond.lte = new Date(query.endDate);
      }
      andConditions.push({ scheduled_start: dateCond });
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      andConditions.push({
        OR: [
          { requested_name: { contains: term, mode: 'insensitive' } },
          { requested_phone: { contains: term, mode: 'insensitive' } },
          { location_name: { contains: term, mode: 'insensitive' } },
          { notes: { contains: term, mode: 'insensitive' } },
        ],
      });
    }

    const where = andConditions.length > 1 ? { AND: andConditions } : andConditions[0];

    const [total, consultations] = await Promise.all([
      prisma.consultations.count({ where }),
      prisma.consultations.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ scheduled_start: 'asc' }, { created_at: 'desc' }],
        include: {
          customers: {
            select: { id: true, full_name: true, phone: true, email: true },
          },
          enquiries: {
            select: { id: true, customer_name: true, event_kind: true, event_date: true },
          },
          bookings: {
            select: { id: true, booking_number: true, status: true },
          },
          users: {
            select: { id: true, name: true, email: true },
          },
          consultation_reschedules: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: { id: true, created_at: true },
          },
        },
      }),
    ]);

    const formatted = consultations.map((c) => ({
      ...c,
      requested_name: c.customers?.full_name || c.requested_name,
      requested_phone: c.customers?.phone || c.requested_phone,
    }));

    return {
      consultations: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single consultation details by ID with preferences snapshot
   */
  async getConsultationById(businessId, consultationId) {
    const consultation = await prisma.consultations.findFirst({
      where: {
        id: consultationId,
        business_id: businessId,
      },
      include: {
        customers: {
          include: {
            customer_preferences: true,
          },
        },
        enquiries: {
          select: {
            id: true,
            customer_name: true,
            event_kind: true,
            event_date: true,
            status: true,
            notes: true,
          },
        },
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
            discount_paise: true,
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        consultation_reschedules: {
          orderBy: { created_at: 'desc' },
          include: {
            users: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        notification_jobs: {
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            channel: true,
            recipient: true,
            subject: true,
            template_name: true,
            status: true,
            scheduled_at: true,
            sent_at: true,
            error_message: true,
            created_at: true,
          },
        },
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found in this business');
    }

    return {
      ...consultation,
      requested_name: consultation.customers?.full_name || consultation.requested_name,
      requested_phone: consultation.customers?.phone || consultation.requested_phone,
      bookings: consultation.bookings
        ? {
            ...consultation.bookings,
            total_amount_paise: Number(consultation.bookings.total_amount_paise),
            discount_paise: Number(consultation.bookings.discount_paise),
          }
        : null,
      preferences: consultation.customers?.customer_preferences?.[0] || null,
    };
  },

  /**
   * Update consultation details
   */
  async updateConsultation(businessId, consultationId, data) {
    const existing = await this.getConsultationById(businessId, consultationId);

    // 1. Conflict detection if rescheduling time
    const startIso = data.scheduled_start !== undefined ? data.scheduled_start : existing.scheduled_start;
    const endIso = data.scheduled_end !== undefined ? data.scheduled_end : existing.scheduled_end;

    if (startIso && endIso && (data.scheduled_start !== undefined || data.scheduled_end !== undefined)) {
      const conflictCheck = await this.checkConsultationConflict(
        businessId,
        startIso,
        endIso,
        consultationId
      );
      if (conflictCheck.hasConflict) {
        throw ApiError.conflict(
          `Schedule conflict detected: Overlaps with an existing ${conflictCheck.conflict.type} consultation for "${conflictCheck.conflict.name}" from ${new Date(conflictCheck.conflict.start).toLocaleTimeString()} to ${new Date(conflictCheck.conflict.end).toLocaleTimeString()}`
        );
      }
    }

    const isDatesRescheduled =
      (data.scheduled_start && new Date(data.scheduled_start).getTime() !== new Date(existing.scheduled_start).getTime()) ||
      (data.scheduled_end && new Date(data.scheduled_end).getTime() !== new Date(existing.scheduled_end).getTime());

    // 2. Structured outcome notes recording
    let updatedNotes = data.notes !== undefined ? data.notes : existing.notes;
    if (data.outcome) {
      const outcomeSection = [
        '--- CONSULTATION OUTCOME ---',
        data.outcome.summary ? `Summary: ${data.outcome.summary}` : null,
        data.outcome.customer_requirements ? `Requirements: ${data.outcome.customer_requirements}` : null,
        data.outcome.agreed_services ? `Agreed Services: ${data.outcome.agreed_services}` : null,
        data.outcome.agreed_package ? `Agreed Package: ${data.outcome.agreed_package}` : null,
        data.outcome.estimated_price_paise !== undefined ? `Estimated Price: ₹${(Number(data.outcome.estimated_price_paise) / 100).toFixed(2)}` : null,
        data.outcome.follow_up_date ? `Next Follow-up Date: ${data.outcome.follow_up_date}` : null,
        data.outcome.intends_to_proceed !== undefined ? `Intends to Proceed: ${data.outcome.intends_to_proceed ? 'YES' : 'NO'}` : null,
      ].filter(Boolean).join('\n');

      updatedNotes = updatedNotes ? `${updatedNotes}\n\n${outcomeSection}` : outcomeSection;
    }

    // 3. Update database
    await prisma.$transaction(async (tx) => {
      await tx.consultations.update({
        where: { id: consultationId },
        data: {
          ...(data.requested_name ? { requested_name: data.requested_name } : {}),
          ...(data.requested_phone ? { requested_phone: data.requested_phone } : {}),
          ...(data.consultation_type ? { consultation_type: data.consultation_type } : {}),
          ...(data.scheduled_start !== undefined ? { scheduled_start: data.scheduled_start ? new Date(data.scheduled_start) : null } : {}),
          ...(data.scheduled_end !== undefined ? { scheduled_end: data.scheduled_end ? new Date(data.scheduled_end) : null } : {}),
          ...(data.location_name !== undefined ? { location_name: data.location_name } : {}),
          ...(data.location_address !== undefined ? { location_address: data.location_address } : {}),
          ...(data.location_map_url !== undefined ? { location_map_url: data.location_map_url } : {}),
          ...(data.meeting_url !== undefined ? { meeting_url: data.meeting_url } : {}),
          ...(updatedNotes !== undefined ? { notes: updatedNotes } : {}),
          ...(data.confirmed_by !== undefined ? { confirmed_by: data.confirmed_by } : {}),
        },
      });

      // Update customer preferences if customer exists and preferences supplied
      const custId = existing.customer_id;
      if (custId && data.preferences) {
        await tx.customer_preferences.upsert({
          where: {
            business_id_customer_id: {
              business_id: businessId,
              customer_id: custId,
            },
          },
          update: {
            ...(data.preferences.makeup_preferences !== undefined ? { makeup_preferences: data.preferences.makeup_preferences } : {}),
            ...(data.preferences.hairstyle_preferences !== undefined ? { hairstyle_preferences: data.preferences.hairstyle_preferences } : {}),
            ...(data.preferences.skin_notes !== undefined ? { skin_notes: data.preferences.skin_notes } : {}),
            ...(data.preferences.outfit_notes !== undefined ? { outfit_notes: data.preferences.outfit_notes } : {}),
            ...(data.preferences.inspiration_links !== undefined ? { inspiration_links: data.preferences.inspiration_links } : {}),
            ...(data.preferences.special_requirements !== undefined ? { special_requirements: data.preferences.special_requirements } : {}),
            updated_at: new Date(),
          },
          create: {
            business_id: businessId,
            customer_id: custId,
            makeup_preferences: data.preferences.makeup_preferences || null,
            hairstyle_preferences: data.preferences.hairstyle_preferences || null,
            skin_notes: data.preferences.skin_notes || null,
            outfit_notes: data.preferences.outfit_notes || null,
            inspiration_links: data.preferences.inspiration_links || [],
            special_requirements: data.preferences.special_requirements || null,
          },
        });
      }
    });

    // If dates were changed via update, trigger reschedule flow (log history, cancel old reminders, dispatch WA)
    if (isDatesRescheduled) {
      (async () => {
        try {
          await notificationService.cancelJobsByReference({
            businessId,
            consultationId,
            reason: 'Consultation rescheduled',
          });

          let rescheduleRecord;
          try {
            rescheduleRecord = await prisma.consultation_reschedules.create({
              data: {
                business_id: businessId,
                consultation_id: consultationId,
                previous_start: existing.scheduled_start,
                previous_end: existing.scheduled_end,
                new_start: data.scheduled_start ? new Date(data.scheduled_start) : existing.scheduled_start,
                new_end: data.scheduled_end ? new Date(data.scheduled_end) : existing.scheduled_end,
                reason: data.notes?.trim() || 'Rescheduled appointment',
                changed_by: null,
                whatsapp_status: 'QUEUED',
              },
            });
          } catch (histErr) {
            console.error('[ConsultationService] Error logging reschedule record:', histErr.message);
          }

          const startDt = new Date(data.scheduled_start || existing.scheduled_start);
          const dateStr = startDt.toISOString().split('T')[0];
          const timeStr = startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

          const biz = await prisma.businesses.findUnique({
            where: { id: businessId },
            select: { name: true, business_email: true, business_phone: true, address_line1: true },
          });
          const bizName = biz?.name || 'Bridal Studio';
          const studioLocation =
            existing.location_address ||
            existing.location_name ||
            biz?.address_line1 ||
            'Studio';
          const custName = existing.requested_name || existing.customers?.full_name || 'Client';
          const custPhone = existing.requested_phone || existing.customers?.phone;

          const studioPhone = biz?.whatsapp_phone || biz?.business_phone || '';
          if (custPhone) {
            try {
              const waParams = {
                customer_name: custName,
                studio_name: bizName,
                consultation_date: dateStr,
                consultation_time: timeStr,
                studio_location: studioLocation,
                phone_number: studioPhone || 'Our Studio',
              };

              const waBody = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams);

              const waJob = await notificationService.queueNotification({
                businessId,
                recipient: custPhone,
                channel: 'WHATSAPP',
                subject: `Rescheduled Consultation: ${dateStr} at ${timeStr}`,
                messageBody: waBody,
                templateName: 'consultation_reminder',
                templateParams: waParams,
                idempotencyKey: `wa_cons_resched_${consultationId}_${startDt.getTime()}`,
                customerId: existing.customer_id,
                consultationId: consultationId,
              });

              if (waJob) {
                try {
                  const processed = await notificationService.processJob(waJob.id);
                  if (rescheduleRecord) {
                    await prisma.consultation_reschedules.update({
                      where: { id: rescheduleRecord.id },
                      data: { whatsapp_status: processed?.status || 'SENT' },
                    });
                  }
                } catch (procErr) {
                  console.error('[ConsultationService] Process WA reschedule job error:', procErr.message);
                }
              }
            } catch (waErr) {
              console.error('[ConsultationService] WhatsApp rescheduling send error:', waErr.message);
            }
          }

          // 24-Hour Reminder
          const time24hBefore = new Date(startDt.getTime() - 24 * 60 * 60 * 1000);
          if (time24hBefore > new Date() && custPhone) {
            const waParams24 = {
              customer_name: custName,
              studio_name: bizName,
              consultation_date: dateStr,
              consultation_time: timeStr,
              studio_location: studioLocation,
              phone_number: studioPhone || 'Our Studio',
            };
            const waBody24 = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams24);

            await notificationService.queueNotification({
              businessId,
              recipient: custPhone,
              channel: 'WHATSAPP',
              subject: `Reminder: Consultation in 24 hours (${dateStr} at ${timeStr})`,
              messageBody: waBody24,
              templateName: 'consultation_reminder',
              templateParams: waParams24,
              scheduledAt: time24hBefore,
              idempotencyKey: `wa_cons_rem24h_${consultationId}_${startDt.getTime()}`,
              customerId: existing.customer_id,
              consultationId: consultationId,
            });
          }

          // 2-Hour Reminder
          const time2hBefore = new Date(startDt.getTime() - 2 * 60 * 60 * 1000);
          if (time2hBefore > new Date() && custPhone) {
            const waParams2 = {
              customer_name: custName,
              studio_name: bizName,
              consultation_date: dateStr,
              consultation_time: timeStr,
              studio_location: studioLocation,
              phone_number: studioPhone || 'Our Studio',
            };
            const waBody2 = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams2);

            await notificationService.queueNotification({
              businessId,
              recipient: custPhone,
              channel: 'WHATSAPP',
              subject: `Reminder: Consultation starting in 2 hours (${dateStr} at ${timeStr})`,
              messageBody: waBody2,
              templateName: 'consultation_reminder',
              templateParams: waParams2,
              scheduledAt: time2hBefore,
              idempotencyKey: `wa_cons_rem2h_${consultationId}_${startDt.getTime()}`,
              customerId: existing.customer_id,
              consultationId: consultationId,
            });
          }
        } catch (err) {
          console.error('[ConsultationService] Background reschedule handling error:', err.message);
        }
      })();
    }

    return this.getConsultationById(businessId, consultationId);
  },

  /**
   * Update consultation status with transition matrix validation
   */
  async updateConsultationStatus(businessId, userId, consultationId, data) {
    const existing = await prisma.consultations.findFirst({
      where: { id: consultationId, business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Consultation not found');
    }

    const newStatus = data.status;

    if (existing.status === newStatus) {
      return this.getConsultationById(businessId, consultationId);
    }

    const permitted = VALID_CONSULTATION_TRANSITIONS[existing.status] || [];
    if (!permitted.includes(newStatus)) {
      throw ApiError.badRequest(
        `Invalid status transition from "${existing.status}" to "${newStatus}". Permitted transitions: ${permitted.join(', ') || 'None (Terminal state)'}`
      );
    }

    // If rescheduling, check for start time and conflicts
    let scheduledStart = data.scheduled_start ? new Date(data.scheduled_start) : existing.scheduled_start;
    let scheduledEnd = data.scheduled_end ? new Date(data.scheduled_end) : existing.scheduled_end;

    if (newStatus === 'RESCHEDULED' && data.scheduled_start && data.scheduled_end) {
      const conflictCheck = await this.checkConsultationConflict(
        businessId,
        data.scheduled_start,
        data.scheduled_end,
        consultationId
      );
      if (conflictCheck.hasConflict) {
        throw ApiError.conflict(
          `Schedule conflict detected: Overlaps with an existing ${conflictCheck.conflict.type} consultation for "${conflictCheck.conflict.name}" from ${new Date(conflictCheck.conflict.start).toLocaleTimeString()} to ${new Date(conflictCheck.conflict.end).toLocaleTimeString()}`
        );
      }
    }

    let updatedNotes = existing.notes;
    if (data.notes) {
      updatedNotes = updatedNotes ? `${updatedNotes}\n[Status: ${newStatus}] ${data.notes}` : `[Status: ${newStatus}] ${data.notes}`;
    }

    await prisma.consultations.update({
      where: { id: consultationId },
      data: {
        status: newStatus,
        notes: updatedNotes,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        confirmed_by: newStatus === 'CONFIRMED' ? userId : existing.confirmed_by,
      },
    });

    const updatedResult = await this.getConsultationById(businessId, consultationId);

    // If rescheduled or dates changed, cancel previous pending reminder jobs and reschedule for new time
    if (newStatus === 'RESCHEDULED' || data.scheduled_start) {
      (async () => {
        try {
          // 1. Invalidate/cancel previous pending notification jobs for the old appointment
          await notificationService.cancelJobsByReference({
            businessId,
            consultationId,
            reason: 'Consultation rescheduled',
          });

          // 2. Record historical consultation reschedule entry
          let rescheduleRecord;
          try {
            rescheduleRecord = await prisma.consultation_reschedules.create({
              data: {
                business_id: businessId,
                consultation_id: consultationId,
                previous_start: existing.scheduled_start,
                previous_end: existing.scheduled_end,
                new_start: scheduledStart,
                new_end: scheduledEnd,
                reason: data.notes?.trim() || 'Rescheduled appointment',
                changed_by: userId || null,
                whatsapp_status: 'QUEUED',
              },
            });
          } catch (histErr) {
            console.error('[ConsultationService] Error logging reschedule record:', histErr.message);
          }

          const startDt = new Date(scheduledStart);
          const dateStr = startDt.toISOString().split('T')[0];
          const timeStr = startDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const durationMins = scheduledEnd
            ? Math.round((new Date(scheduledEnd) - startDt) / 60000)
            : 60;

          const biz = await prisma.businesses.findUnique({
            where: { id: businessId },
            select: { name: true, business_email: true, business_phone: true, address_line1: true },
          });
          const bizName = biz?.name || 'Bridal Studio';
          const studioLocation =
            updatedResult.location_address ||
            updatedResult.location_name ||
            biz?.address_line1 ||
            'Studio';
          const custName = updatedResult.requested_name || updatedResult.customers?.full_name || 'Client';
          const custPhone = updatedResult.requested_phone || updatedResult.customers?.phone;

          // 3. Dispatch WhatsApp Rescheduling Confirmation to Customer Mobile Number
          const studioPhone = biz?.whatsapp_phone || biz?.business_phone || '';
          if (custPhone) {
            try {
              const waParams = {
                customer_name: custName,
                studio_name: bizName,
                consultation_date: dateStr,
                consultation_time: timeStr,
                studio_location: studioLocation,
                phone_number: studioPhone || 'Our Studio',
              };

              const waBody = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams);

              const waJob = await notificationService.queueNotification({
                businessId,
                recipient: custPhone,
                channel: 'WHATSAPP',
                subject: `Rescheduled Consultation: ${dateStr} at ${timeStr}`,
                messageBody: waBody,
                templateName: 'consultation_reminder',
                templateParams: waParams,
                idempotencyKey: `wa_cons_resched_${updatedResult.id}_${startDt.getTime()}`,
                customerId: updatedResult.customer_id,
                consultationId: updatedResult.id,
              });

              if (waJob) {
                // Trigger immediate delivery in background
                try {
                  const processed = await notificationService.processJob(waJob.id);
                  if (rescheduleRecord) {
                    await prisma.consultation_reschedules.update({
                      where: { id: rescheduleRecord.id },
                      data: { whatsapp_status: processed?.status || 'SENT' },
                    });
                  }
                } catch (procErr) {
                  console.error('[ConsultationService] Process WA reschedule job error:', procErr.message);
                }
              }
            } catch (waErr) {
              console.error('[ConsultationService] WhatsApp rescheduling send error:', waErr.message);
            }
          }

          // 4. Schedule 24-Hour WhatsApp Reminder
          const time24hBefore = new Date(startDt.getTime() - 24 * 60 * 60 * 1000);
          if (time24hBefore > new Date() && custPhone) {
            const waParams24 = {
              customer_name: custName,
              studio_name: bizName,
              consultation_date: dateStr,
              consultation_time: timeStr,
              studio_location: studioLocation,
              phone_number: studioPhone || 'Our Studio',
            };
            const waBody24 = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams24);

            await notificationService.queueNotification({
              businessId,
              recipient: custPhone,
              channel: 'WHATSAPP',
              subject: `Reminder: Consultation in 24 hours (${dateStr} at ${timeStr})`,
              messageBody: waBody24,
              templateName: 'consultation_reminder',
              templateParams: waParams24,
              scheduledAt: time24hBefore,
              idempotencyKey: `wa_cons_rem24h_${updatedResult.id}_${startDt.getTime()}`,
              customerId: updatedResult.customer_id,
              consultationId: updatedResult.id,
            });
          }

          // 5. Schedule 2-Hour WhatsApp Reminder
          const time2hBefore = new Date(startDt.getTime() - 2 * 60 * 60 * 1000);
          if (time2hBefore > new Date() && custPhone) {
            const waParams2 = {
              customer_name: custName,
              studio_name: bizName,
              consultation_date: dateStr,
              consultation_time: timeStr,
              studio_location: studioLocation,
              phone_number: studioPhone || 'Our Studio',
            };
            const waBody2 = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams2);

            await notificationService.queueNotification({
              businessId,
              recipient: custPhone,
              channel: 'WHATSAPP',
              subject: `Reminder: Consultation in 2 hours (${timeStr})`,
              messageBody: waBody2,
              templateName: 'consultation_reminder',
              templateParams: waParams2,
              scheduledAt: time2hBefore,
              idempotencyKey: `wa_cons_rem2h_${updatedResult.id}_${startDt.getTime()}`,
              customerId: updatedResult.customer_id,
              consultationId: updatedResult.id,
            });
          }

          // 6. Dedicated Consultation Reschedule Email to Customer (Workflow #1)
          const custEmail = updatedResult.customers?.email || updatedResult.customer?.email;
          if (custEmail) {
            const prevStartDt = existing.scheduled_start ? new Date(existing.scheduled_start) : null;
            const prevDateStr = prevStartDt ? prevStartDt.toISOString().split('T')[0] : 'Previous Slot';
            const prevTimeStr = prevStartDt ? prevStartDt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

            const template = emailTemplates.consultationRescheduledCustomer({
              clientName: custName,
              studioName: bizName,
              logoUrl: biz?.logo_url || null,
              consultationRef: updatedResult.id.substring(0, 8).toUpperCase(),
              previousDateStr: prevDateStr,
              previousTimeStr: prevTimeStr,
              updatedDateStr: dateStr,
              updatedTimeStr: timeStr,
              location: studioLocation,
              studioPhone: biz?.business_phone,
              studioEmail: biz?.business_email,
            });

            await notificationService.queueNotification({
              businessId,
              recipient: custEmail,
              channel: 'EMAIL',
              subject: template.subject,
              messageBody: template.html,
              idempotencyKey: `cons_resched_email_${updatedResult.id}_${startDt.getTime()}`,
              customerId: updatedResult.customer_id,
              consultationId: updatedResult.id,
              notificationType: 'TRANSACTIONAL',
              templateName: 'consultation_rescheduled_customer',
              templateParams: {
                previousDateStr: prevDateStr,
                updatedDateStr: dateStr,
                updatedTimeStr: timeStr,
              },
            }).then((job) => job && notificationService.processJob(job.id));
          }
        } catch (err) {
          console.error('[ConsultationService] Reschedule reminders error:', err.message);
        }
      })();
    }

    return updatedResult;
  },

  /**
   * Cancel consultation (safe status transition to CANCELLED)
   */
  async cancelConsultation(businessId, consultationId, reason) {
    const existing = await prisma.consultations.findFirst({
      where: { id: consultationId, business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Consultation not found');
    }

    if (existing.status === 'CANCELLED') {
      return this.getConsultationById(businessId, consultationId);
    }

    const cancelNote = `[Cancelled] Reason: ${reason || 'Cancelled by studio'}`;
    const updatedNotes = existing.notes ? `${existing.notes}\n${cancelNote}` : cancelNote;

    await prisma.consultations.update({
      where: { id: consultationId },
      data: {
        status: 'CANCELLED',
        notes: updatedNotes,
      },
    });

    // Cancel pending notification jobs for this consultation
    notificationService.cancelJobsByReference({
      businessId,
      consultationId,
      reason: `Consultation cancelled: ${reason || 'Cancelled by studio'}`,
    }).catch((e) => console.error('[ConsultationService] Cancel jobs error:', e.message));

    return this.getConsultationById(businessId, consultationId);
  },

  /**
   * Calendar query endpoint with start/end range and view metadata
   */
  /**
   * Unified Dynamic Calendar for Consultations, Client Follow-ups & Upcoming Bridal Bookings
   */
  async getConsultationsCalendar(businessId, query) {
    const { startDate, endDate, status, customer_id, event_types, view = 'month' } = query;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw ApiError.badRequest('Invalid startDate or endDate query parameters');
    }

    const requestedTypes = event_types
      ? event_types.split(',').map((t) => t.trim().toUpperCase())
      : ['CONSULTATION', 'FOLLOW_UP', 'BOOKING'];

    // 1. Fetch Scheduled Consultations (Orange events)
    let consultationEvents = [];
    if (requestedTypes.includes('CONSULTATION')) {
      const where = {
        business_id: businessId,
        scheduled_start: {
          gte: start,
          lte: end,
        },
      };

      if (status) {
        where.status = status;
      } else {
        // Exclude cancelled and completed consultations from active upcoming calendar
        where.status = { notIn: ['CANCELLED', 'COMPLETED'] };
      }

      if (customer_id) {
        where.customer_id = customer_id;
      }

      const consultations = await prisma.consultations.findMany({
        where,
        orderBy: { scheduled_start: 'asc' },
        include: {
          customers: {
            select: { id: true, full_name: true, phone: true, email: true },
          },
          users: {
            select: { id: true, name: true },
          },
          bookings: {
            select: { id: true, booking_number: true, package_name_snapshot: true },
          },
          enquiries: {
            select: { id: true, customer_name: true, event_kind: true },
          },
          consultation_reschedules: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: { id: true, new_start: true },
          },
        },
      });

      consultationEvents = consultations.map((c) => ({
        id: c.id,
        eventType: 'CONSULTATION',
        title: c.customers?.full_name || c.requested_name || 'Bride Consultation',
        customerName: c.customers?.full_name || c.requested_name || 'Client',
        customerPhone: c.customers?.phone || c.requested_phone || null,
        customerId: c.customer_id,
        eventDate: c.scheduled_start ? c.scheduled_start.toISOString().split('T')[0] : null,
        scheduled_start: c.scheduled_start ? c.scheduled_start.toISOString() : null,
        scheduled_end: c.scheduled_end ? c.scheduled_end.toISOString() : null,
        status: c.status,
        consultation_type: c.consultation_type,
        location: c.location_name || 'Studio',
        notes: c.notes,
        isRescheduled: !!(c.consultation_reschedules && c.consultation_reschedules.length > 0),
        bookingNumber: c.bookings?.booking_number || null,
        // Preserve raw object for details modal compatibility
        rawConsultation: c,
      }));
    }

    // 2. Fetch Client Follow-up Events from Outcomes & Enquiries (Blue events)
    let followUpEvents = [];
    if (requestedTypes.includes('FOLLOW_UP')) {
      const [outcomeFollowUps, enquiryFollowUps] = await Promise.all([
        prisma.consultation_outcomes.findMany({
          where: {
            business_id: businessId,
            follow_up_date: {
              gte: start,
              lte: end,
            },
          },
          orderBy: { follow_up_date: 'asc' },
          include: {
            customers: {
              select: { id: true, full_name: true, phone: true, email: true },
            },
            consultations: {
              select: { id: true, requested_name: true, requested_phone: true, scheduled_start: true, consultation_type: true },
            },
            enquiries: {
              select: { id: true, customer_name: true, customer_phone: true, status: true },
            },
          },
        }),
        prisma.enquiries.findMany({
          where: {
            business_id: businessId,
            next_follow_up_at: {
              gte: start,
              lte: end,
            },
            status: { notIn: ['CONVERTED', 'LOST'] },
          },
          orderBy: { next_follow_up_at: 'asc' },
          include: {
            customers: {
              select: { id: true, full_name: true, phone: true, email: true },
            },
          },
        }),
      ]);

      const formattedOutcomeFollowUps = outcomeFollowUps.map((o) => {
        const clientName =
          o.customers?.full_name ||
          o.consultations?.requested_name ||
          o.enquiries?.customer_name ||
          'Client Follow-up';
        const clientPhone =
          o.customers?.phone ||
          o.consultations?.requested_phone ||
          o.enquiries?.customer_phone ||
          null;

        return {
          id: `fu-${o.id}`,
          outcomeId: o.id,
          consultationId: o.consultation_id,
          enquiryId: o.enquiry_id,
          customerId: o.customer_id,
          eventType: 'FOLLOW_UP',
          followUpType: 'CONSULTATION_OUTCOME',
          title: `Follow-up: ${clientName}`,
          customerName: clientName,
          customerPhone: clientPhone,
          eventDate: o.follow_up_date ? o.follow_up_date.toISOString().split('T')[0] : null,
          scheduled_start: o.follow_up_date ? o.follow_up_date.toISOString() : null,
          scheduled_end: null,
          status: o.outcome_tag || 'PENDING',
          feedback_summary: o.feedback_summary,
          agreed_package: o.agreed_package,
          intends_to_proceed: o.intends_to_proceed,
          rawOutcome: o,
        };
      });

      const formattedEnquiryFollowUps = enquiryFollowUps.map((e) => {
        const clientName = e.customers?.full_name || e.customer_name || 'Enquiry Client';
        const clientPhone = e.customers?.phone || e.customer_phone || null;

        return {
          id: `enq-fu-${e.id}`,
          enquiryId: e.id,
          customerId: e.customer_id,
          eventType: 'FOLLOW_UP',
          followUpType: 'ENQUIRY_FOLLOW_UP',
          title: `Enquiry Follow-up: ${clientName}`,
          customerName: clientName,
          customerPhone: clientPhone,
          eventDate: e.next_follow_up_at ? e.next_follow_up_at.toISOString().split('T')[0] : null,
          scheduled_start: e.next_follow_up_at ? e.next_follow_up_at.toISOString() : null,
          scheduled_end: null,
          status: e.status || 'PENDING',
          notes: e.notes,
          event_kind: e.event_kind,
          rawEnquiry: e,
        };
      });

      followUpEvents = [...formattedOutcomeFollowUps, ...formattedEnquiryFollowUps];
    }

    // 3. Fetch Upcoming Bridal Bookings on Event Dates (Green events)
    let bookingEvents = [];
    if (requestedTypes.includes('BOOKING')) {
      const rawBookingEvents = await prisma.booking_events.findMany({
        where: {
          business_id: businessId,
          event_date: {
            gte: start,
            lte: end,
          },
          bookings: {
            status: { notIn: ['CANCELLED', 'COMPLETED'] },
          },
        },
        orderBy: { event_date: 'asc' },
        include: {
          bookings: {
            include: {
              customers: {
                select: { id: true, full_name: true, phone: true, email: true },
              },
            },
          },
        },
      });

      bookingEvents = rawBookingEvents.map((be) => {
        const clientName = be.bookings?.customers?.full_name || be.title || 'Bridal Client';
        const clientPhone = be.bookings?.customers?.phone || null;

        // Build ISO start time combining event_date with start_time if present
        let eventIsoStr = be.event_date.toISOString().split('T')[0] + 'T09:00:00.000Z';
        if (be.start_time) {
          const t = new Date(be.start_time);
          const hh = String(t.getUTCHours()).padStart(2, '0');
          const mm = String(t.getUTCMinutes()).padStart(2, '0');
          eventIsoStr = be.event_date.toISOString().split('T')[0] + `T${hh}:${mm}:00.000Z`;
        }

        return {
          id: `bke-${be.id}`,
          bookingEventId: be.id,
          bookingId: be.booking_id,
          customerId: be.bookings?.customer_id,
          eventType: 'BOOKING',
          title: `Booking: ${clientName} (${be.event_kind})`,
          customerName: clientName,
          customerPhone: clientPhone,
          eventDate: be.event_date.toISOString().split('T')[0],
          scheduled_start: eventIsoStr,
          scheduled_end: null,
          status: be.bookings?.status || 'CONFIRMED',
          event_kind: be.event_kind,
          venue: be.venue || 'Client Venue',
          package_name: be.bookings?.package_name_snapshot || 'Bridal Makeover',
          bookingNumber: be.bookings?.booking_number,
          rawBookingEvent: be,
        };
      });
    }

    // Normalized combined events array
    const allEvents = [...consultationEvents, ...followUpEvents, ...bookingEvents].sort((a, b) => {
      const dateA = new Date(a.scheduled_start || a.eventDate);
      const dateB = new Date(b.scheduled_start || b.eventDate);
      return dateA.getTime() - dateB.getTime();
    });

    // Monthly Summary Counts
    const counts = {
      totalEvents: allEvents.length,
      consultationsCount: consultationEvents.length,
      followUpsCount: followUpEvents.length,
      bridalBookingsCount: bookingEvents.length,
    };

    // Find nearest upcoming pending follow-up (Next Follow-up)
    const nowUtc = new Date();
    const nextPendingFollowUp = followUpEvents
      .filter((fe) => {
        const dt = new Date(fe.scheduled_start || fe.eventDate);
        return !isNaN(dt.getTime()) && dt >= nowUtc;
      })
      .sort((a, b) => new Date(a.scheduled_start || a.eventDate) - new Date(b.scheduled_start || b.eventDate))[0] || null;

    return {
      view,
      dateRange: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
      counts,
      nextPendingFollowUp,
      calendar: allEvents,
      // Backward compatibility fields
      totalConsultations: consultationEvents.length,
      consultations: consultationEvents.map((c) => c.rawConsultation),
    };
  },

  /**
   * Upcoming consultations query
   */
  async getUpcomingConsultations(businessId, query = {}) {
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 10));
    const days = Math.min(365, Math.max(1, parseInt(query.days, 10) || 30));

    const now = new Date();
    const futureLimit = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const consultations = await prisma.consultations.findMany({
      where: {
        business_id: businessId,
        status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        scheduled_start: {
          gte: now,
          lte: futureLimit,
        },
      },
      take: limit,
      orderBy: { scheduled_start: 'asc' },
      include: {
        customers: {
          select: { id: true, full_name: true, phone: true, email: true },
        },
        enquiries: {
          select: { id: true, customer_name: true, event_kind: true, event_date: true },
        },
      },
    });

    return {
      total: consultations.length,
      timeHorizonDays: days,
      consultations,
    };
  },

  /**
   * Summary metrics for consultation dashboard
   */
  async getConsultationStats(businessId) {
    const now = new Date();

    const [total, upcoming, completed, cancelled, requested, confirmed, rescheduled, noShow] = await Promise.all([
      prisma.consultations.count({
        where: { business_id: businessId },
      }),
      prisma.consultations.count({
        where: {
          business_id: businessId,
          status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
          scheduled_start: { gte: now },
        },
      }),
      prisma.consultations.count({
        where: {
          business_id: businessId,
          status: 'COMPLETED',
        },
      }),
      prisma.consultations.count({
        where: {
          business_id: businessId,
          status: 'CANCELLED',
        },
      }),
      prisma.consultations.count({
        where: { business_id: businessId, status: 'REQUESTED' },
      }),
      prisma.consultations.count({
        where: { business_id: businessId, status: 'CONFIRMED' },
      }),
      prisma.consultations.count({
        where: {
          business_id: businessId,
          OR: [
            { status: 'RESCHEDULED' },
            { consultation_reschedules: { some: {} } },
          ],
        },
      }),
      prisma.consultations.count({
        where: { business_id: businessId, status: 'NO_SHOW' },
      }),
    ]);

    return {
      totalConsultations: total,
      upcomingConsultations: upcoming,
      completedConsultations: completed,
      cancelledConsultations: cancelled,
      breakdown: {
        requested,
        confirmed,
        rescheduled,
        completed,
        cancelled,
        noShow,
      },
    };
  },

  /**
   * Record a consultation outcome as an immutable history record and sync follow-up to Enquiries
   */
  async recordConsultationOutcome(businessId, userId, consultationId, data) {
    const consultation = await prisma.consultations.findFirst({
      where: { id: consultationId, business_id: businessId },
      include: {
        customers: true,
        enquiries: true,
      },
    });

    if (!consultation) {
      throw ApiError.notFound('Consultation not found');
    }

    const {
      outcome_tag,
      feedback_summary,
      agreed_package,
      agreed_services,
      estimated_price_paise,
      follow_up_date,
      intends_to_proceed,
    } = data;

    const followUpDateObj = follow_up_date ? new Date(follow_up_date) : null;
    const estPricePaise =
      estimated_price_paise !== undefined && estimated_price_paise !== null && !isNaN(Number(estimated_price_paise))
        ? BigInt(Math.round(Number(estimated_price_paise)))
        : null;

    let createdOutcome;

    await prisma.$transaction(async (tx) => {
      // 1. Create Consultation Outcome Record
      createdOutcome = await tx.consultation_outcomes.create({
        data: {
          business_id: businessId,
          consultation_id: consultation.id,
          customer_id: consultation.customer_id,
          enquiry_id: consultation.enquiry_id,
          outcome_tag,
          feedback_summary: feedback_summary?.trim() || null,
          agreed_package: agreed_package?.trim() || null,
          agreed_services: agreed_services?.trim() || null,
          estimated_price_paise: estPricePaise,
          follow_up_date: followUpDateObj,
          intends_to_proceed: !!intends_to_proceed,
          recorded_by: userId || null,
        },
      });

      // 2. Mark consultation as COMPLETED and append to readable notes
      const outcomeNoteLine = [
        `\n[OUTCOME RECORDED - ${new Date().toLocaleDateString()}]: ${outcome_tag}`,
        feedback_summary ? `Feedback: ${feedback_summary.trim()}` : null,
        agreed_package ? `Package: ${agreed_package.trim()}` : null,
        estPricePaise ? `Quote: ₹${(Number(estPricePaise) / 100).toLocaleString('en-IN')}` : null,
        followUpDateObj ? `Next Follow-up: ${followUpDateObj.toLocaleDateString()}` : null,
      ]
        .filter(Boolean)
        .join(' | ');

      const newNotes = consultation.notes
        ? `${consultation.notes}\n${outcomeNoteLine}`
        : outcomeNoteLine.trim();

      await tx.consultations.update({
        where: { id: consultation.id },
        data: {
          status: 'COMPLETED',
          notes: newNotes,
          updated_at: new Date(),
        },
      });

      // 3. Connect Next Follow-Up Date to Enquiries
      // If consultation is linked to an enquiry OR if client has an active enquiry
      let targetEnquiryId = consultation.enquiry_id;
      if (!targetEnquiryId && consultation.customer_id) {
        const activeEnquiry = await tx.enquiries.findFirst({
          where: {
            business_id: businessId,
            customer_id: consultation.customer_id,
            status: { notIn: ['CONVERTED', 'LOST'] },
          },
          orderBy: { created_at: 'desc' },
        });
        if (activeEnquiry) {
          targetEnquiryId = activeEnquiry.id;
        }
      }

      if (targetEnquiryId) {
        if (followUpDateObj) {
          // Update Enquiry with the follow-up date and status
          await tx.enquiries.update({
            where: { id: targetEnquiryId },
            data: {
              next_follow_up_at: followUpDateObj,
              status: 'FOLLOW_UP',
              notes: consultation.notes ? `${consultation.notes}\n${outcomeNoteLine}` : outcomeNoteLine.trim(),
              updated_at: new Date(),
            },
          });

          // Check if there is already a pending follow-up activity for this enquiry
          const existingPendingActivity = await tx.enquiry_activities.findFirst({
            where: {
              business_id: businessId,
              enquiry_id: targetEnquiryId,
              activity_type: 'FOLLOW_UP',
              completed_at: null,
            },
            orderBy: { created_at: 'desc' },
          });

          if (existingPendingActivity) {
            // Update the pending follow-up date rather than creating duplicate
            await tx.enquiry_activities.update({
              where: { id: existingPendingActivity.id },
              data: {
                title: `Follow-up: ${outcome_tag}`,
                details: feedback_summary?.trim() || `Consultation outcome: ${outcome_tag}`,
                due_at: followUpDateObj,
              },
            });
          } else {
            // Create a new pending follow-up activity
            await tx.enquiry_activities.create({
              data: {
                business_id: businessId,
                enquiry_id: targetEnquiryId,
                activity_type: 'FOLLOW_UP',
                title: `Follow-up: ${outcome_tag}`,
                details: feedback_summary?.trim() || `Consultation outcome: ${outcome_tag}`,
                due_at: followUpDateObj,
                created_by: userId || null,
              },
            });
          }
        }
      }
    });

    return {
      ...createdOutcome,
      estimated_price_paise: createdOutcome.estimated_price_paise
        ? Number(createdOutcome.estimated_price_paise)
        : null,
    };
  },

  /**
   * List recorded consultation outcomes with filtering, summary cards counts, and pagination
   */
  async listRecordedOutcomes(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };

    if (query.outcome_tag && query.outcome_tag !== 'ALL') {
      where.outcome_tag = query.outcome_tag;
    }

    if (query.intends_to_proceed === 'true') {
      where.intends_to_proceed = true;
    } else if (query.intends_to_proceed === 'false') {
      where.intends_to_proceed = false;
    }

    if (query.has_follow_up === 'true') {
      where.follow_up_date = { not: null };
    } else if (query.has_follow_up === 'false') {
      where.follow_up_date = null;
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (query.follow_up_status === 'today') {
      where.follow_up_date = { gte: startOfToday, lte: endOfToday };
    } else if (query.follow_up_status === 'upcoming') {
      where.follow_up_date = { gt: endOfToday };
    } else if (query.follow_up_status === 'overdue') {
      where.follow_up_date = { lt: startOfToday };
    }

    if (query.startDate || query.endDate) {
      where.created_at = {};
      if (query.startDate) where.created_at.gte = new Date(query.startDate);
      if (query.endDate) where.created_at.lte = new Date(query.endDate);
    }

    if (query.search) {
      const term = query.search.trim();
      where.OR = [
        { feedback_summary: { contains: term, mode: 'insensitive' } },
        { agreed_package: { contains: term, mode: 'insensitive' } },
        { outcome_tag: { contains: term, mode: 'insensitive' } },
        {
          consultations: {
            OR: [
              { requested_name: { contains: term, mode: 'insensitive' } },
              { requested_phone: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
        {
          customers: {
            OR: [
              { full_name: { contains: term, mode: 'insensitive' } },
              { phone: { contains: term, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    // Parallel fetch: paginated list + total matching count + categorical summary cards counts
    const [
      totalMatching,
      items,
      totalAllTime,
      trialApprovedCount,
      changesRequestedCount,
      pkgDiscussionCount,
      needsFollowUpCount,
      readyToBookCount,
      didNotProceedCount,
    ] = await prisma.$transaction([
      prisma.consultation_outcomes.count({ where }),
      prisma.consultation_outcomes.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          consultations: {
            select: {
              id: true,
              requested_name: true,
              requested_phone: true,
              consultation_type: true,
              scheduled_start: true,
              status: true,
              location_name: true,
            },
          },
          customers: {
            select: {
              id: true,
              full_name: true,
              phone: true,
              email: true,
              city: true,
            },
          },
          enquiries: {
            select: {
              id: true,
              status: true,
              next_follow_up_at: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      // Summary cards calculated from actual database records
      prisma.consultation_outcomes.count({ where: { business_id: businessId } }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Trial Approved & Loved Look' },
      }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Changes Requested / Minor Tweaks' },
      }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Package Discussion Pending' },
      }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Client Needs Follow-Up' },
      }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Ready to Book / Advance Invoiced' },
      }),
      prisma.consultation_outcomes.count({
        where: { business_id: businessId, outcome_tag: 'Did Not Proceed' },
      }),
    ]);

    const formattedItems = items.map((outcome) => ({
      ...outcome,
      estimated_price_paise: outcome.estimated_price_paise
        ? Number(outcome.estimated_price_paise)
        : null,
    }));

    return {
      outcomes: formattedItems,
      pagination: {
        page,
        limit,
        total: totalMatching,
        totalPages: Math.ceil(totalMatching / limit),
      },
      counts: {
        total: totalAllTime,
        trialApproved: trialApprovedCount,
        changesRequested: changesRequestedCount,
        packageDiscussion: pkgDiscussionCount,
        needsFollowUp: needsFollowUpCount,
        readyToBook: readyToBookCount,
        didNotProceed: didNotProceedCount,
      },
    };
  },

  /**
   * Public Date & Time Slot Availability for Public Studio Forms & Branded Websites
   * Generates sanitized available consultation slots without exposing private customer data.
   */
  async getPublicConsultationSlots(businessId, dateStr, timezone = 'Asia/Kolkata') {
    if (!dateStr) {
      throw ApiError.badRequest('date parameter is required (YYYY-MM-DD)');
    }

    const cleanDateStr = dateStr.split('T')[0];
    const targetDate = new Date(`${cleanDateStr}T00:00:00.000Z`);
    if (isNaN(targetDate.getTime())) {
      throw ApiError.badRequest('Invalid date format. Expected YYYY-MM-DD');
    }

    // Default studio consultation operational hours: 09:00 to 18:00 (1-hour slots)
    const slotTimes = [
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '14:00',
      '15:00',
      '16:00',
      '17:00',
    ];

    const dayStart = new Date(`${cleanDateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${cleanDateStr}T23:59:59.999Z`);

    // Fetch active consultations on this day (exclude cancelled/no-show)
    const activeConsultations = await prisma.consultations.findMany({
      where: {
        business_id: businessId,
        status: { in: ['REQUESTED', 'CONFIRMED', 'RESCHEDULED'] },
        scheduled_start: { gte: dayStart, lte: dayEnd },
      },
      select: {
        scheduled_start: true,
        scheduled_end: true,
      },
    });

    // Check if the entire date is blocked by full-day wedding bookings
    const activeBookingEvents = await prisma.booking_events.findMany({
      where: {
        business_id: businessId,
        event_date: { gte: dayStart, lte: dayEnd },
        bookings: { status: { in: ['CONFIRMED', 'PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED'] } },
      },
      select: {
        start_time: true,
        end_time: true,
      },
    });

    const isDateFullyBooked = activeBookingEvents.some(be => !be.start_time && !be.end_time);

    const slots = slotTimes.map((timeStr) => {
      const [hStr, mStr] = timeStr.split(':');
      const slotStart = new Date(`${cleanDateStr}T${hStr.padStart(2, '0')}:${mStr.padStart(2, '0')}:00.000Z`);
      const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000); // 1-hour duration

      let isAvailable = !isDateFullyBooked;

      if (isAvailable) {
        // Check collision against existing consultations
        const hasCollision = activeConsultations.some((c) => {
          if (!c.scheduled_start) return false;
          const cStart = new Date(c.scheduled_start);
          const cEnd = c.scheduled_end ? new Date(c.scheduled_end) : new Date(cStart.getTime() + 60 * 60 * 1000);
          return slotStart < cEnd && slotEnd > cStart;
        });

        if (hasCollision) isAvailable = false;
      }

      return {
        time: timeStr,
        display_time: `${Number(hStr) > 12 ? Number(hStr) - 12 : Number(hStr)}:${mStr} ${Number(hStr) >= 12 ? 'PM' : 'AM'}`,
        is_available: isAvailable,
      };
    });

    return {
      date: cleanDateStr,
      timezone,
      is_date_fully_booked: isDateFullyBooked,
      total_slots: slots.length,
      available_slots_count: slots.filter((s) => s.is_available).length,
      slots,
    };
  },
};
