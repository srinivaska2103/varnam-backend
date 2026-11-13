import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { APP_CONFIG } from '../config/appConfig.js';
import { formatWhatsAppMessage } from '../utils/whatsappTemplates.js';
import { env } from '../config/env.js';

// Status transition matrix for bookings
const VALID_BOOKING_TRANSITIONS = {
  DRAFT: ['CONFIRMED', 'PLANNING', 'READY', 'CANCELLED'],
  CONFIRMED: ['PLANNING', 'READY', 'IN_PROGRESS', 'POSTPONED', 'COMPLETED', 'CANCELLED'],
  PLANNING: ['CONFIRMED', 'READY', 'IN_PROGRESS', 'POSTPONED', 'COMPLETED', 'CANCELLED'],
  READY: ['CONFIRMED', 'PLANNING', 'IN_PROGRESS', 'COMPLETED', 'POSTPONED', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'PLANNING', 'COMPLETED', 'POSTPONED', 'CANCELLED'],
  POSTPONED: ['CONFIRMED', 'PLANNING', 'READY', 'IN_PROGRESS', 'CANCELLED'],
  COMPLETED: ['CONFIRMED', 'PLANNING', 'READY'], // Re-openable if needed by studio admin
  CANCELLED: ['CONFIRMED', 'PLANNING'], // Re-activatable by studio admin
};

/**
 * Normalizes HH:MM or HH:MM:SS string to Date object on 1970-01-01 for PostgreSQL Time(6) field
 */
function parseTimeString(timeStr) {
  if (!timeStr) return null;
  const parts = timeStr.split(':');
  const d = new Date(Date.UTC(1970, 0, 1, parseInt(parts[0], 10), parseInt(parts[1], 10), parts[2] ? parseInt(parts[2], 10) : 0));
  return d;
}

/**
 * Formats PostgreSQL Time(6) field to HH:MM:SS string
 */
function formatTimeString(timeDate) {
  if (!timeDate) return null;
  const d = new Date(timeDate);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

export const bookingService = {
  /**
   * Conflict Detection Engine
   * Detects if an event on the same event_date overlaps with an existing non-cancelled event in the same business
   */
  async checkEventConflict(businessId, eventDateStr, startTimeStr, endTimeStr, excludeEventId = null) {
    if (!startTimeStr || !endTimeStr) {
      // If times are not specified, it is an all-day or flexible event, no strict time overlap conflict
      return { hasConflict: false };
    }

    const eventDate = new Date(`${eventDateStr}T00:00:00.000Z`);

    // Fetch existing events on the same date for the business excluding cancelled bookings
    const existingEvents = await prisma.booking_events.findMany({
      where: {
        business_id: businessId,
        event_date: eventDate,
        ...(excludeEventId ? { id: { not: excludeEventId } } : {}),
        bookings: {
          status: { not: 'CANCELLED' },
        },
        start_time: { not: null },
        end_time: { not: null },
      },
      include: {
        bookings: {
          select: {
            booking_number: true,
            status: true,
          },
        },
      },
    });

    const newStart = parseTimeString(startTimeStr).getTime();
    const newEnd = parseTimeString(endTimeStr).getTime();

    if (newStart >= newEnd) {
      throw ApiError.badRequest('Event end_time must be later than start_time');
    }

    for (const ev of existingEvents) {
      const evStart = new Date(ev.start_time).getTime();
      const evEnd = new Date(ev.end_time).getTime();

      // Check overlap: (StartA < EndB) and (EndA > StartB)
      if (newStart < evEnd && newEnd > evStart) {
        return {
          hasConflict: true,
          conflictingEvent: {
            id: ev.id,
            title: ev.title,
            bookingNumber: ev.bookings.booking_number,
            eventDate: ev.event_date.toISOString().split('T')[0],
            startTime: formatTimeString(ev.start_time),
            endTime: formatTimeString(ev.end_time),
            venue: ev.venue,
          },
        };
      }
    }

    return { hasConflict: false };
  },

  /**
   * Create a new booking with optional event(s) in a single transaction
   */
  async createBooking(businessId, userId, data) {
    // 1. Verify customer exists and belongs to this business
    const customer = await prisma.customers.findFirst({
      where: {
        id: data.customer_id,
        business_id: businessId,
      },
    });
    if (!customer) {
      throw ApiError.badRequest('Referenced customer does not exist in this business');
    }

    // 2. Verify enquiry if provided
    if (data.enquiry_id) {
      const enquiry = await prisma.enquiries.findFirst({
        where: { id: data.enquiry_id, business_id: businessId },
      });
      if (!enquiry) {
        throw ApiError.badRequest('Referenced enquiry does not exist in this business');
      }
    }

    // 3. Verify package if provided
    let packageName = data.package_name_snapshot || null;
    if (data.package_id) {
      const pkg = await prisma.packages.findFirst({
        where: { id: data.package_id, business_id: businessId },
      });
      if (!pkg) {
        throw ApiError.badRequest('Referenced package does not exist in this business');
      }
      if (!packageName) packageName = pkg.name;
    }

    // 4. Check conflicts for any included events
    const eventsToCreate = [];
    if (data.event) eventsToCreate.push(data.event);
    if (Array.isArray(data.events)) eventsToCreate.push(...data.events);

    for (const ev of eventsToCreate) {
      if (ev.start_time && ev.end_time) {
        const conflict = await this.checkEventConflict(businessId, ev.event_date, ev.start_time, ev.end_time);
        if (conflict.hasConflict) {
          throw ApiError.conflict(
            `Schedule conflict detected: Event overlaps with booking ${conflict.conflictingEvent.bookingNumber} (${conflict.conflictingEvent.title}) from ${conflict.conflictingEvent.startTime} to ${conflict.conflictingEvent.endTime}.`
          );
        }
      }
    }

    const bookingNumber = data.booking_number || `BK-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const totalAmountPaise = BigInt(data.total_amount_paise || 0);
    const discountPaise = BigInt(data.discount_paise || 0);

    const booking = await prisma.$transaction(async (tx) => {
      // Create booking record
      const createdBooking = await tx.bookings.create({
        data: {
          business_id: businessId,
          customer_id: data.customer_id,
          enquiry_id: data.enquiry_id || null,
          booking_number: bookingNumber,
          status: data.status || 'CONFIRMED',
          package_id: data.package_id || null,
          package_name_snapshot: packageName,
          total_amount_paise: totalAmountPaise,
          discount_paise: discountPaise,
          notes: data.notes || null,
          created_by: userId,
        },
      });

      // Create initial status history entry
      await tx.booking_status_history.create({
        data: {
          business_id: businessId,
          booking_id: createdBooking.id,
          old_status: null,
          new_status: createdBooking.status,
          note: 'Booking initial creation',
          changed_by: userId,
        },
      });

      // Create events if provided with concurrency lock & re-check inside transaction
      for (const ev of eventsToCreate) {
        const evDate = new Date(`${ev.event_date}T00:00:00.000Z`);

        // Check if another concurrent transaction confirmed an event on this date/time
        if (ev.start_time && ev.end_time) {
          const conflicting = await tx.booking_events.findFirst({
            where: {
              business_id: businessId,
              event_date: evDate,
              bookings: {
                status: { in: ['CONFIRMED', 'PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED'] },
              },
              start_time: { not: null },
              end_time: { not: null },
            },
          });
          if (conflicting) {
            const conflict = await this.checkEventConflict(businessId, ev.event_date, ev.start_time, ev.end_time);
            if (conflict.hasConflict) {
              throw ApiError.conflict(
                `This date and time was just booked by another client. Please select another slot.`
              );
            }
          }
        }

        await tx.booking_events.create({
          data: {
            business_id: businessId,
            booking_id: createdBooking.id,
            event_kind: ev.event_kind || 'WEDDING',
            title: ev.title || `${customer.full_name} - ${ev.event_kind || 'Event'}`,
            event_date: new Date(`${ev.event_date}T00:00:00.000Z`),
            start_time: parseTimeString(ev.start_time),
            end_time: parseTimeString(ev.end_time),
            venue: ev.venue || null,
            city: ev.city || customer.city || null,
            instructions: ev.instructions || null,
            assigned_user_id: ev.assigned_user_id || null,
            status: 'SCHEDULED',
          },
        });
      }

      return createdBooking;
    });

    const result = await this.getBookingById(businessId, booking.id);

    // Non-blocking notifications for confirmed bookings (only when status is CONFIRMED)
    if (result.status === 'CONFIRMED') {
      (async () => {
        try {
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
          const studioPhone = biz?.business_phone || biz?.whatsapp_phone;
          const studioAddress = biz?.business_websites?.public_address || [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ') || 'Studio';
          const primaryEvent = result.events && result.events.length > 0 ? result.events[0] : null;
          const eventDateStr = primaryEvent ? primaryEvent.event_date : 'Scheduled Dates';
          const eventTimeStr = primaryEvent ? primaryEvent.start_time : '';
          const venueStr = primaryEvent ? primaryEvent.venue : studioAddress;

          const totalAmt = (result.payment_summary.net_payable_paise / 100).toFixed(2);
          const advancePaid = (result.payment_summary.total_paid_paise / 100).toFixed(2);
          const balanceDue = (result.payment_summary.balance_due_paise / 100).toFixed(2);

          // 1. Customer confirmation
          if (result.customer && result.customer.email) {
            const custEmail = emailTemplates.bookingConfirmationCustomer({
              clientName: result.customer.full_name,
              bookingNumber: result.booking_number,
              totalAmount: totalAmt,
              advancePaid,
              balanceDue,
              eventDate: eventDateStr,
              eventTime: eventTimeStr,
              venue: venueStr,
              preparationInstructions: primaryEvent?.instructions,
              businessName: bizName,
              studioPhone,
              studioAddress,
            });

            await notificationService.queueNotification({
              businessId,
              recipient: result.customer.email,
              channel: 'EMAIL',
              subject: custEmail.subject,
              messageBody: custEmail.html,
              idempotencyKey: `bk_conf_cust_${result.id}_${result.customer.email}`,
              customerId: result.customer.id,
              bookingId: result.id,
            }).then((job) => job && notificationService.processJob(job.id));
          }

          // 2. Admin notification
          if (biz?.business_email) {
            const adminEmail = emailTemplates.bookingConfirmationAdmin({
              clientName: result.customer?.full_name || 'Customer',
              bookingNumber: result.booking_number,
              totalAmount: totalAmt,
              paymentStatus: result.payment_summary.is_fully_paid ? 'PAID' : (Number(advancePaid) > 0 ? 'PARTIAL' : 'PENDING'),
              eventDate: eventDateStr,
              dashboardUrl: APP_CONFIG.getStudioAdminUrl(biz?.slug, 'quotations'),
              businessName: bizName,
            });

            await notificationService.queueNotification({
              businessId,
              recipient: biz.business_email,
              channel: 'EMAIL',
              subject: adminEmail.subject,
              messageBody: adminEmail.html,
              idempotencyKey: `bk_conf_admin_${result.id}`,
              bookingId: result.id,
            }).then((job) => job && notificationService.processJob(job.id));
          }

          // 3. WhatsApp Template 3: Booking Confirmation to Customer
          if (result.customer && result.customer.phone) {
            const studioPhone = business.whatsapp_phone || business.business_phone || '';
            const waBookingParams = {
              customer_name: result.customer.full_name,
              studio_name: bizName,
              event_date: eventDateStr,
              event_time: eventTimeStr || 'To be coordinated',
              package_name: result.package_name_snapshot || result.packages?.name || 'Bridal Package',
              event_location: venueStr,
              total_amount: totalAmt,
              amount_paid: advancePaid,
              balance_due: balanceDue,
              phone_number: studioPhone || 'Our Studio',
            };
            const waBookingBody = formatWhatsAppMessage('BOOKING_CONFIRMATION', waBookingParams);

            await notificationService.queueNotification({
              businessId,
              recipient: result.customer.phone,
              channel: 'WHATSAPP',
              subject: 'Booking Confirmation',
              messageBody: waBookingBody,
              templateName: 'booking_confirmation',
              templateParams: waBookingParams,
              idempotencyKey: `wa_bk_conf_cust_${result.id}_${result.customer.phone}`,
              customerId: result.customer.id,
              bookingId: result.id,
            }).then((job) => job && notificationService.processJob(job.id));
          }
        } catch (err) {
          console.error('[BookingService] Notification error:', err.message);
        }
      })();
    }

    return result;
  },

  /**
   * List bookings with search, status, date filtering, and pagination
   */
  async listBookings(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const where = {
      business_id: businessId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { booking_number: { contains: term, mode: 'insensitive' } },
        { customers: { full_name: { contains: term, mode: 'insensitive' } } },
        { customers: { phone: { contains: term, mode: 'insensitive' } } },
      ];
    }

    if (query.event_kind) {
      where.booking_events = {
        some: { event_kind: query.event_kind },
      };
    }

    if (query.startDate || query.endDate) {
      where.booking_events = {
        some: {
          event_date: {
            ...(query.startDate ? { gte: new Date(`${query.startDate}T00:00:00.000Z`) } : {}),
            ...(query.endDate ? { lte: new Date(`${query.endDate}T23:59:59.999Z`) } : {}),
          },
        },
      };
    }

    const sortBy = query.sortBy || 'created_at';
    const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';

    const [total, bookings] = await prisma.$transaction([
      prisma.bookings.count({ where }),
      prisma.bookings.findMany({
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
              city: true,
            },
          },
          booking_events: {
            orderBy: { event_date: 'asc' },
            select: {
              id: true,
              event_kind: true,
              title: true,
              event_date: true,
              start_time: true,
              end_time: true,
              venue: true,
              city: true,
              status: true,
            },
          },
          payment_records: {
            where: { status: 'RECORDED' },
            select: { amount_paise: true },
          },
          _count: {
            select: {
              payment_records: true,
              booking_events: true,
            },
          },
        },
      }),
    ]);

    const formatted = bookings.map((b) => {
      const totalAmount = Number(b.total_amount_paise);
      const discount = Number(b.discount_paise);
      const netPayable = Math.max(0, totalAmount - discount);
      const totalPaid = (b.payment_records || []).reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const balanceDue = Math.max(0, netPayable - totalPaid);

      return {
        id: b.id,
        booking_number: b.booking_number,
        status: b.status,
        package_id: b.package_id,
        package_name_snapshot: b.package_name_snapshot,
        total_amount_paise: totalAmount,
        discount_paise: discount,
        net_payable_paise: netPayable,
        total_paid_paise: totalPaid,
        balance_due_paise: balanceDue,
        is_fully_paid: balanceDue === 0,
        notes: b.notes,
        cancellation_reason: b.cancellation_reason,
        created_at: b.created_at,
        updated_at: b.updated_at,
        customer: b.customers,
        events: b.booking_events.map((ev) => ({
          ...ev,
          event_date: ev.event_date.toISOString().split('T')[0],
          start_time: formatTimeString(ev.start_time),
          end_time: formatTimeString(ev.end_time),
        })),
        events_count: b._count.booking_events,
        payments_count: b._count.payment_records,
      };
    });

    return {
      bookings: formatted,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Summary metrics for booking dashboard
   */
  async getBookingStats(businessId) {
    const now = new Date();
    const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [allBookings, upcomingEvents] = await prisma.$transaction([
      prisma.bookings.findMany({
        where: { business_id: businessId },
        select: {
          id: true,
          status: true,
          total_amount_paise: true,
          discount_paise: true,
          payment_records: {
            where: { status: 'RECORDED' },
            select: { amount_paise: true },
          },
        },
      }),
      prisma.booking_events.findMany({
        where: {
          business_id: businessId,
          event_date: { gte: todayMidnight },
          bookings: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
        },
        select: { id: true },
      }),
    ]);

    let totalBookings = 0;
    let confirmedBookings = 0;
    let pendingBookings = 0;
    let totalAgreedPaise = 0;
    let totalPaidPaise = 0;
    let totalOutstandingPaise = 0;

    for (const b of allBookings) {
      if (b.status === 'CANCELLED') continue;

      totalBookings++;

      if (b.status === 'CONFIRMED' || b.status === 'PLANNING' || b.status === 'READY' || b.status === 'IN_PROGRESS') {
        confirmedBookings++;
      } else if (b.status === 'DRAFT' || b.status === 'POSTPONED') {
        pendingBookings++;
      }

      const totalAmount = Number(b.total_amount_paise);
      const discount = Number(b.discount_paise);
      const netPayable = Math.max(0, totalAmount - discount);
      const paid = (b.payment_records || []).reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const outstanding = Math.max(0, netPayable - paid);

      totalAgreedPaise += netPayable;
      totalPaidPaise += paid;
      totalOutstandingPaise += outstanding;
    }

    return {
      total_bookings: totalBookings,
      upcoming_weddings: upcomingEvents.length,
      confirmed_bookings: confirmedBookings,
      pending_bookings: pendingBookings,
      total_agreed_paise: totalAgreedPaise,
      total_paid_paise: totalPaidPaise,
      total_outstanding_paise: totalOutstandingPaise,
    };
  },

  /**
   * Get single booking details with customer, events, package, status history, and payments
   */
  async getBookingById(businessId, bookingId) {
    const booking = await prisma.bookings.findFirst({
      where: {
        id: bookingId,
        business_id: businessId,
      },
      include: {
        customers: true,
        packages: {
          include: {
            package_services: {
              include: {
                services: true,
              },
            },
          },
        },
        enquiries: {
          select: {
            id: true,
            source: true,
            budget_paise: true,
          },
        },
        booking_events: {
          orderBy: { event_date: 'asc' },
          include: {
            users: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
        booking_status_history: {
          orderBy: { changed_at: 'desc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
        payment_records: {
          orderBy: { paid_at: 'desc' },
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    // Calculate payment summary
    const totalAmount = Number(booking.total_amount_paise);
    const discount = Number(booking.discount_paise);
    const netPayable = Math.max(0, totalAmount - discount);

    let totalPaid = 0;
    let totalRefunded = 0;
    let totalPendingRefunds = 0;
    for (const p of booking.payment_records) {
      if (p.status === 'RECORDED') {
        totalPaid += Number(p.amount_paise);
      } else if (p.status === 'REFUNDED') {
        totalRefunded += Number(p.amount_paise);
      } else if (p.status === 'PENDING_REFUND') {
        totalPendingRefunds += Number(p.amount_paise);
      }
    }
    const netReceived = Math.max(0, totalPaid - totalRefunded);
    const balanceDue = Math.max(0, netPayable - netReceived);
    const approvedRefundable = Number(booking.approved_refundable_paise || 0);
    const remainingRefundBalance = Math.max(0, Math.min(approvedRefundable - totalRefunded - totalPendingRefunds, totalPaid - totalRefunded - totalPendingRefunds));

    let refundBadge = 'NOT_ELIGIBLE';
    if (booking.status === 'CANCELLED') {
      if (totalPaid === 0) {
        refundBadge = 'NOT_ELIGIBLE';
      } else if (approvedRefundable === 0) {
        refundBadge = 'APPROVAL_REQUIRED';
      } else if (totalRefunded >= approvedRefundable && approvedRefundable > 0) {
        refundBadge = 'REFUNDED';
      } else if (totalPendingRefunds > 0) {
        refundBadge = 'REFUND_PENDING';
      } else if (totalRefunded > 0 && totalRefunded < approvedRefundable) {
        refundBadge = 'PARTIALLY_REFUNDED';
      } else {
        refundBadge = 'REFUND_PENDING';
      }
    }

    return {
      id: booking.id,
      booking_number: booking.booking_number,
      status: booking.status,
      package_id: booking.package_id,
      package_name_snapshot: booking.package_name_snapshot,
      total_amount_paise: totalAmount,
      discount_paise: discount,
      net_payable_paise: netPayable,
      approved_refundable_paise: approvedRefundable,
      refund_approval_notes: booking.refund_approval_notes,
      refund_approved_at: booking.refund_approved_at,
      refund_status: refundBadge,
      notes: booking.notes,
      cancellation_reason: booking.cancellation_reason,
      created_at: booking.created_at,
      updated_at: booking.updated_at,
      customer: booking.customers,
      enquiry: booking.enquiries
        ? {
            ...booking.enquiries,
            budget_paise: booking.enquiries.budget_paise ? Number(booking.enquiries.budget_paise) : null,
          }
        : null,
      package: booking.packages
        ? {
            id: booking.packages.id,
            name: booking.packages.name,
            price_paise: Number(booking.packages.price_paise),
            services: booking.packages.package_services.map((ps) => ({
              service_name: ps.service_name_snapshot,
              quantity: ps.quantity,
              duration_minutes: ps.services?.duration_minutes || null,
            })),
          }
        : null,
      events: booking.booking_events.map((ev) => ({
        id: ev.id,
        event_kind: ev.event_kind,
        title: ev.title,
        event_date: ev.event_date.toISOString().split('T')[0],
        start_time: formatTimeString(ev.start_time),
        end_time: formatTimeString(ev.end_time),
        venue: ev.venue,
        city: ev.city,
        status: ev.status,
        instructions: ev.instructions,
        assigned_artist: ev.users,
      })),
      status_history: booking.booking_status_history.map((h) => ({
        id: h.id,
        old_status: h.old_status,
        new_status: h.new_status,
        note: h.note,
        changed_by: h.users?.name || 'System',
        changed_at: h.changed_at,
      })),
      payment_summary: {
        total_amount_paise: totalAmount,
        discount_paise: discount,
        net_payable_paise: netPayable,
        total_paid_paise: totalPaid,
        total_refunded_paise: totalRefunded,
        total_pending_refunds_paise: totalPendingRefunds,
        approved_refundable_paise: approvedRefundable,
        remaining_refund_balance_paise: remainingRefundBalance,
        net_received_paise: netReceived,
        balance_due_paise: balanceDue,
        currency: 'INR',
        is_fully_paid: balanceDue === 0,
      },
      payments: booking.payment_records.map((p) => ({
        id: p.id,
        amount_paise: Number(p.amount_paise),
        method: p.method,
        status: p.status,
        paid_at: p.paid_at,
        receipt_number: p.receipt_number,
        reference_note: p.reference_note,
        notes: p.notes,
      })),
    };
  },

  /**
   * Update permitted booking profile fields
   */
  async updateBooking(businessId, bookingId, data) {
    const existing = await prisma.bookings.findFirst({
      where: { id: bookingId, business_id: businessId },
    });
    if (!existing) {
      throw ApiError.notFound('Booking not found in this business');
    }

    if (existing.status === 'CANCELLED' || existing.status === 'COMPLETED') {
      throw ApiError.badRequest(`Cannot modify a booking in ${existing.status} status`);
    }

    let packageName = data.package_name_snapshot || existing.package_name_snapshot;
    if (data.package_id && data.package_id !== existing.package_id) {
      const pkg = await prisma.packages.findFirst({ where: { id: data.package_id, business_id: businessId } });
      if (!pkg) throw ApiError.badRequest('Referenced package does not exist in this business');
      packageName = pkg.name;
    }

    await prisma.bookings.update({
      where: { id: bookingId },
      data: {
        package_id: data.package_id !== undefined ? data.package_id : existing.package_id,
        package_name_snapshot: packageName,
        total_amount_paise: data.total_amount_paise !== undefined ? BigInt(data.total_amount_paise) : existing.total_amount_paise,
        discount_paise: data.discount_paise !== undefined ? BigInt(data.discount_paise) : existing.discount_paise,
        notes: data.notes !== undefined ? data.notes : existing.notes,
        updated_at: new Date(),
      },
    });

    return this.getBookingById(businessId, bookingId);
  },

  /**
   * Update booking status with validation and audit logging
   */
  async updateBookingStatus(businessId, userId, bookingId, data) {
    const existing = await prisma.bookings.findFirst({
      where: { id: bookingId, business_id: businessId },
    });
    if (!existing) {
      throw ApiError.notFound('Booking not found in this business');
    }

    if (existing.status === data.status) {
      return this.getBookingById(businessId, bookingId);
    }

    const allowed = VALID_BOOKING_TRANSITIONS[existing.status] || [];
    if (!allowed.includes(data.status)) {
      throw ApiError.badRequest(
        `Invalid status transition from ${existing.status} to ${data.status}. Allowed next statuses: ${allowed.join(', ') || 'None'}`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.bookings.update({
        where: { id: bookingId },
        data: {
          status: data.status,
          cancellation_reason: data.status === 'CANCELLED' ? (data.cancellation_reason || data.note || 'Cancelled by studio') : existing.cancellation_reason,
          updated_at: new Date(),
        },
      });

      await tx.booking_status_history.create({
        data: {
          business_id: businessId,
          booking_id: bookingId,
          old_status: existing.status,
          new_status: data.status,
          note: data.note || `Transitioned to ${data.status}`,
          changed_by: userId,
        },
      });
    });

    const updatedBooking = await this.getBookingById(businessId, bookingId);

    // If transitioned to CONFIRMED status, send confirmation notifications idempotently
    if (data.status === 'CONFIRMED' && existing.status !== 'CONFIRMED') {
      (async () => {
        try {
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
          const studioPhone = biz?.business_phone || biz?.whatsapp_phone;
          const studioAddress = biz?.business_websites?.public_address || [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ') || 'Studio';
          const primaryEvent = updatedBooking.events && updatedBooking.events.length > 0 ? updatedBooking.events[0] : null;
          const eventDateStr = primaryEvent ? primaryEvent.event_date : 'Scheduled Dates';
          const eventTimeStr = primaryEvent ? primaryEvent.start_time : '';
          const venueStr = primaryEvent ? primaryEvent.venue : studioAddress;

          const totalAmt = (updatedBooking.payment_summary.net_payable_paise / 100).toFixed(2);
          const advancePaid = (updatedBooking.payment_summary.total_paid_paise / 100).toFixed(2);
          const balanceDue = (updatedBooking.payment_summary.balance_due_paise / 100).toFixed(2);

          // 1. Customer confirmation
          if (updatedBooking.customer && updatedBooking.customer.email) {
            const custEmail = emailTemplates.bookingConfirmationCustomer({
              clientName: updatedBooking.customer.full_name,
              bookingNumber: updatedBooking.booking_number,
              totalAmount: totalAmt,
              advancePaid,
              balanceDue,
              eventDate: eventDateStr,
              eventTime: eventTimeStr,
              venue: venueStr,
              preparationInstructions: primaryEvent?.instructions,
              businessName: bizName,
              studioPhone,
              studioAddress,
            });

            await notificationService.queueNotification({
              businessId,
              recipient: updatedBooking.customer.email,
              channel: 'EMAIL',
              subject: custEmail.subject,
              messageBody: custEmail.html,
              idempotencyKey: `bk_conf_cust_${updatedBooking.id}_${updatedBooking.customer.email}`,
              customerId: updatedBooking.customer.id,
              bookingId: updatedBooking.id,
            }).then((job) => job && notificationService.processJob(job.id));
          }

          // 2. Admin notification
          if (biz?.business_email) {
            const adminEmail = emailTemplates.bookingConfirmationAdmin({
              clientName: updatedBooking.customer?.full_name || 'Customer',
              bookingNumber: updatedBooking.booking_number,
              totalAmount: totalAmt,
              paymentStatus: updatedBooking.payment_summary.is_fully_paid ? 'PAID' : (Number(advancePaid) > 0 ? 'PARTIAL' : 'PENDING'),
              eventDate: eventDateStr,
              dashboardUrl: APP_CONFIG.getStudioAdminUrl(biz?.slug, 'quotations'),
              businessName: bizName,
            });

            await notificationService.queueNotification({
              businessId,
              recipient: biz.business_email,
              channel: 'EMAIL',
              subject: adminEmail.subject,
              messageBody: adminEmail.html,
              idempotencyKey: `bk_conf_admin_${updatedBooking.id}`,
              bookingId: updatedBooking.id,
            }).then((job) => job && notificationService.processJob(job.id));
          }

          // 3. WhatsApp: Booking Confirmation Payment Reminder (Workflow 1)
          if (updatedBooking.customer && updatedBooking.customer.phone) {
            // Check customer opt-out from marketing/automated communications
            const isOptedOut = await prisma.marketing_unsubscribes.findFirst({
              where: {
                business_id: businessId,
                email: updatedBooking.customer.email || undefined,
              },
            });

            if (!isOptedOut) {
              const studioPhone = business.whatsapp_phone || business.business_phone || '';
              const waPaymentReminderParams = {
                customer_name: updatedBooking.customer.full_name,
                studio_name: bizName,
                event_date: eventDateStr,
                event_time: eventTimeStr || 'To be coordinated',
                package_name: updatedBooking.package_name_snapshot || updatedBooking.packages?.name || 'Bridal Package',
                event_location: venueStr,
                total_amount: totalAmt,
                amount_paid: advancePaid,
                balance_due: balanceDue,
                phone_number: studioPhone || 'Our Studio',
              };

              const waPaymentReminderBody = formatWhatsAppMessage(
                'BOOKING_CONFIRMATION_PAYMENT_REMINDER',
                waPaymentReminderParams
              );

              // Unique confirmation event key: using updated_at or status transition timestamp to allow reconfirmations after cancellation
              const confTimestamp = new Date(updatedBooking.updated_at).getTime();
              const idempotencyKey = `wa_bk_conf_pay_rem_${updatedBooking.id}_${confTimestamp}`;

              await notificationService.queueNotification({
                businessId,
                recipient: updatedBooking.customer.phone,
                channel: 'WHATSAPP',
                subject: `Booking Confirmation & Payment Info: #${updatedBooking.booking_number}`,
                messageBody: waPaymentReminderBody,
                templateName: 'booking_confirmation__customer',
                templateParams: waPaymentReminderParams,
                idempotencyKey,
                customerId: updatedBooking.customer.id,
                bookingId: updatedBooking.id,
                notificationType: 'BOOKING_CONFIRMATION_PAYMENT_REMINDER',
              }).then((job) => job && notificationService.processJob(job.id));
            }
          }
        } catch (err) {
          console.error('[BookingService] Notification error on status transition:', err.message);
        }
      })();
    }

    return updatedBooking;
  },

  /**
   * Cancel booking safely without deleting financial or operational history
   */
  async cancelBooking(businessId, userId, bookingId, cancellationData) {
    const existing = await prisma.bookings.findFirst({
      where: { id: bookingId, business_id: businessId },
    });
    if (!existing) {
      throw ApiError.notFound('Booking not found in this business');
    }

    if (existing.status === 'CANCELLED') {
      throw ApiError.badRequest('Booking is already cancelled');
    }

    if (existing.status === 'COMPLETED') {
      throw ApiError.badRequest('Completed booking cannot be cancelled');
    }

    const approvedPaise = cancellationData.approved_refundable_paise !== undefined && cancellationData.approved_refundable_paise !== null
      ? BigInt(cancellationData.approved_refundable_paise)
      : BigInt(0);

    await prisma.$transaction(async (tx) => {
      await tx.bookings.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancellation_reason: cancellationData.cancellation_reason,
          approved_refundable_paise: approvedPaise,
          refund_approval_notes: cancellationData.refund_approval_notes || null,
          refund_approved_by: approvedPaise > BigInt(0) ? userId : null,
          refund_approved_at: approvedPaise > BigInt(0) ? new Date() : null,
          updated_at: new Date(),
        },
      });

      await tx.booking_status_history.create({
        data: {
          business_id: businessId,
          booking_id: bookingId,
          old_status: existing.status,
          new_status: 'CANCELLED',
          note: cancellationData.note || cancellationData.cancellation_reason,
          changed_by: userId,
        },
      });
    });

    // Cancel any pending notification jobs associated with this cancelled booking
    notificationService.cancelJobsByReference({
      businessId,
      bookingId,
      reason: `Booking cancelled: ${cancellationData.cancellation_reason || 'Cancelled'}`,
    }).catch((e) => console.error('[BookingService] Error cancelling jobs for booking:', e.message));

    // Workflow #4: Dispatch Booking Cancellation Email to Customer
    (async () => {
      try {
        const fullBooking = await this.getBookingById(businessId, bookingId);
        const custEmail = fullBooking.customer?.email;
        if (!custEmail) return;

        const biz = await prisma.businesses.findUnique({
          where: { id: businessId },
          select: { name: true, business_email: true, business_phone: true, logo_url: true, slug: true },
        });

        const bizName = biz?.name || 'Bridal Studio';
        const primaryEvent = (fullBooking.events || [])[0];
        const eventDateStr = primaryEvent?.event_date
          ? new Date(primaryEvent.event_date).toISOString().split('T')[0]
          : 'Scheduled Date';
        const cancellationDateStr = new Date().toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });

        const bookingTotal = (Number(fullBooking.total_amount_paise || 0) / 100).toFixed(2);
        const totalPaid = (Number(fullBooking.total_paid_paise || 0) / 100).toFixed(2);
        const approvedRefund = Number(fullBooking.approved_refundable_paise || 0) > 0
          ? (Number(fullBooking.approved_refundable_paise) / 100).toFixed(2)
          : null;

        const template = emailTemplates.bookingCancellationCustomer({
          clientName: fullBooking.customer?.full_name || 'Valued Customer',
          studioName: bizName,
          logoUrl: biz?.logo_url || null,
          bookingNumber: fullBooking.booking_number,
          originalEventDateStr: eventDateStr,
          bookingAmount: bookingTotal,
          amountPaid: totalPaid,
          cancellationDateStr,
          refundAmount: approvedRefund,
          refundStatus: approvedRefund ? 'Approved / In Process' : null,
          studioPhone: biz?.business_phone,
          studioEmail: biz?.business_email,
        });

        const job = await notificationService.queueNotification({
          businessId,
          recipient: custEmail,
          channel: 'EMAIL',
          subject: template.subject,
          messageBody: template.html,
          idempotencyKey: `booking_cancel_email_${bookingId}_${new Date().toISOString().split('T')[0]}`,
          customerId: fullBooking.customer_id,
          bookingId: fullBooking.id,
          notificationType: 'TRANSACTIONAL',
          templateName: 'booking_cancellation_customer',
          templateParams: {
            bookingNumber: fullBooking.booking_number,
            originalEventDateStr: eventDateStr,
            bookingAmount: bookingTotal,
            amountPaid: totalPaid,
          },
        });

        if (job) {
          await notificationService.processJob(job.id);
        }
      } catch (err) {
        console.error('[BookingService] Failed to send cancellation email:', err.message);
      }
    })();

    return this.getBookingById(businessId, bookingId);
  },

  /**
   * Add a new wedding/ceremony event to an existing booking
   */
  async addBookingEvent(businessId, bookingId, eventData) {
    const booking = await prisma.bookings.findFirst({
      where: { id: bookingId, business_id: businessId },
      include: { customers: true },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    if (booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      throw ApiError.badRequest(`Cannot add events to a booking in ${booking.status} status`);
    }

    // Check conflict
    if (eventData.start_time && eventData.end_time) {
      const conflict = await this.checkEventConflict(businessId, eventData.event_date, eventData.start_time, eventData.end_time);
      if (conflict.hasConflict) {
        throw ApiError.conflict(
          `Schedule conflict: Overlaps with booking ${conflict.conflictingEvent.bookingNumber} (${conflict.conflictingEvent.title}) from ${conflict.conflictingEvent.startTime} to ${conflict.conflictingEvent.endTime}.`
        );
      }
    }

    const event = await prisma.booking_events.create({
      data: {
        business_id: businessId,
        booking_id: bookingId,
        event_kind: eventData.event_kind || 'WEDDING',
        title: eventData.title || `${booking.customers.full_name} - ${eventData.event_kind || 'Event'}`,
        event_date: new Date(`${eventData.event_date}T00:00:00.000Z`),
        start_time: parseTimeString(eventData.start_time),
        end_time: parseTimeString(eventData.end_time),
        venue: eventData.venue || null,
        city: eventData.city || booking.customers.city || null,
        instructions: eventData.instructions || null,
        assigned_user_id: eventData.assigned_user_id || null,
        status: 'SCHEDULED',
      },
      include: {
        users: { select: { id: true, name: true, phone: true } },
      },
    });

    return {
      ...event,
      event_date: event.event_date.toISOString().split('T')[0],
      start_time: formatTimeString(event.start_time),
      end_time: formatTimeString(event.end_time),
      assigned_artist: event.users,
    };
  },

  /**
   * Calendar API: Retrieve events in date range for day/week/month views
   */
  async getCalendarEvents(businessId, query) {
    const startDate = new Date(`${query.startDate}T00:00:00.000Z`);
    const endDate = new Date(`${query.endDate}T23:59:59.999Z`);

    if (startDate > endDate) {
      throw ApiError.badRequest('startDate cannot be after endDate');
    }

    const where = {
      business_id: businessId,
      event_date: {
        gte: startDate,
        lte: endDate,
      },
      bookings: {
        status: query.status ? query.status : { not: 'CANCELLED' },
      },
    };

    const events = await prisma.booking_events.findMany({
      where,
      orderBy: [
        { event_date: 'asc' },
        { start_time: 'asc' },
      ],
      include: {
        bookings: {
          select: {
            id: true,
            booking_number: true,
            status: true,
            total_amount_paise: true,
            customers: {
              select: {
                id: true,
                full_name: true,
                phone: true,
              },
            },
          },
        },
        users: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const formattedEvents = events.map((ev) => ({
      id: ev.id,
      booking_id: ev.booking_id,
      booking_number: ev.bookings.booking_number,
      booking_status: ev.bookings.status,
      customer_name: ev.bookings.customers.full_name,
      customer_phone: ev.bookings.customers.phone,
      event_kind: ev.event_kind,
      title: ev.title,
      event_date: ev.event_date.toISOString().split('T')[0],
      start_time: formatTimeString(ev.start_time),
      end_time: formatTimeString(ev.end_time),
      venue: ev.venue,
      city: ev.city,
      status: ev.status,
      assigned_artist: ev.users?.name || null,
    }));

    return {
      view: query.view || 'month',
      startDate: query.startDate,
      endDate: query.endDate,
      totalEvents: formattedEvents.length,
      events: formattedEvents,
    };
  },

  /**
   * Retrieve standalone payments for a booking
   */
  async getBookingPayments(businessId, bookingId) {
    const booking = await prisma.bookings.findFirst({
      where: { id: bookingId, business_id: businessId },
      include: {
        payment_records: {
          orderBy: { paid_at: 'desc' },
          include: {
            users: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!booking) {
      throw ApiError.notFound('Booking not found in this business');
    }

    const totalAmount = Number(booking.total_amount_paise);
    const discount = Number(booking.discount_paise);
    const netPayable = Math.max(0, totalAmount - discount);

    let totalCollected = 0;
    let totalRefunded = 0;

    for (const p of booking.payment_records) {
      if (p.status === 'RECORDED') {
        totalCollected += Number(p.amount_paise);
      } else if (p.status === 'REFUNDED') {
        totalRefunded += Number(p.amount_paise);
      }
    }

    const netReceived = Math.max(0, totalCollected - totalRefunded);
    const balanceDue = Math.max(0, netPayable - netReceived);

    return {
      booking_id: booking.id,
      booking_number: booking.booking_number,
      booking_status: booking.status,
      payment_summary: {
        total_amount_paise: totalAmount,
        discount_paise: discount,
        net_payable_paise: netPayable,
        total_collected_paise: totalCollected,
        total_refunded_paise: totalRefunded,
        net_received_paise: netReceived,
        total_paid_paise: totalCollected, // alias for backwards compatibility
        balance_due_paise: balanceDue,
        currency: 'INR',
        is_fully_paid: balanceDue === 0,
      },
      payments: booking.payment_records.map((p) => ({
        id: p.id,
        amount_paise: Number(p.amount_paise),
        method: p.method,
        status: p.status,
        paid_at: p.paid_at,
        receipt_number: p.receipt_number,
        reference_note: p.reference_note,
        notes: p.notes,
        recorded_by: p.users?.name || null,
      })),
    };
  },

  /**
   * Date Availability Engine
   * Fetches unavailable (booked) dates for a business within a date range [from, to].
   * Blocking criteria:
   * 1. Confirmed or in-progress or completed bookings (CONFIRMED, PLANNING, READY, IN_PROGRESS, COMPLETED)
   * 2. Any booking_events under active bookings on that date
   * Excludes: CANCELLED, POSTPONED, DRAFT bookings
   * Returns: list of unavailable YYYY-MM-DD strings without sensitive client info
   */
  async getBusinessAvailability(businessId, fromDateStr = null, toDateStr = null) {
    const blockingStatuses = ['CONFIRMED', 'PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED'];

    // Default range: today through 18 months ahead if not provided
    const now = new Date();
    const fromDate = fromDateStr ? new Date(`${fromDateStr.split('T')[0]}T00:00:00.000Z`) : new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const toDate = toDateStr ? new Date(`${toDateStr.split('T')[0]}T23:59:59.999Z`) : new Date(Date.UTC(now.getFullYear(), now.getMonth() + 18, 0, 23, 59, 59, 999));

    // Fetch booking events under active bookings
    const activeEvents = await prisma.booking_events.findMany({
      where: {
        business_id: businessId,
        event_date: {
          gte: fromDate,
          lte: toDate,
        },
        bookings: {
          status: { in: blockingStatuses },
        },
      },
      select: {
        event_date: true,
      },
    });

    const unavailableDatesSet = new Set();

    for (const ev of activeEvents) {
      if (ev.event_date) {
        // Format as YYYY-MM-DD
        const dateStr = ev.event_date.toISOString().split('T')[0];
        unavailableDatesSet.add(dateStr);
      }
    }

    return {
      unavailable_dates: Array.from(unavailableDatesSet).sort(),
    };
  },

  /**
   * Validates whether a specific date is available for booking/enquiry in a business.
   * Throws 409 ApiError.conflict if date is already booked.
   */
  async assertDateAvailable(businessId, dateStr) {
    if (!dateStr) return true;
    const cleanDateStr = dateStr.split('T')[0];
    const targetDate = new Date(`${cleanDateStr}T00:00:00.000Z`);

    const blockingStatuses = ['CONFIRMED', 'PLANNING', 'READY', 'IN_PROGRESS', 'COMPLETED'];

    const conflict = await prisma.booking_events.findFirst({
      where: {
        business_id: businessId,
        event_date: targetDate,
        bookings: {
          status: { in: blockingStatuses },
        },
      },
      select: {
        id: true,
        event_date: true,
      },
    });

    if (conflict) {
      throw ApiError.conflict('This date is already booked. Please select another available date.');
    }

    return true;
  },
};
