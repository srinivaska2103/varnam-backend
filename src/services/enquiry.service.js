import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { formatWhatsAppMessage } from '../utils/whatsappTemplates.js';
import { bookingService } from './booking.service.js';
import { consultationService } from './consultation.service.js';
import { env } from '../config/env.js';

const VALID_TRANSITIONS = {
  NEW: ['CONTACTED', 'CONSULTATION', 'QUOTATION_SENT', 'FOLLOW_UP', 'CONVERTED', 'LOST'],
  CONTACTED: ['CONSULTATION', 'QUOTATION_SENT', 'FOLLOW_UP', 'CONVERTED', 'LOST'],
  CONSULTATION: ['QUOTATION_SENT', 'FOLLOW_UP', 'CONVERTED', 'LOST'],
  QUOTATION_SENT: ['FOLLOW_UP', 'CONVERTED', 'LOST'],
  FOLLOW_UP: ['CONSULTATION', 'QUOTATION_SENT', 'CONVERTED', 'LOST'],
  CONVERTED: ['CONTACTED', 'CONSULTATION', 'FOLLOW_UP', 'LOST'], // Allowed adjustment
  LOST: ['NEW', 'CONTACTED', 'FOLLOW_UP'], // May be revived
};

export const enquiryService = {
  /**
   * Create a new bridal enquiry, automatically resolving or creating customer
   */
  async createEnquiry(businessId, userId, data) {
    const customerPhone = data.customer_phone;
    const customerName = data.customer_name;

    let customerId = data.customer_id;

    // If customer_id was provided, verify it belongs to the same business
    if (customerId) {
      const cust = await prisma.customers.findFirst({
        where: { id: customerId, business_id: businessId },
      });
      if (!cust) {
        throw ApiError.badRequest('Referenced customer does not belong to this business');
      }
    } else {
      // Find or create customer by phone in this business
      let cust = await prisma.customers.findUnique({
        where: {
          business_id_phone: {
            business_id: businessId,
            phone: customerPhone,
          },
        },
      });

      if (!cust) {
        cust = await prisma.customers.create({
          data: {
            business_id: businessId,
            full_name: customerName,
            phone: customerPhone,
            email: data.customer_email || null,
            created_by: userId,
          },
        });
      }
      customerId = cust.id;
    }

    // Verify assigned user belongs to this business if provided
    if (data.assigned_to) {
      const member = await prisma.business_members.findFirst({
        where: { business_id: businessId, user_id: data.assigned_to, is_active: true },
      });
      if (!member) {
        throw ApiError.badRequest('Assigned team member is not an active member of this business');
      }
    }

    // Verify package if provided
    if (data.selected_package_id) {
      const pkg = await prisma.packages.findFirst({
        where: { id: data.selected_package_id, business_id: businessId },
      });
      if (!pkg) {
        throw ApiError.badRequest('Selected package not found in this business');
      }
    }

    const eventDate = data.event_date ? new Date(data.event_date) : null;
    const nextFollowUp = data.next_follow_up_at ? new Date(data.next_follow_up_at) : null;
    const budgetPaise = data.budget_paise !== undefined && data.budget_paise !== null ? BigInt(data.budget_paise) : null;

    // Create enquiry and initial activity in a transaction
    const enquiry = await prisma.$transaction(async (tx) => {
      const createdEnquiry = await tx.enquiries.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: data.customer_email || null,
          event_kind: data.event_kind || 'WEDDING',
          event_date: eventDate,
          event_venue: data.event_venue || null,
          event_city: data.event_city || null,
          guest_count: data.guest_count !== undefined ? data.guest_count : null,
          budget_paise: budgetPaise,
          source: data.source || 'MANUAL',
          source_reference: data.source_reference || null,
          selected_package_id: data.selected_package_id || null,
          status: 'NEW',
          next_follow_up_at: nextFollowUp,
          notes: data.notes || null,
          assigned_to: data.assigned_to || null,
          custom_answers: data.custom_answers || {},
        },
      });

      // Record initial activity log
      await tx.enquiry_activities.create({
        data: {
          business_id: businessId,
          enquiry_id: createdEnquiry.id,
          activity_type: 'ENQUIRY_CREATED',
          title: `Enquiry received via ${createdEnquiry.source}`,
          details: data.notes || `Initial enquiry for ${createdEnquiry.event_kind}`,
          created_by: userId,
        },
      });

      return createdEnquiry;
    });

    // Fire non-blocking notifications and scheduled follow-ups
    (async () => {
      try {
        console.log('[EnquiryService] Background notification dispatcher started for enquiry:', enquiry.id);
        const biz = await prisma.businesses.findUnique({
          where: { id: businessId },
          select: {
            name: true,
            business_phone: true,
            whatsapp_phone: true,
            business_email: true,
            address_line1: true,
            city: true,
            state: true,
            business_websites: { select: { map_url: true, public_address: true } },
          },
        });

        const bizName = biz?.name || 'Bridal Studio';
        const contactPhone = biz?.phone || biz?.business_phone || biz?.whatsapp_phone;
        const studioAddress = biz?.business_websites?.public_address || [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ') || biz?.address || null;
        const mapUrl = biz?.business_websites?.map_url || null;
        const eventDateFormatted = enquiry.event_date ? enquiry.event_date.toISOString().split('T')[0] : null;
        const submittedTime = new Date().toLocaleString();

        // 1. Notify Customer with acknowledgement if email is present
        if (enquiry.customer_email) {
          try {
            console.log('[EnquiryService] Queuing customer ack email for:', enquiry.customer_email);
            const ackTemplate = emailTemplates.enquiryAcknowledgement({
              customerName: enquiry.customer_name,
              enquiryNumber: enquiry.id.slice(0, 8).toUpperCase(),
              requestedPackage: enquiry.event_kind || 'Bridal Styling',
              eventDate: eventDateFormatted,
              businessName: bizName,
              studioPhone: contactPhone,
              studioEmail: biz?.business_email,
              studioAddress,
              mapUrl,
            });

            const ackJob = await notificationService.queueNotification({
              businessId,
              recipient: enquiry.customer_email,
              channel: 'EMAIL',
              subject: ackTemplate.subject,
              messageBody: ackTemplate.html,
              idempotencyKey: `enq_ack_${enquiry.id}_${enquiry.customer_email}`,
              customerId: enquiry.customer_id,
              enquiryId: enquiry.id,
            });
            if (ackJob) await notificationService.processJob(ackJob.id);

            // Schedule 24-hour follow up reminder
            const followUp1 = emailTemplates.enquiryFollowUp({
              customerName: enquiry.customer_name,
              stepNumber: 1,
              requestedPackage: enquiry.event_kind,
              eventDate: eventDateFormatted,
              businessName: bizName,
              studioPhone: contactPhone,
              studioEmail: biz?.business_email,
            });
            await notificationService.queueNotification({
              businessId,
              recipient: enquiry.customer_email,
              channel: 'EMAIL',
              subject: followUp1.subject,
              messageBody: followUp1.html,
              scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
              idempotencyKey: `enq_fu1_${enquiry.id}`,
              customerId: enquiry.customer_id,
              enquiryId: enquiry.id,
            });
          } catch (emailErr) {
            console.error('[EnquiryService] Customer email notification error:', emailErr.message);
          }
        }

        // 2. Notify Studio Admin / Artist
        if (biz?.business_email) {
          try {
            console.log('[EnquiryService] Queuing admin alert email for:', biz.business_email);
            const adminAlert = emailTemplates.websiteEnquiryAlert({
              customerName: enquiry.customer_name,
              customerPhone: enquiry.customer_phone,
              customerEmail: enquiry.customer_email,
              requestedService: enquiry.event_kind,
              eventType: enquiry.event_kind,
              eventDate: eventDateFormatted,
              submittedTime,
              message: enquiry.notes,
              dashboardUrl: APP_CONFIG.getStudioAdminUrl(biz?.slug, 'enquiries'),
              businessName: bizName,
            });

            const adminJob = await notificationService.queueNotification({
              businessId,
              recipient: biz.business_email,
              channel: 'EMAIL',
              subject: adminAlert.subject,
              messageBody: adminAlert.html,
              idempotencyKey: `enq_admin_alert_${enquiry.id}`,
              enquiryId: enquiry.id,
            });
            if (adminJob) await notificationService.processJob(adminJob.id);
          } catch (adminEmailErr) {
            console.error('[EnquiryService] Admin email notification error:', adminEmailErr.message);
          }
        }

        // 3. WhatsApp Template 1: Customer Enquiry Acknowledgement
        console.log('[EnquiryService] Checking customer phone for WhatsApp ack:', enquiry.customer_phone);
        if (enquiry.customer_phone) {
          try {
            const waAckParams = {
              customer_name: enquiry.customer_name,
              studio_name: bizName,
              event_date: eventDateFormatted || 'To be scheduled',
              service_name: enquiry.event_kind || 'Bridal Makeup',
              studio_location: studioAddress || 'Studio',
            };
            const waAckBody = formatWhatsAppMessage('CUSTOMER_ENQUIRY_ACK', waAckParams);

            console.log('[EnquiryService] Queuing WhatsApp ack for customer:', enquiry.customer_phone);
            const waAckJob = await notificationService.queueNotification({
              businessId,
              recipient: enquiry.customer_phone,
              channel: 'WHATSAPP',
              subject: 'Enquiry Acknowledgement',
              messageBody: waAckBody,
              templateName: 'customer_enquiry_ack',
              templateParams: waAckParams,
              idempotencyKey: `wa_enq_ack_${enquiry.id}_${enquiry.customer_phone}`,
              customerId: enquiry.customer_id,
              enquiryId: enquiry.id,
            });
            console.log('[EnquiryService] waAckJob queued:', waAckJob?.id);
            if (waAckJob) await notificationService.processJob(waAckJob.id);
          } catch (waAckErr) {
            console.error('[EnquiryService] WhatsApp ack error:', waAckErr);
          }
        }

        // 4. WhatsApp Template 2: New Bridal Enquiry Notification to Studio Admin
        const adminWhatsapp = biz?.whatsapp_phone || biz?.business_phone;
        console.log('[EnquiryService] Checking admin phone for WhatsApp alert:', adminWhatsapp);
        if (adminWhatsapp) {
          try {
            const waAdminParams = {
              customer_name: enquiry.customer_name,
              customer_phone: enquiry.customer_phone || 'Not provided',
              event_date: eventDateFormatted || 'To be scheduled',
              service_name: enquiry.event_kind || 'Bridal Services',
            };
            const waAdminBody = formatWhatsAppMessage('ADMIN_ENQUIRY_ALERT', waAdminParams);

            console.log('[EnquiryService] Queuing WhatsApp admin alert for:', adminWhatsapp);
            const waAdminJob = await notificationService.queueNotification({
              businessId,
              recipient: adminWhatsapp,
              channel: 'WHATSAPP',
              subject: 'New Bridal Enquiry Alert',
              messageBody: waAdminBody,
              templateName: 'admin_enquiry_alert',
              templateParams: waAdminParams,
              idempotencyKey: `wa_enq_admin_${enquiry.id}_${adminWhatsapp}`,
              enquiryId: enquiry.id,
            });
            console.log('[EnquiryService] waAdminJob queued:', waAdminJob?.id);
            if (waAdminJob) await notificationService.processJob(waAdminJob.id);
          } catch (waAdminErr) {
            console.error('[EnquiryService] WhatsApp admin error:', waAdminErr);
          }
        }
      } catch (notifyErr) {
        console.error('[EnquiryService] Notification trigger error:', notifyErr);
      }
    })();

    return {
      ...enquiry,
      budget_paise: enquiry.budget_paise ? Number(enquiry.budget_paise) : null,
    };
  },

  /**
   * List enquiries with pagination, search, status, and date filters
   */
  async listEnquiries(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      business_id: businessId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.event_kind) {
      where.event_kind = query.event_kind;
    }

    if (query.source) {
      where.source = { contains: query.source, mode: 'insensitive' };
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { customer_name: { contains: term, mode: 'insensitive' } },
        { customer_phone: { contains: term, mode: 'insensitive' } },
        { customer_email: { contains: term, mode: 'insensitive' } },
        { event_venue: { contains: term, mode: 'insensitive' } },
      ];
    }

    if (query.fromEventDate || query.toEventDate) {
      where.event_date = {};
      if (query.fromEventDate) where.event_date.gte = new Date(query.fromEventDate);
      if (query.toEventDate) where.event_date.lte = new Date(query.toEventDate);
    }

    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, enquiries] = await prisma.$transaction([
      prisma.enquiries.count({ where }),
      prisma.enquiries.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        include: {
          customers: {
            select: {
              id: true,
              full_name: true,
              phone: true,
              email: true,
            },
          },
          packages: {
            select: {
              id: true,
              name: true,
              price_paise: true,
            },
          },
          users: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          notification_jobs: {
            select: {
              id: true,
              channel: true,
              recipient: true,
              status: true,
              template_name: true,
              provider_message_id: true,
              sent_at: true,
              created_at: true,
              error_message: true,
              retry_count: true,
            },
            orderBy: { created_at: 'desc' },
          },
          _count: {
            select: {
              enquiry_activities: true,
              bookings: true,
            },
          },
        },
      }),
    ]);

    const formatted = enquiries.map((e) => {
      const whatsappJobs = (e.notification_jobs || []).filter((j) => j.channel === 'WHATSAPP');
      const adminWaJob = whatsappJobs.find(
        (j) =>
          j.template_name === 'new_enquiry_alert__admin' ||
          j.template_name === 'admin_enquiry_alert' ||
          j.template_name === 'new_enquiry_alert'
      );
      const customerWaJob = whatsappJobs.find(
        (j) =>
          j.template_name === 'new_enquiry_notification' ||
          j.template_name === 'customer_enquiry_ack'
      );

      return {
        ...e,
        // Always prioritize current live customer profile if linked, while preserving historical fallback
        customer_name: e.customers?.full_name || e.customer_name,
        customer_phone: e.customers?.phone || e.customer_phone,
        customer_email: e.customers?.email || e.customer_email,
        budget_paise: e.budget_paise ? Number(e.budget_paise) : null,
        package: e.packages
          ? {
              ...e.packages,
              price_paise: Number(e.packages.price_paise),
            }
          : null,
        packages: undefined,
        assigned_user: e.users,
        users: undefined,
        activities_count: e._count.enquiry_activities,
        bookings_count: e._count.bookings,
        _count: undefined,
        // WhatsApp notification statuses for dashboard
        whatsapp_notifications: {
          admin_alert: adminWaJob || null,
          customer_ack: customerWaJob || null,
          all_jobs: whatsappJobs,
        },
      };
    });

    return {
      enquiries: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single enquiry with complete details, activity timeline, and bookings
   */
  async getEnquiryById(businessId, enquiryId) {
    const enquiry = await prisma.enquiries.findFirst({
      where: {
        id: enquiryId,
        business_id: businessId,
      },
      include: {
        customers: true,
        packages: true,
        users: {
          select: { id: true, name: true, email: true },
        },
        enquiry_activities: {
          orderBy: { created_at: 'desc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
            created_at: true,
          },
        },
        notification_jobs: {
          select: {
            id: true,
            channel: true,
            recipient: true,
            status: true,
            template_name: true,
            provider_message_id: true,
            sent_at: true,
            created_at: true,
            error_message: true,
            retry_count: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!enquiry) {
      throw ApiError.notFound('Enquiry not found in this business');
    }

    const whatsappJobs = (enquiry.notification_jobs || []).filter((j) => j.channel === 'WHATSAPP');
    const adminWaJob = whatsappJobs.find(
      (j) =>
        j.template_name === 'new_enquiry_alert__admin' ||
        j.template_name === 'admin_enquiry_alert' ||
        j.template_name === 'new_enquiry_alert'
    );
    const customerWaJob = whatsappJobs.find(
      (j) =>
        j.template_name === 'new_enquiry_notification' ||
        j.template_name === 'customer_enquiry_ack'
    );

    return {
      ...enquiry,
      // Always prioritize current live customer profile if linked, while preserving historical fallback
      customer_name: enquiry.customers?.full_name || enquiry.customer_name,
      customer_phone: enquiry.customers?.phone || enquiry.customer_phone,
      customer_email: enquiry.customers?.email || enquiry.customer_email,
      budget_paise: enquiry.budget_paise ? Number(enquiry.budget_paise) : null,
      package: enquiry.packages
        ? {
            ...enquiry.packages,
            price_paise: Number(enquiry.packages.price_paise),
          }
        : null,
      packages: undefined,
      assigned_user: enquiry.users,
      users: undefined,
      whatsapp_notifications: {
        admin_alert: adminWaJob || null,
        customer_ack: customerWaJob || null,
        all_jobs: whatsappJobs,
      },
      bookings: enquiry.bookings.map((b) => ({
        ...b,
        total_amount_paise: Number(b.total_amount_paise),
      })),
    };
  },

  /**
   * Update enquiry fields & validate status transitions
   */
  async updateEnquiry(businessId, userId, enquiryId, updateData) {
    const existing = await prisma.enquiries.findFirst({
      where: {
        id: enquiryId,
        business_id: businessId,
      },
    });

    if (!existing) {
      throw ApiError.notFound('Enquiry not found in this business');
    }

    // Validate status transition if status is being updated
    if (updateData.status && updateData.status !== existing.status) {
      const allowedNextStatuses = VALID_TRANSITIONS[existing.status] || [];
      if (!allowedNextStatuses.includes(updateData.status)) {
        throw ApiError.badRequest(
          `Invalid status transition from ${existing.status} to ${updateData.status}. Allowed transitions: ${allowedNextStatuses.join(', ') || 'None'}`
        );
      }
    }

    // Validate assigned user if changed
    if (updateData.assigned_to && updateData.assigned_to !== existing.assigned_to) {
      const member = await prisma.business_members.findFirst({
        where: { business_id: businessId, user_id: updateData.assigned_to, is_active: true },
      });
      if (!member) {
        throw ApiError.badRequest('Assigned team member is not an active member of this business');
      }
    }

    const eventDate = updateData.event_date !== undefined
      ? (updateData.event_date ? new Date(updateData.event_date) : null)
      : existing.event_date;

    const nextFollowUp = updateData.next_follow_up_at !== undefined
      ? (updateData.next_follow_up_at ? new Date(updateData.next_follow_up_at) : null)
      : existing.next_follow_up_at;

    const budgetPaise = updateData.budget_paise !== undefined
      ? (updateData.budget_paise !== null ? BigInt(updateData.budget_paise) : null)
      : existing.budget_paise;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.enquiries.update({
        where: { id: enquiryId },
        data: {
          customer_name: updateData.customer_name ?? existing.customer_name,
          customer_phone: updateData.customer_phone ?? existing.customer_phone,
          customer_email: updateData.customer_email !== undefined ? (updateData.customer_email || null) : existing.customer_email,
          event_kind: updateData.event_kind ?? existing.event_kind,
          event_date: eventDate,
          event_venue: updateData.event_venue !== undefined ? (updateData.event_venue || null) : existing.event_venue,
          event_city: updateData.event_city !== undefined ? (updateData.event_city || null) : existing.event_city,
          guest_count: updateData.guest_count !== undefined ? updateData.guest_count : existing.guest_count,
          budget_paise: budgetPaise,
          source: updateData.source ?? existing.source,
          source_reference: updateData.source_reference !== undefined ? (updateData.source_reference || null) : existing.source_reference,
          selected_package_id: updateData.selected_package_id !== undefined ? updateData.selected_package_id : existing.selected_package_id,
          status: updateData.status ?? existing.status,
          next_follow_up_at: nextFollowUp,
          lost_reason: updateData.lost_reason !== undefined ? (updateData.lost_reason || null) : existing.lost_reason,
          notes: updateData.notes !== undefined ? (updateData.notes || null) : existing.notes,
          assigned_to: updateData.assigned_to !== undefined ? updateData.assigned_to : existing.assigned_to,
          custom_answers: updateData.custom_answers !== undefined ? updateData.custom_answers : existing.custom_answers,
          updated_at: new Date(),
        },
      });

      // Log status change activity if changed
      if (updateData.status && updateData.status !== existing.status) {
        await tx.enquiry_activities.create({
          data: {
            business_id: businessId,
            enquiry_id: enquiryId,
            activity_type: 'STATUS_CHANGE',
            title: `Status changed to ${updateData.status}`,
            details: updateData.lost_reason || `Transitioned from ${existing.status} to ${updateData.status}`,
            created_by: userId,
          },
        });

        // If transitioning to CONSULTATION, automatically initialize a consultation record if none exists
        if (updateData.status === 'CONSULTATION') {
          const existingConsultation = await tx.consultations.findFirst({
            where: { enquiry_id: enquiryId },
          });

          if (!existingConsultation) {
            const start = existing.event_date
              ? new Date(new Date(existing.event_date).getTime() - 14 * 24 * 60 * 60 * 1000)
              : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
            const end = new Date(start.getTime() + 60 * 60 * 1000);

            await tx.consultations.create({
              data: {
                business_id: businessId,
                customer_id: existing.customer_id,
                enquiry_id: enquiryId,
                requested_name: updateData.customer_name || existing.customer_name,
                requested_phone: updateData.customer_phone || existing.customer_phone || '9840123456',
                consultation_type: 'TRIAL',
                status: 'REQUESTED',
                scheduled_start: start,
                scheduled_end: end,
                location_name: updateData.event_venue || existing.event_venue || 'Studio Main Suite',
                notes: existing.notes ? `Enquiry: ${existing.notes}` : 'Bridal trial consultation request',
              },
            });
          }
        }
      }

      return res;
    });

    // If enquiry reached CONVERTED or LOST status, cancel any pending automated follow-up notification jobs
    if (updateData.status && ['CONVERTED', 'LOST'].includes(updateData.status)) {
      notificationService.cancelJobsByReference({
        businessId,
        enquiryId,
        reason: `Enquiry status changed to ${updateData.status}`,
      }).catch((e) => console.error('[EnquiryService] Cancel jobs error:', e.message));
    }

    return {
      ...updated,
      budget_paise: updated.budget_paise ? Number(updated.budget_paise) : null,
    };
  },

  /**
   * Record interaction/activity for an enquiry
   */
  async recordActivity(businessId, userId, enquiryId, activityData) {
    const enquiry = await prisma.enquiries.findFirst({
      where: {
        id: enquiryId,
        business_id: businessId,
      },
    });

    if (!enquiry) {
      throw ApiError.notFound('Enquiry not found in this business');
    }

    const activity = await prisma.enquiry_activities.create({
      data: {
        business_id: businessId,
        enquiry_id: enquiryId,
        activity_type: activityData.activity_type,
        title: activityData.title,
        details: activityData.details || null,
        due_at: activityData.due_at ? new Date(activityData.due_at) : null,
        completed_at: activityData.completed_at ? new Date(activityData.completed_at) : null,
        created_by: userId,
      },
      include: {
        users: {
          select: { id: true, name: true },
        },
      },
    });

    return activity;
  },

  /**
   * Get follow-ups categorized by today, upcoming, overdue
   */
  async getFollowUps(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const now = new Date();
    // Start and end of today in server time
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const baseWhere = {
      business_id: businessId,
    };

    if (query.filter === 'completed') {
      baseWhere.OR = [
        { status: 'CONVERTED' },
        {
          enquiry_activities: {
            some: {
              activity_type: 'FOLLOW_UP',
              completed_at: { not: null },
            },
          },
        },
      ];
    } else {
      // Pending follow-ups
      baseWhere.next_follow_up_at = { not: null };
      baseWhere.status = { notIn: ['CONVERTED', 'LOST'] };

      if (query.filter === 'today') {
        baseWhere.next_follow_up_at = {
          gte: startOfToday,
          lte: endOfToday,
        };
      } else if (query.filter === 'upcoming') {
        baseWhere.next_follow_up_at = {
          gt: endOfToday,
        };
      } else if (query.filter === 'overdue') {
        baseWhere.next_follow_up_at = {
          lt: startOfToday,
        };
      }
    }

    if (query.search) {
      const term = query.search.trim();
      baseWhere.AND = [
        {
          OR: [
            { customer_name: { contains: term, mode: 'insensitive' } },
            { customer_phone: { contains: term, mode: 'insensitive' } },
            { customer_email: { contains: term, mode: 'insensitive' } },
            { notes: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const [total, enquiries, todayCount, upcomingCount, overdueCount, completedCount] = await prisma.$transaction([
      prisma.enquiries.count({ where: baseWhere }),
      prisma.enquiries.findMany({
        where: baseWhere,
        skip,
        take: limit,
        orderBy: {
          next_follow_up_at: 'asc',
        },
        select: {
          id: true,
          customer_id: true,
          customer_name: true,
          customer_phone: true,
          customer_email: true,
          event_kind: true,
          event_date: true,
          status: true,
          next_follow_up_at: true,
          budget_paise: true,
          assigned_to: true,
          notes: true,
          consultations: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              consultation_type: true,
              status: true,
              scheduled_start: true,
            },
          },
          consultation_outcomes: {
            take: 1,
            orderBy: { created_at: 'desc' },
            select: {
              id: true,
              outcome_tag: true,
              feedback_summary: true,
              agreed_package: true,
              follow_up_date: true,
              created_at: true,
            },
          },
          enquiry_activities: {
            where: { activity_type: 'FOLLOW_UP' },
            orderBy: { created_at: 'desc' },
            take: 1,
            select: {
              id: true,
              title: true,
              details: true,
              due_at: true,
              completed_at: true,
            },
          },
        },
      }),
      // Counts for status filters
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          next_follow_up_at: { gte: startOfToday, lte: endOfToday },
        },
      }),
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          next_follow_up_at: { gt: endOfToday },
        },
      }),
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          next_follow_up_at: { lt: startOfToday },
        },
      }),
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          OR: [
            { status: 'CONVERTED' },
            {
              enquiry_activities: {
                some: {
                  activity_type: 'FOLLOW_UP',
                  completed_at: { not: null },
                },
              },
            },
          ],
        },
      }),
    ]);

    const formatted = enquiries.map((e) => {
      const followUpDate = e.next_follow_up_at ? new Date(e.next_follow_up_at) : null;
      let urgency = 'upcoming';
      if (e.status === 'CONVERTED') {
        urgency = 'completed';
      } else if (followUpDate) {
        if (followUpDate < startOfToday) urgency = 'overdue';
        else if (followUpDate <= endOfToday) urgency = 'today';
      } else {
        urgency = 'none';
      }

      const latestOutcome = e.consultation_outcomes?.[0] || null;
      const latestActivity = e.enquiry_activities?.[0] || null;

      return {
        ...e,
        budget_paise: e.budget_paise ? Number(e.budget_paise) : null,
        urgency,
        latestOutcome,
        latestActivity,
        latestConsultation: e.consultations?.[0] || null,
      };
    });

    return {
      followUps: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      counts: {
        all: (todayCount + upcomingCount + overdueCount),
        today: todayCount,
        upcoming: upcomingCount,
        overdue: overdueCount,
        completed: completedCount,
      },
    };
  },

  /**
   * Complete an existing follow-up and optionally schedule the next follow-up atomically
   */
  async completeAndScheduleFollowUp(businessId, userId, enquiryId, data) {
    const enquiry = await prisma.enquiries.findFirst({
      where: { id: enquiryId, business_id: businessId },
    });

    if (!enquiry) {
      throw ApiError.notFound('Enquiry not found');
    }

    const { completion_note, next_follow_up_date } = data;
    const nextDate = next_follow_up_date ? new Date(next_follow_up_date) : null;

    let updatedEnquiry;

    await prisma.$transaction(async (tx) => {
      // 1. Mark existing pending activities as completed
      await tx.enquiry_activities.updateMany({
        where: {
          business_id: businessId,
          enquiry_id: enquiryId,
          activity_type: 'FOLLOW_UP',
          completed_at: null,
        },
        data: {
          completed_at: new Date(),
          details: completion_note ? completion_note.trim() : undefined,
        },
      });

      // 2. Log completion activity
      await tx.enquiry_activities.create({
        data: {
          business_id: businessId,
          enquiry_id: enquiryId,
          activity_type: 'FOLLOW_UP_COMPLETED',
          title: 'Follow-up marked completed',
          details: completion_note?.trim() || 'Follow-up discussion concluded.',
          completed_at: new Date(),
          created_by: userId || null,
        },
      });

      // 3. If next follow-up date is provided, create next pending activity and update enquiry
      if (nextDate) {
        await tx.enquiry_activities.create({
          data: {
            business_id: businessId,
            enquiry_id: enquiryId,
            activity_type: 'FOLLOW_UP',
            title: 'Scheduled next follow-up',
            details: completion_note?.trim() || 'Next follow-up scheduled',
            due_at: nextDate,
            created_by: userId || null,
          },
        });

        updatedEnquiry = await tx.enquiries.update({
          where: { id: enquiryId },
          data: {
            next_follow_up_at: nextDate,
            status: 'FOLLOW_UP',
            updated_at: new Date(),
          },
        });
      } else {
        // Clear next follow-up since this one is concluded
        updatedEnquiry = await tx.enquiries.update({
          where: { id: enquiryId },
          data: {
            next_follow_up_at: null,
            updated_at: new Date(),
          },
        });
      }
    });

    return updatedEnquiry;
  },

  /**
   * Convert an eligible enquiry into a confirmed booking atomically
   */
  async convertEnquiryToBooking(businessId, userId, enquiryId, conversionData = {}) {
    const enquiry = await prisma.enquiries.findFirst({
      where: {
        id: enquiryId,
        business_id: businessId,
      },
      include: {
        customers: true,
        bookings: true,
      },
    });

    if (!enquiry) {
      throw ApiError.notFound('Enquiry not found in this business');
    }

    // Prevent duplicate booking creation
    if (enquiry.status === 'CONVERTED' || (enquiry.bookings && enquiry.bookings.length > 0)) {
      throw ApiError.conflict('This enquiry has already been converted into a booking');
    }

    if (enquiry.status === 'LOST') {
      throw ApiError.badRequest('A lost enquiry cannot be converted into a booking. Reopen it first.');
    }

    // Ensure customer exists
    let customerId = enquiry.customer_id;
    if (!customerId) {
      // Find or create customer
      let cust = await prisma.customers.findUnique({
        where: {
          business_id_phone: {
            business_id: businessId,
            phone: enquiry.customer_phone,
          },
        },
      });

      if (!cust) {
        cust = await prisma.customers.create({
          data: {
            business_id: businessId,
            full_name: enquiry.customer_name,
            phone: enquiry.customer_phone,
            email: enquiry.customer_email || null,
            created_by: userId,
          },
        });
      }
      customerId = cust.id;
    }

    // Determine booking number
    const bookingNumber = conversionData.booking_number || `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    // Package determination
    const packageId = conversionData.package_id || enquiry.selected_package_id || null;
    let packageName = conversionData.package_name_snapshot || null;
    if (packageId && !packageName) {
      const pkg = await prisma.packages.findFirst({ where: { id: packageId, business_id: businessId } });
      if (pkg) packageName = pkg.name;
    }

    // Amount determination
    const totalAmountPaise = conversionData.total_amount_paise !== undefined && conversionData.total_amount_paise !== null
      ? BigInt(conversionData.total_amount_paise)
      : (enquiry.budget_paise || BigInt(0));

    const discountPaise = conversionData.discount_paise ? BigInt(conversionData.discount_paise) : BigInt(0);

    // Atomic conversion transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create confirmed booking
      const booking = await tx.bookings.create({
        data: {
          business_id: businessId,
          customer_id: customerId,
          enquiry_id: enquiryId,
          booking_number: bookingNumber,
          status: 'CONFIRMED',
          package_id: packageId,
          package_name_snapshot: packageName,
          total_amount_paise: totalAmountPaise,
          discount_paise: discountPaise,
          notes: conversionData.notes || enquiry.notes || null,
          created_by: userId,
        },
      });

      // 2. Create initial booking event if enquiry has event date
      if (enquiry.event_date) {
        await tx.booking_events.create({
          data: {
            business_id: businessId,
            booking_id: booking.id,
            event_kind: enquiry.event_kind,
            title: `${enquiry.customer_name} - ${enquiry.event_kind}`,
            event_date: enquiry.event_date,
            venue: enquiry.event_venue || null,
            city: enquiry.event_city || null,
            status: 'SCHEDULED',
          },
        });
      }

      // 3. Update enquiry status to CONVERTED
      const updatedEnquiry = await tx.enquiries.update({
        where: { id: enquiryId },
        data: {
          status: 'CONVERTED',
          customer_id: customerId,
          updated_at: new Date(),
        },
      });

      // 4. Log conversion activity
      await tx.enquiry_activities.create({
        data: {
          business_id: businessId,
          enquiry_id: enquiryId,
          activity_type: 'BOOKING_CONVERTED',
          title: `Converted to Booking #${booking.booking_number}`,
          details: `Booking created with confirmed status. Booking ID: ${booking.id}`,
          created_by: userId,
        },
      });

      return {
        booking,
        enquiry: updatedEnquiry,
      };
    });

    // Cancel pending automated follow-up reminder jobs for this converted enquiry
    notificationService.cancelJobsByReference({
      businessId,
      enquiryId,
      reason: `Enquiry converted into Booking #${result.booking.booking_number}`,
    }).catch((e) => console.error('[EnquiryService] Cancel jobs on conversion error:', e.message));

    // Send Booking Confirmation Notifications (Email & WhatsApp)
    (async () => {
      try {
        const fullBooking = await bookingService.getBookingById(businessId, result.booking.id);
        const biz = await prisma.businesses.findUnique({
          where: { id: businessId },
          select: { name: true, business_email: true, business_phone: true, address_line1: true },
        });
        const bizName = biz?.name || 'Bridal Makeup Studio';
        const primaryEvent = fullBooking.events?.[0];
        const eventDateStr = primaryEvent ? primaryEvent.event_date.toISOString().split('T')[0] : 'To be confirmed';
        const eventTimeStr = primaryEvent?.start_time ? primaryEvent.start_time.substring(0, 5) : '';
        const venueStr = primaryEvent?.venue || primaryEvent?.city || 'Studio / Customer Venue';

        const totalAmt = (fullBooking.payment_summary.net_payable_paise / 100).toFixed(2);
        const advancePaid = (fullBooking.payment_summary.total_paid_paise / 100).toFixed(2);
        const balanceDue = (fullBooking.payment_summary.balance_due_paise / 100).toFixed(2);

        // 1. WhatsApp Confirmation to Customer
        if (fullBooking.customer && fullBooking.customer.phone) {
          const waBookingParams = {
            customer_name: fullBooking.customer.full_name,
            studio_name: bizName,
            event_date: eventDateStr,
            event_time: eventTimeStr || 'To be coordinated',
            package_name: fullBooking.package_name_snapshot || fullBooking.packages?.name || 'Bridal Package',
            event_location: venueStr,
            total_amount: totalAmt,
            amount_paid: advancePaid,
            balance_due: balanceDue,
          };
          const waBookingBody = formatWhatsAppMessage('BOOKING_CONFIRMATION', waBookingParams);

          await notificationService.queueNotification({
            businessId,
            recipient: fullBooking.customer.phone,
            channel: 'WHATSAPP',
            subject: 'Booking Confirmation',
            messageBody: waBookingBody,
            templateName: 'booking_confirmation',
            templateParams: waBookingParams,
            idempotencyKey: `wa_bk_conf_cust_${fullBooking.id}_${fullBooking.customer.phone}`,
            customerId: fullBooking.customer.id,
            bookingId: fullBooking.id,
          }).then((job) => job && notificationService.processJob(job.id));
        }

        // 2. Email Confirmation to Customer
        if (fullBooking.customer && fullBooking.customer.email) {
          const custEmail = emailTemplates.bookingConfirmationCustomer({
            clientName: fullBooking.customer.full_name,
            bookingNumber: fullBooking.booking_number,
            totalAmount: totalAmt,
            advancePaid,
            balanceDue,
            eventDate: eventDateStr,
            eventTime: eventTimeStr,
            venue: venueStr,
            preparationInstructions: primaryEvent?.instructions,
            businessName: bizName,
            studioPhone: biz?.phone,
            studioAddress: biz?.address_line1,
          });

          await notificationService.queueNotification({
            businessId,
            recipient: fullBooking.customer.email,
            channel: 'EMAIL',
            subject: custEmail.subject,
            messageBody: custEmail.html,
            idempotencyKey: `bk_conf_cust_${fullBooking.id}_${fullBooking.customer.email}`,
            customerId: fullBooking.customer.id,
            bookingId: fullBooking.id,
          }).then((job) => job && notificationService.processJob(job.id));
        }
      } catch (notifErr) {
        console.error('[EnquiryService] Booking conversion notification error:', notifErr.message);
      }
    })();

    return {
      booking: {
        ...result.booking,
        total_amount_paise: Number(result.booking.total_amount_paise),
        discount_paise: Number(result.booking.discount_paise),
      },
      enquiry: {
        ...result.enquiry,
        budget_paise: result.enquiry.budget_paise ? Number(result.enquiry.budget_paise) : null,
      },
    };
  },

  // =========================================================================
  // CUSTOM ENQUIRY FORM BUILDER & PUBLIC SUBMISSION
  // =========================================================================

  /**
   * Default starting template fields
   */
  getDefaultFormFields() {
    return [
      { id: 'customer_name', label: 'Full Name', type: 'text', required: true, isSystem: true, placeholder: 'e.g. Deepika Ramesh' },
      { id: 'customer_phone', label: 'Phone Number', type: 'phone', required: true, isSystem: true, placeholder: 'e.g. 9876543210' },
      { id: 'customer_email', label: 'Email Address', type: 'email', required: false, isSystem: true, placeholder: 'bride@example.com' },
      { id: 'event_kind', label: 'Event Type', type: 'select', required: true, isSystem: true, options: ['WEDDING', 'ENGAGEMENT', 'RECEPTION', 'SANGEET', 'MEHENDI', 'HALDI', 'TRIAL', 'OTHER'] },
      { id: 'event_date', label: 'Event Date', type: 'date', required: true, isSystem: true },
      { id: 'event_venue', label: 'Event Location / Venue Name', type: 'text', required: false, isSystem: true, placeholder: 'e.g. Leela Palace Ballroom, Chennai' },
      { id: 'reference_images', label: 'Reference Look / Inspiration Photo', type: 'image_upload', required: false, placeholder: 'Attach inspiration or reference photo (PNG, JPG, WebP)' },
      { id: 'estimated_budget', label: 'Estimated Budget', type: 'select', required: false, options: ['Under ₹15,000', '₹15,000 - ₹30,000', '₹30,000 - ₹50,000', '₹50,000 - ₹1,00,000', 'Above ₹1,00,000'] },
      { id: 'additional_notes', label: 'Additional Requirements / Notes', type: 'textarea', required: false, placeholder: 'Tell us about your preferences, muhurtham timings, etc.' },
    ];
  },

  /**
   * Get authenticated business's enquiry form configuration
   */
  async getFormConfig(businessId) {
    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, logo_url: true, business_phone: true, whatsapp_phone: true, city: true },
    });

    if (!business) {
      throw ApiError.notFound('Business not found');
    }

    let form = await prisma.enquiry_forms.findUnique({
      where: { business_id: businessId },
    });

    if (!form) {
      // Auto-initialize with default template
      const defaultFields = this.getDefaultFormFields();
      form = await prisma.enquiry_forms.create({
        data: {
          business_id: businessId,
          title: `${business.name} — Bridal Enquiry Form`,
          welcome_message: 'Tell us about your special day. Share your details below to schedule your consultation with our bridal studio.',
          submit_button_label: 'Submit Enquiry',
          success_message: 'Thank you for reaching out! Your bridal enquiry has been received. Please review your enquiry details or visit our studio for consultation.',
          status: 'PUBLISHED',
          fields: defaultFields,
        },
      });
    }

    return {
      form,
      business,
      public_slug: business.slug,
    };
  },

  /**
   * Save / update enquiry form configuration
   */
  async updateFormConfig(businessId, data) {
    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, slug: true, logo_url: true },
    });

    if (!business) {
      throw ApiError.notFound('Business not found');
    }

    const form = await prisma.enquiry_forms.upsert({
      where: { business_id: businessId },
      create: {
        business_id: businessId,
        title: data.title || `${business.name} — Bridal Enquiry Form`,
        welcome_message: data.welcome_message || 'Tell us about your special day. Share your details below to schedule your consultation with our bridal studio.',
        submit_button_label: data.submit_button_label || 'Submit Enquiry',
        success_message: data.success_message || 'Thank you for reaching out! Your bridal enquiry has been received. Please review your enquiry details or visit our studio for consultation.',
        status: data.status || 'PUBLISHED',
        fields: data.fields || this.getDefaultFormFields(),
      },
      update: {
        title: data.title,
        welcome_message: data.welcome_message,
        submit_button_label: data.submit_button_label,
        success_message: data.success_message,
        status: data.status,
        fields: data.fields,
        updated_at: new Date(),
      },
    });

    return {
      form,
      business,
      public_slug: business.slug,
    };
  },

  /**
   * Toggle Publish / Unpublish status
   */
  async toggleFormPublishStatus(businessId, status) {
    const updated = await prisma.enquiry_forms.update({
      where: { business_id: businessId },
      data: {
        status,
        updated_at: new Date(),
      },
    });
    return updated;
  },

  /**
   * Resolve public enquiry form by unique business slug (No auth required)
   */
  async getPublicFormBySlug(slug) {
    const normalizedSlug = slug.toLowerCase().trim();

    // Find business either by business slug or website subdomain
    let business = await prisma.businesses.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logo_url: true,
        business_phone: true,
        whatsapp_phone: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
        postal_code: true,
        business_websites: {
          select: {
            map_url: true,
            public_address: true,
            status: true,
          },
        },
      },
    });

    if (!business) {
      const site = await prisma.business_websites.findFirst({
        where: { subdomain: normalizedSlug },
        select: {
          businesses: {
            select: {
              id: true,
              name: true,
              slug: true,
              logo_url: true,
              business_phone: true,
              whatsapp_phone: true,
              address_line1: true,
              address_line2: true,
              city: true,
              state: true,
              postal_code: true,
              business_websites: {
                select: {
                  map_url: true,
                  public_address: true,
                  status: true,
                },
              },
            },
          },
        },
      });
      business = site?.businesses;
    }

    if (!business) {
      throw ApiError.notFound('Studio enquiry form not found');
    }

    let form = await prisma.enquiry_forms.findUnique({
      where: { business_id: business.id },
    });

    // If never created, return active default
    if (!form) {
      form = {
        title: `${business.name} — Bridal Enquiry Form`,
        welcome_message: 'Tell us about your special day. Share your details below to schedule your consultation with our bridal studio.',
        submit_button_label: 'Submit Enquiry',
        success_message: 'Thank you for reaching out! Your bridal enquiry has been received. Please review your enquiry details or visit our studio for consultation.',
        status: 'PUBLISHED',
        fields: this.getDefaultFormFields(),
      };
    }

    if (form.status === 'UNPUBLISHED') {
      throw ApiError.notFound('This studio enquiry form is currently not accepting new submissions');
    }

    return {
      form: {
        title: form.title,
        welcome_message: form.welcome_message,
        submit_button_label: form.submit_button_label,
        success_message: form.success_message,
        status: form.status,
        fields: form.fields,
      },
      business: {
        name: business.name,
        slug: business.slug,
        logo_url: business.logo_url,
        address_line1: business.address_line1,
        address_line2: business.address_line2,
        city: business.city,
        state: business.state,
        postal_code: business.postal_code,
        whatsapp_phone: business.whatsapp_phone,
        business_phone: business.business_phone,
        map_url: business.business_websites?.map_url || null,
        public_address: business.business_websites?.public_address || null,
      },
    };
  },

  /**
   * Submit public enquiry via public form (No auth required)
   */
  async submitPublicForm(slug, submission) {
    const normalizedSlug = slug.toLowerCase().trim();

    const business = await prisma.businesses.findUnique({
      where: { slug: normalizedSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        business_email: true,
        whatsapp_phone: true,
        business_phone: true,
        address_line1: true,
        address_line2: true,
        city: true,
        state: true,
        postal_code: true,
        business_websites: {
          select: {
            map_url: true,
            public_address: true,
          },
        },
      },
    });

    if (!business) {
      throw ApiError.notFound('Studio enquiry form not found');
    }

    const form = await prisma.enquiry_forms.findUnique({
      where: { business_id: business.id },
    });

    if (form && form.status === 'UNPUBLISHED') {
      throw ApiError.badRequest('This enquiry form is currently closed for submissions');
    }

    const customerName = submission.customer_name?.trim();
    const customerPhone = submission.customer_phone?.trim();
    const customerEmail = submission.customer_email?.trim() || null;

    if (!customerName || !customerPhone) {
      throw ApiError.badRequest('Customer name and phone number are required');
    }

    // Server-side validation against form fields configuration
    const configuredFields = form?.fields || this.getDefaultFormFields();
    const customAnswers = submission.custom_answers || {};

    for (const field of configuredFields) {
      if (field.required) {
        if (field.id === 'customer_name' && !customerName) {
          throw ApiError.badRequest(`${field.label} is required`);
        }
        if (field.id === 'customer_phone' && !customerPhone) {
          throw ApiError.badRequest(`${field.label} is required`);
        }
        if (field.id === 'customer_email' && !customerEmail) {
          throw ApiError.badRequest(`${field.label} is required`);
        }
        if (field.id === 'event_date' && !submission.event_date) {
          throw ApiError.badRequest(`${field.label} is required`);
        }
        if (!field.isSystem) {
          const val = customAnswers[field.id];
          if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
            throw ApiError.badRequest(`${field.label} is required`);
          }
        }
      }
    }

    // 1. Resolve or create customer by phone for this business
    let customer = await prisma.customers.findUnique({
      where: {
        business_id_phone: {
          business_id: business.id,
          phone: customerPhone,
        },
      },
    });

    if (!customer) {
      customer = await prisma.customers.create({
        data: {
          business_id: business.id,
          full_name: customerName,
          phone: customerPhone,
          email: customerEmail,
        },
      });
    }

    // 2. Validate date availability & parse event date safely
    let parsedEventDate = null;
    if (submission.event_date) {
      // Backend Validation: Reject booked dates with 409 Conflict
      await bookingService.assertDateAvailable(business.id, submission.event_date);

      try {
        parsedEventDate = new Date(submission.event_date);
      } catch {
        parsedEventDate = null;
      }
    }

    // 3. Compile custom answers summary for notes preview
    const customAnswerLines = [];
    if (customAnswers && typeof customAnswers === 'object') {
      for (const [key, val] of Object.entries(customAnswers)) {
        const matchingField = configuredFields.find((f) => f.id === key);
        const label = matchingField ? matchingField.label : key;
        const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
        if (displayVal.trim()) {
          // If the answer is an image/data URI, do not dump raw base64 string into notes text
          if (displayVal.startsWith('data:image/') || matchingField?.type === 'image_upload' || key === 'reference_images') {
            customAnswerLines.push(`${label}: [Reference Look Attached Photo]`);
          } else {
            customAnswerLines.push(`${label}: ${displayVal}`);
          }
        }
      }
    }

    const notesSummary = customAnswerLines.length > 0
      ? `Public Form Submission:\n${customAnswerLines.join('\n')}`
      : 'Submitted via public enquiry form';

    // 4. Create enquiry record in PostgreSQL
    const enquiry = await prisma.enquiries.create({
      data: {
        business_id: business.id,
        customer_id: customer.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        event_kind: submission.event_kind || 'WEDDING',
        event_date: parsedEventDate,
        event_venue: submission.event_venue || null,
        source: 'PUBLIC_FORM',
        source_reference: `/${business.slug}/enquiry-form`,
        status: 'NEW',
        notes: notesSummary,
        custom_answers: customAnswers,
      },
    });

    // 5. Create activity record
    await prisma.enquiry_activities.create({
      data: {
        business_id: business.id,
        enquiry_id: enquiry.id,
        activity_type: 'PUBLIC_FORM_SUBMITTED',
        title: `Public enquiry form received from ${customerName}`,
        details: notesSummary,
      },
    });

    // 6. Fire customer acknowledgement & admin alert notifications
    (async () => {
      try {
        const contactPhone = business.business_phone || business.whatsapp_phone;
        const studioAddress = business.business_websites?.public_address || [business.address_line1, business.city, business.state].filter(Boolean).join(', ') || null;
        const mapUrl = business.business_websites?.map_url || null;
        const eventDateFormatted = enquiry.event_date ? enquiry.event_date.toISOString().split('T')[0] : null;
        const submittedTime = new Date().toLocaleString();

        // Customer acknowledgement email
        if (customerEmail) {
          const ackTpl = emailTemplates.enquiryAcknowledgement({
            customerName,
            enquiryNumber: enquiry.id.slice(0, 8).toUpperCase(),
            requestedPackage: enquiry.event_kind || 'Bridal Artistry',
            eventDate: eventDateFormatted,
            businessName: business.name,
            studioPhone: contactPhone,
            studioEmail: business.business_email,
            studioAddress,
            mapUrl,
          });

          await notificationService.queueNotification({
            businessId: business.id,
            recipient: customerEmail,
            channel: 'EMAIL',
            subject: ackTpl.subject,
            messageBody: ackTpl.html,
            idempotencyKey: `enq_ack_${enquiry.id}_${customerEmail}`,
            customerId: customer.id,
            enquiryId: enquiry.id,
          }).then((job) => job && notificationService.processJob(job.id));

          // Schedule 24h follow up
          const followUp1 = emailTemplates.enquiryFollowUp({
            customerName,
            stepNumber: 1,
            requestedPackage: enquiry.event_kind,
            eventDate: eventDateFormatted,
            businessName: business.name,
            studioPhone: contactPhone,
            studioEmail: business.business_email,
          });
          await notificationService.queueNotification({
            businessId: business.id,
            recipient: customerEmail,
            channel: 'EMAIL',
            subject: followUp1.subject,
            messageBody: followUp1.html,
            scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            idempotencyKey: `enq_fu1_${enquiry.id}`,
            customerId: customer.id,
            enquiryId: enquiry.id,
          });
        }

        // Admin alert email
        if (business.business_email) {
          const adminAlert = emailTemplates.websiteEnquiryAlert({
            customerName,
            customerPhone,
            customerEmail,
            requestedService: enquiry.event_kind,
            eventType: enquiry.event_kind,
            eventDate: eventDateFormatted,
            submittedTime,
            message: enquiry.notes,
            dashboardUrl: APP_CONFIG.getStudioAdminUrl(business?.slug, 'enquiries'),
            businessName: business.name,
          });

          await notificationService.queueNotification({
            businessId: business.id,
            recipient: business.business_email,
            channel: 'EMAIL',
            subject: adminAlert.subject,
            messageBody: adminAlert.html,
            idempotencyKey: `enq_admin_alert_${enquiry.id}`,
            enquiryId: enquiry.id,
          }).then((job) => job && notificationService.processJob(job.id));
        }

        // WhatsApp Template 1: Customer Enquiry Acknowledgement
        if (customerPhone) {
          try {
            const waAckParams = {
              customer_name: customerName,
              studio_name: business.name,
              event_date: eventDateFormatted || 'To be scheduled',
              service_name: enquiry.event_kind || 'Bridal Makeup',
              studio_location: studioAddress || 'Studio',
            };
            const waAckBody = formatWhatsAppMessage('CUSTOMER_ENQUIRY_ACK', waAckParams);

            await notificationService.queueNotification({
              businessId: business.id,
              recipient: customerPhone,
              channel: 'WHATSAPP',
              subject: 'Enquiry Acknowledgement',
              messageBody: waAckBody,
              templateName: 'customer_enquiry_ack',
              templateParams: waAckParams,
              idempotencyKey: `wa_pub_enq_ack_${enquiry.id}_${customerPhone}`,
              customerId: customer.id,
              enquiryId: enquiry.id,
            }).then((job) => job && notificationService.processJob(job.id));
          } catch (waAckErr) {
            console.error('[PublicEnquiry] Customer WhatsApp ack error:', waAckErr.message);
          }
        }

        // WhatsApp Template 2: New Bridal Enquiry Notification to Studio Admin
        const adminWhatsapp = business.whatsapp_phone || business.business_phone;
        if (adminWhatsapp) {
          try {
            const waAdminParams = {
              customer_name: customerName,
              customer_phone: customerPhone || 'Not provided',
              event_date: eventDateFormatted || 'To be scheduled',
              service_name: enquiry.event_kind || 'Bridal Services',
            };
            const waAdminBody = formatWhatsAppMessage('ADMIN_ENQUIRY_ALERT', waAdminParams);

            await notificationService.queueNotification({
              businessId: business.id,
              recipient: adminWhatsapp,
              channel: 'WHATSAPP',
              subject: 'New Bridal Enquiry Alert',
              messageBody: waAdminBody,
              templateName: 'admin_enquiry_alert',
              templateParams: waAdminParams,
              idempotencyKey: `wa_pub_enq_admin_${enquiry.id}_${adminWhatsapp}`,
              enquiryId: enquiry.id,
            }).then((job) => job && notificationService.processJob(job.id));
          } catch (waAdminErr) {
            console.error('[PublicEnquiry] Admin WhatsApp alert error:', waAdminErr.message);
          }
        }
      } catch (err) {
        console.error('[PublicEnquiry] Notification trigger error:', err.message);
      }
    })();

    return {
      success: true,
      enquiry_id: enquiry.id,
      reference_number: enquiry.id.slice(0, 8).toUpperCase(),
      message: form?.success_message || 'Thank you for reaching out! Your enquiry has been received.',
      submitted_at: enquiry.created_at,
      enquiry: {
        customer_name: enquiry.customer_name,
        customer_phone: enquiry.customer_phone,
        customer_email: enquiry.customer_email,
        event_kind: enquiry.event_kind,
        event_date: enquiry.event_date ? enquiry.event_date.toISOString().split('T')[0] : null,
        event_venue: enquiry.event_venue,
      },
      business: {
        name: business.name,
        slug: business.slug,
        whatsapp_phone: business.whatsapp_phone,
        business_phone: business.business_phone,
        address_line1: business.address_line1,
        address_line2: business.address_line2,
        city: business.city,
        state: business.state,
        postal_code: business.postal_code,
        map_url: business.business_websites?.map_url || null,
        public_address: business.business_websites?.public_address || null,
      },
    };
  },

  /**
   * Resolve business by slug and retrieve unavailable dates without exposing private client info
   */
  async getPublicAvailability(slug, fromDateStr = null, toDateStr = null) {
    const normalizedSlug = slug.toLowerCase().trim();

    let business = await prisma.businesses.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, name: true, slug: true, timezone: true },
    });

    if (!business) {
      const site = await prisma.business_websites.findFirst({
        where: { subdomain: normalizedSlug },
        select: {
          businesses: {
            select: { id: true, name: true, slug: true, timezone: true },
          },
        },
      });
      business = site?.businesses;
    }

    if (!business) {
      throw ApiError.notFound('Studio not found');
    }

    const availability = await bookingService.getBusinessAvailability(business.id, fromDateStr, toDateStr);

    return {
      business_id: business.id,
      business_name: business.name,
      business_slug: business.slug,
      timezone: business.timezone || 'Asia/Kolkata',
      unavailable_dates: availability.unavailable_dates,
    };
  },

  /**
   * Resolve business by slug and retrieve available consultation slots for a specific date
   * Sanitized: returns time slots with availability without disclosing client identities
   */
  async getPublicConsultationSlots(slug, dateStr) {
    const normalizedSlug = slug.toLowerCase().trim();

    let business = await prisma.businesses.findUnique({
      where: { slug: normalizedSlug },
      select: { id: true, name: true, slug: true, timezone: true },
    });

    if (!business) {
      const site = await prisma.business_websites.findFirst({
        where: { subdomain: normalizedSlug },
        select: {
          businesses: {
            select: { id: true, name: true, slug: true, timezone: true },
          },
        },
      });
      business = site?.businesses;
    }

    if (!business) {
      throw ApiError.notFound('Studio not found');
    }

    const slotsData = await consultationService.getPublicConsultationSlots(
      business.id,
      dateStr,
      business.timezone || 'Asia/Kolkata'
    );

    return {
      business_id: business.id,
      business_name: business.name,
      business_slug: business.slug,
      ...slotsData,
    };
  },
};
