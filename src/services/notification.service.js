import prisma from '../config/prisma.js';
import { transporter } from '../config/mailer.js';
import { env } from '../config/env.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { ApiError } from '../utils/apiResponse.js';
import { whatsappService } from './whatsapp.service.js';
import { WHATSAPP_TEMPLATES, formatWhatsAppMessage } from '../utils/whatsappTemplates.js';
import { APP_CONFIG } from '../config/appConfig.js';

export const notificationService = {
  /**
   * Queue a notification job in PostgreSQL `notification_jobs`
   */
  async queueNotification({
    businessId,
    recipient,
    channel = 'EMAIL',
    subject,
    messageBody,
    scheduledAt = new Date(),
    idempotencyKey = null,
    customerId = null,
    bookingId = null,
    enquiryId = null,
    consultationId = null,
    campaignId = null,
    notificationType = 'TRANSACTIONAL',
    templateName = null,
    templateParams = null,
  }) {
    if (!recipient) return null;

    // Check if idempotencyKey already exists
    if (idempotencyKey) {
      const existing = await prisma.notification_jobs.findUnique({
        where: { idempotency_key: idempotencyKey },
      });
      if (existing) {
        return existing;
      }
    }

    const job = await prisma.notification_jobs.create({
      data: {
        business_id: businessId,
        recipient,
        channel,
        subject,
        message_body: messageBody,
        status: 'QUEUED',
        scheduled_at: scheduledAt,
        idempotency_key: idempotencyKey,
        customer_id: customerId,
        booking_id: bookingId,
        enquiry_id: enquiryId,
        consultation_id: consultationId,
        campaign_id: campaignId,
        notification_type: notificationType,
        template_name: templateName,
        template_params: templateParams || {},
      },
    });

    return job;
  },

  /**
   * Process a single queued notification job with delivery tracking & bounded retries
   */
  async processJob(jobId) {
    const job = await prisma.notification_jobs.findUnique({
      where: { id: jobId },
      include: {
        businesses: { select: { id: true, name: true, business_email: true } },
        bookings: { select: { id: true, status: true } },
        consultations: { select: { id: true, status: true } },
      },
    });

    if (!job || job.status === 'SENT' || job.status === 'CANCELLED') {
      return job;
    }

    // Safety checks: If associated booking or consultation was cancelled, cancel notification
    if (job.bookings && job.bookings.status === 'CANCELLED') {
      return prisma.notification_jobs.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', error_message: 'Associated booking was cancelled' },
      });
    }

    if (job.consultations && job.consultations.status === 'CANCELLED') {
      return prisma.notification_jobs.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', error_message: 'Associated consultation was cancelled' },
      });
    }

    // Dynamic recipient re-validation against latest customer profile
    let effectiveRecipient = job.recipient;
    if (job.customer_id) {
      try {
        const latestCustomer = await prisma.customers.findUnique({
          where: { id: job.customer_id },
          select: { phone: true, email: true },
        });
        if (latestCustomer) {
          if (job.channel === 'WHATSAPP' && latestCustomer.phone) {
            effectiveRecipient = latestCustomer.phone;
          } else if (job.channel === 'EMAIL' && latestCustomer.email) {
            effectiveRecipient = latestCustomer.email;
          }
        }
      } catch (custErr) {
        console.warn(`[NotificationService] Customer lookup warning for job ${job.id}:`, custErr.message);
      }
    }

    // Deliver via Email
    if (job.channel === 'EMAIL') {
      try {
        const fromAddress = env.SMTP_FROM || `VEXA TECH <${env.SMTP_USER}>`;

        // If in test mode, simulate successful send without hitting external SMTP
        let messageId = `simulated-${Date.now()}`;
        const isTest = env.NODE_ENV === 'test' || process.env.NODE_ENV === 'test';
        if (!isTest && env.SMTP_PASS && env.SMTP_USER) {
          const info = await transporter.sendMail({
            from: fromAddress,
            to: effectiveRecipient,
            subject: job.subject || 'Notification from Bridal Studio',
            html: job.message_body,
            text: job.message_body.replace(/<[^>]*>?/gm, ''), // fallback plain text
          });
          messageId = info.messageId;
        }

        const updated = await prisma.notification_jobs.update({
          where: { id: jobId },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            provider_message_id: messageId,
            error_message: null,
          },
        });

        return updated;
      } catch (err) {
        const nextRetry = job.retry_count + 1;
        const isMaxRetries = nextRetry >= 3;

        // Exponential backoff: Retry 1 in 1 min, Retry 2 in 4 min
        const backoffDelayMs = Math.pow(nextRetry, 2) * 60 * 1000;
        const nextScheduledAt = new Date(Date.now() + backoffDelayMs);

        // Sanitize error message to prevent leaking secrets, credentials, or DB tokens
        const safeErrorMessage = (err.message || 'Email delivery failed')
          .replace(/[a-zA-Z0-9+/=]{24,}/g, '[REDACTED]')
          .replace(/password[:=]\s*\S+/gi, 'password:[REDACTED]');

        const updated = await prisma.notification_jobs.update({
          where: { id: jobId },
          data: {
            status: isMaxRetries ? 'FAILED' : 'QUEUED',
            retry_count: nextRetry,
            scheduled_at: isMaxRetries ? job.scheduled_at : nextScheduledAt,
            error_message: safeErrorMessage,
          },
        });

        return updated;
      }
    }

    // Deliver via WhatsApp
    if (job.channel === 'WHATSAPP') {
      try {
        const sendResult = await whatsappService.sendMessage({
          to: effectiveRecipient,
          templateKey: job.template_name,
          params: (typeof job.template_params === 'object' && job.template_params !== null) ? job.template_params : {},
          fallbackText: job.message_body,
        });

        const updated = await prisma.notification_jobs.update({
          where: { id: jobId },
          data: {
            status: 'SENT',
            sent_at: new Date(),
            provider_message_id: sendResult.provider_message_id,
            error_message: null,
            channel_response: sendResult.raw_response || { simulated: sendResult.simulated },
          },
        });

        return updated;
      } catch (err) {
        const nextRetry = job.retry_count + 1;
        const isMaxRetries = nextRetry >= 3;
        const backoffDelayMs = Math.pow(nextRetry, 2) * 60 * 1000;
        const nextScheduledAt = new Date(Date.now() + backoffDelayMs);

        const safeErrorMessage = (err.message || 'WhatsApp delivery failed')
          .replace(/[a-zA-Z0-9+/=]{24,}/g, '[REDACTED]')
          .replace(/Bearer\s+[^\s]+/gi, 'Bearer [REDACTED]');

        const updated = await prisma.notification_jobs.update({
          where: { id: jobId },
          data: {
            status: isMaxRetries ? 'FAILED' : 'QUEUED',
            retry_count: nextRetry,
            scheduled_at: isMaxRetries ? job.scheduled_at : nextScheduledAt,
            error_message: safeErrorMessage,
          },
        });

        return updated;
      }
    }

    return job;
  },

  /**
   * Process all pending queued jobs that are due using atomic claiming
   */
  async processDueJobs(limit = 20) {
    // Atomically find and mark jobs as PROCESSING (or lock them) to prevent duplicate execution across workers
    const dueJobs = await prisma.$transaction(async (tx) => {
      const candidates = await tx.notification_jobs.findMany({
        where: {
          status: 'QUEUED',
          scheduled_at: { lte: new Date() },
          retry_count: { lt: 3 },
        },
        take: limit,
        orderBy: { scheduled_at: 'asc' },
      });

      if (!candidates || candidates.length === 0) return [];

      // Update their scheduled_at into the future temporarily or claim them to avoid concurrent worker collision
      const jobIds = candidates.map((c) => c.id);
      await tx.notification_jobs.updateMany({
        where: { id: { in: jobIds }, status: 'QUEUED' },
        data: { scheduled_at: new Date(Date.now() + 60000) }, // 1 min lease
      });

      return candidates;
    });

    const results = [];
    for (const job of dueJobs) {
      const res = await this.processJob(job.id);
      results.push(res);
    }
    return results;
  },

  /**
   * List notification jobs / activity history for a business
   */
  async listNotifications(businessId, { status, channel, search, sortBy = 'newest', page = 1, limit = 50 } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const where = {
      business_id: businessId,
      ...(status ? { status } : {}),
      ...(channel ? { channel } : {}),
    };

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { subject: { contains: q, mode: 'insensitive' } },
        { recipient: { contains: q, mode: 'insensitive' } },
        { message_body: { contains: q, mode: 'insensitive' } },
      ];
    }

    let orderBy = { created_at: 'desc' };
    if (sortBy === 'oldest') {
      orderBy = { created_at: 'asc' };
    } else if (sortBy === 'scheduled') {
      orderBy = { scheduled_at: 'desc' };
    }

    const [total, notifications] = await Promise.all([
      prisma.notification_jobs.count({ where }),
      prisma.notification_jobs.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy,
        include: {
          bookings: { select: { id: true, booking_number: true, status: true } },
          consultations: { select: { id: true, requested_name: true, status: true } },
          customers: { select: { id: true, full_name: true, phone: true } },
          enquiries: { select: { id: true, customer_name: true, status: true } },
        },
      }),
    ]);

    return {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
      notifications,
    };
  },

  /**
   * Get notification statistics & counts for summary cards
   */
  async getNotificationSummary(businessId) {
    const counts = await prisma.notification_jobs.groupBy({
      by: ['status'],
      where: { business_id: businessId },
      _count: { _all: true },
    });

    let total = 0;
    let pending = 0;
    let sent = 0;
    let failed = 0;
    let unread = 0; // In this schema, SENT notifications awaiting acknowledgement/read status

    for (const c of counts) {
      const cnt = c._count._all;
      total += cnt;
      if (c.status === 'QUEUED') pending += cnt;
      else if (c.status === 'SENT') {
        sent += cnt;
        unread += cnt; // awaiting read
      } else if (c.status === 'DELIVERED') {
        sent += cnt; // delivered is considered successfully sent & read
      } else if (c.status === 'FAILED') failed += cnt;
    }

    return {
      total_notifications: total,
      pending_notifications: pending,
      sent_notifications: sent,
      failed_notifications: failed,
      unread_notifications: unread,
    };
  },

  /**
   * Mark a single notification job as read / acknowledged
   */
  async markAsRead(businessId, notificationId) {
    const notification = await prisma.notification_jobs.findFirst({
      where: { id: notificationId, business_id: businessId },
    });

    if (!notification) {
      throw new ApiError(404, 'Notification not found or access denied');
    }

    const updated = await prisma.notification_jobs.update({
      where: { id: notificationId },
      data: {
        status: 'DELIVERED',
        opened_at: notification.opened_at || new Date(),
      },
    });

    return updated;
  },

  /**
   * Mark all notifications for a business as read / acknowledged
   */
  async markAllAsRead(businessId) {
    const result = await prisma.notification_jobs.updateMany({
      where: {
        business_id: businessId,
        status: { in: ['SENT', 'QUEUED'] },
      },
      data: {
        status: 'DELIVERED',
        opened_at: new Date(),
      },
    });

    return { updated_count: result.count };
  },

  /**
   * Retry an eligible FAILED notification job for a business
   */
  async retryFailedJob(businessId, jobId) {
    const job = await prisma.notification_jobs.findFirst({
      where: { id: jobId, business_id: businessId },
    });

    if (!job) {
      throw new ApiError(404, 'Notification job not found or access denied');
    }

    if (job.status !== 'FAILED') {
      throw new ApiError(400, `Only FAILED jobs can be retried. Current status is ${job.status}`);
    }

    // Reset status to QUEUED and reset retry_count for a clean retry attempt
    await prisma.notification_jobs.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        retry_count: 0,
        scheduled_at: new Date(),
        error_message: null,
      },
    });

    // Immediately trigger processing
    const processed = await this.processJob(jobId);
    return processed;
  },

  /**
   * Get notification preferences for a business
   */
  async getPreferences(businessId) {
    const preferences = await prisma.notification_preferences.findMany({
      where: { business_id: businessId },
    });

    // If none exist yet, return defaults
    if (preferences.length === 0) {
      return [
        { event_key: 'NEW_ENQUIRY', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: false },
        { event_key: 'BOOKING_CONFIRMED', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: true },
        { event_key: 'CONSULTATION_SCHEDULED', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: true },
        { event_key: 'PAYMENT_RECORDED', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: true },
        { event_key: 'LOW_STOCK_ALERT', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: false },
        { event_key: 'UPCOMING_EVENT_REMINDER', channel: 'EMAIL', enabled: true, send_to_artist: true, send_to_customer: true },
      ];
    }

    return preferences;
  },

  /**
   * Upsert notification preferences
   */
  async updatePreferences(businessId, preferencesList) {
    const results = [];
    for (const p of preferencesList) {
      const upserted = await prisma.notification_preferences.upsert({
        where: {
          business_id_event_key_channel: {
            business_id: businessId,
            event_key: p.event_key,
            channel: p.channel || 'EMAIL',
          },
        },
        create: {
          business_id: businessId,
          event_key: p.event_key,
          channel: p.channel || 'EMAIL',
          enabled: p.enabled ?? true,
          send_to_artist: p.send_to_artist ?? true,
          send_to_customer: p.send_to_customer ?? false,
          minutes_before: p.minutes_before || null,
        },
        update: {
          enabled: p.enabled ?? true,
          send_to_artist: p.send_to_artist ?? true,
          send_to_customer: p.send_to_customer ?? false,
          minutes_before: p.minutes_before || null,
        },
      });
      results.push(upserted);
    }

    return results;
  },

  /**
   * Helper: Trigger event notification based on business preferences
   */
  async triggerEventNotification({
    businessId,
    eventKey,
    recipientEmail,
    subject,
    htmlBody,
    idempotencyKey = null,
    bookingId = null,
    enquiryId = null,
    consultationId = null,
    customerId = null,
  }) {
    // Check if preference is enabled
    const pref = await prisma.notification_preferences.findUnique({
      where: {
        business_id_event_key_channel: {
          business_id: businessId,
          event_key: eventKey,
          channel: 'EMAIL',
        },
      },
    });

    if (pref && !pref.enabled) {
      return null; // Disabled by business user
    }

    const job = await this.queueNotification({
      businessId,
      recipient: recipientEmail,
      channel: 'EMAIL',
      subject,
      messageBody: htmlBody,
      idempotencyKey,
      bookingId,
      enquiryId,
      consultationId,
      customerId,
    });

    // Attempt immediate delivery if queued
    if (job) {
      await this.processJob(job.id);
    }

    return job;
  },

  /**
   * Cancel pending notification jobs matching a reference (e.g. when booking/enquiry is converted or cancelled)
   */
  async cancelJobsByReference({ businessId, enquiryId = null, bookingId = null, consultationId = null, reason = 'Event cancelled or updated' }) {
    const where = {
      business_id: businessId,
      status: 'QUEUED',
    };

    if (enquiryId) where.enquiry_id = enquiryId;
    if (bookingId) where.booking_id = bookingId;
    if (consultationId) where.consultation_id = consultationId;

    const result = await prisma.notification_jobs.updateMany({
      where,
      data: {
        status: 'CANCELLED',
        error_message: reason,
      },
    });

    return result;
  },

  /**
   * Check and queue 2-day Event Preparation reminders for bookings occurring in ~2 days
   */
  async checkAndScheduleEventPrepReminders() {
    const now = new Date();
    // 2 days from now window: 48h to 72h
    const twoDaysFromNow = new Date(now.getTime() + 48 * 60 * 60 * 1000);
    const threeDaysFromNow = new Date(now.getTime() + 72 * 60 * 60 * 1000);

    const upcomingEvents = await prisma.booking_events.findMany({
      where: {
        event_date: {
          gte: twoDaysFromNow,
          lte: threeDaysFromNow,
        },
        bookings: {
          status: { in: ['CONFIRMED', 'PLANNING', 'READY'] },
        },
      },
      include: {
        bookings: {
          include: {
            customers: true,
            businesses: true,
            payment_records: true,
          },
        },
      },
    });

    for (const ev of upcomingEvents) {
      const b = ev.bookings;
      if (!b || !b.customers) continue;

      const totalAmount = Number(b.total_amount_paise);
      const discount = Number(b.discount_paise);
      const netPayable = Math.max(0, totalAmount - discount);
      const totalPaid = (b.payment_records || []).reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const balanceDue = Math.max(0, netPayable - totalPaid);

      const eventDateStr = ev.event_date.toISOString().split('T')[0];
      const custEmail = b.customers.email;
      const bizEmail = b.businesses.business_email;

      // Customer reminder
      if (custEmail) {
        const custIdempotency = `event_prep_cust_${ev.id}_${eventDateStr}`;
        const template = emailTemplates.eventPreparationCustomer({
          clientName: b.customers.full_name,
          eventTitle: ev.title || 'Bridal Event',
          eventDate: eventDateStr,
          eventTime: ev.start_time ? new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          venue: ev.venue || b.businesses.address_line1 || 'Studio',
          preparationInstructions: ev.instructions,
          businessName: b.businesses.name,
          studioPhone: b.businesses.business_phone || b.businesses.whatsapp_phone,
          mapUrl: null,
        });

        await this.queueNotification({
          businessId: b.business_id,
          recipient: custEmail,
          channel: 'EMAIL',
          subject: template.subject,
          messageBody: template.html,
          idempotencyKey: custIdempotency,
          customerId: b.customer_id,
          bookingId: b.id,
        });
      }

      // Admin alert
      if (bizEmail) {
        const adminIdempotency = `event_prep_admin_${ev.id}_${eventDateStr}`;
        const studioSlug = b.businesses?.slug || 'srinivasbridalstudio';
        const adminTemplate = emailTemplates.eventPreparationAdmin({
          clientName: b.customers.full_name,
          eventTitle: ev.title || 'Bridal Event',
          eventDate: eventDateStr,
          eventTime: ev.start_time ? new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null,
          venue: ev.venue || 'Studio',
          balanceDue: (balanceDue / 100).toFixed(2),
          dashboardUrl: APP_CONFIG.getStudioAdminUrl(studioSlug, `bookings/${b.id}`),
          businessName: b.businesses.name,
        });

        await this.queueNotification({
          businessId: b.business_id,
          recipient: bizEmail,
          channel: 'EMAIL',
          subject: adminTemplate.subject,
          messageBody: adminTemplate.html,
          idempotencyKey: adminIdempotency,
          bookingId: b.id,
        });
      }

      // 3. WhatsApp Template 6: Event Preparation Reminder (Customer)
      const custPhone = b.customers.phone;
      const studioPhone = b.businesses.whatsapp_phone || b.businesses.business_phone || '';
      if (custPhone) {
        const pkgName = b.package_name_snapshot || b.packages?.name || ev.title || 'Bridal Package';
        const venueStr = ev.venue || b.businesses.address_line1 || 'Studio';
        const waCustParams = {
          customer_name: b.customers.full_name,
          studio_name: b.businesses.name,
          event_date: eventDateStr,
          package_name: pkgName,
          event_location: venueStr,
          phone_number: studioPhone || 'Our Studio',
        };
        const waCustBody = formatWhatsAppMessage('EVENT_PREPARATION_REMINDER', waCustParams);

        await this.queueNotification({
          businessId: b.business_id,
          recipient: custPhone,
          channel: 'WHATSAPP',
          subject: 'Event Preparation Reminder',
          messageBody: waCustBody,
          templateName: 'event_preparation_reminder',
          templateParams: waCustParams,
          idempotencyKey: `wa_event_prep_cust_${ev.id}_${eventDateStr}`,
          customerId: b.customer_id,
          bookingId: b.id,
        });
      }

      // 4. WhatsApp Template 6: Event Preparation Reminder (Admin)
      const adminPhone = b.businesses.whatsapp_phone || b.businesses.business_phone;
      if (adminPhone) {
        const pkgName = b.package_name_snapshot || b.packages?.name || ev.title || 'Bridal Package';
        const venueStr = ev.venue || b.businesses.address_line1 || 'Studio';
        const waAdminParams = {
          customer_name: b.customers.full_name,
          studio_name: b.businesses.name,
          event_date: eventDateStr,
          package_name: pkgName,
          event_location: venueStr,
          phone_number: adminPhone || 'Our Studio',
        };
        const waAdminBody = formatWhatsAppMessage('EVENT_PREPARATION_REMINDER', waAdminParams);

        await this.queueNotification({
          businessId: b.business_id,
          recipient: adminPhone,
          channel: 'WHATSAPP',
          subject: 'Event Preparation Reminder (Admin)',
          messageBody: waAdminBody,
          templateName: 'event_preparation_reminder',
          templateParams: waAdminParams,
          idempotencyKey: `wa_event_prep_admin_${ev.id}_${eventDateStr}`,
          bookingId: b.id,
        });
      }
    }
  },

  /**
   * Check and queue Balance Payment reminders for bookings with real outstanding balances
   * Workflow #3: Exactly two days after the bridal event ends
   */
  async checkAndScheduleBalanceReminders() {
    const now = new Date();
    // 1. Two days after event completion window: event occurred between 48h and 72h ago
    const twoDaysAgoStart = new Date(now.getTime() - 72 * 60 * 60 * 1000);
    const twoDaysAgoEnd = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const postEventBookings = await prisma.bookings.findMany({
      where: {
        status: { not: 'CANCELLED' },
        booking_events: {
          some: {
            event_date: {
              gte: twoDaysAgoStart,
              lte: twoDaysAgoEnd,
            },
          },
        },
      },
      include: {
        customers: true,
        businesses: true,
        payment_records: true,
        booking_events: { orderBy: { event_date: 'desc' }, take: 1 },
      },
    });

    for (const b of postEventBookings) {
      if (!b.customers?.email || b.status === 'CANCELLED') continue;

      const totalAmount = Number(b.total_amount_paise);
      const discount = Number(b.discount_paise);
      const netPayable = Math.max(0, totalAmount - discount);
      const totalPaid = (b.payment_records || [])
        .filter((p) => p.status === 'RECORDED')
        .reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const balanceDue = Math.max(0, netPayable - totalPaid);

      if (balanceDue <= 0) {
        continue; // Fully paid, do not send
      }

      const lastEvent = b.booking_events[0];
      const eventDateStr = lastEvent ? lastEvent.event_date.toISOString().split('T')[0] : 'Completed Event';
      const balanceFormatted = (balanceDue / 100).toFixed(2);
      const totalAmountFormatted = (totalAmount / 100).toFixed(2);
      const totalPaidFormatted = (totalPaid / 100).toFixed(2);

      const idempotencyKey = `pending_balance_2d_${b.id}_${eventDateStr}`;

      const template = emailTemplates.pendingBalancePostEventCustomer({
        clientName: b.customers.full_name,
        studioName: b.businesses.name,
        logoUrl: b.businesses.logo_url || null,
        bookingNumber: b.booking_number,
        eventCompletionDateStr: eventDateStr,
        totalBookingAmount: totalAmountFormatted,
        amountPaid: totalPaidFormatted,
        remainingBalance: balanceFormatted,
        paymentInstructions: 'Kindly remit the pending balance via UPI / Bank Transfer or visit our studio desk to clear your invoice.',
        studioPhone: b.businesses.business_phone,
        studioEmail: b.businesses.business_email,
      });

      await this.queueNotification({
        businessId: b.business_id,
        recipient: b.customers.email,
        channel: 'EMAIL',
        subject: template.subject,
        messageBody: template.html,
        idempotencyKey,
        customerId: b.customer_id,
        bookingId: b.id,
        notificationType: 'TRANSACTIONAL',
        templateName: 'pending_balance_post_event_customer',
        templateParams: {
          bookingNumber: b.booking_number,
          remainingBalance: balanceFormatted,
        },
      });

      // Workflow 2: Post-Event WhatsApp Payment Balance Reminder (Exactly 48 hours post event)
      const custPhone = b.customers.phone;
      if (custPhone) {
        // Respect customer WhatsApp opt-out status
        const isOptedOut = await prisma.marketing_unsubscribes.findFirst({
          where: {
            business_id: b.business_id,
            email: b.customers.email || undefined,
          },
        });

        if (!isOptedOut) {
          const pkgName = b.package_name_snapshot || b.packages?.name || lastEvent?.title || 'Bridal Package';

          const studioPhone = b.businesses.whatsapp_phone || b.businesses.business_phone || '';
          const waParams = {
            studio_name: b.businesses.name,
            customer_name: b.customers.full_name,
            package_name: pkgName,
            event_date: eventDateStr,
            total_amount: totalAmountFormatted,
            amount_paid: totalPaidFormatted,
            balance_due: balanceFormatted,
            due_date: 'Immediate',
            phone_number: studioPhone || 'Our Studio',
          };
          const waBody = formatWhatsAppMessage('POST_EVENT_BALANCE_REMINDER', waParams);

          await this.queueNotification({
            businessId: b.business_id,
            recipient: custPhone,
            channel: 'WHATSAPP',
            subject: `Payment Reminder: Booking #${b.booking_number}`,
            messageBody: waBody,
            templateName: 'pending_balance_payment_reminder',
            templateParams: waParams,
            idempotencyKey: `wa_post_event_bal_rem_${b.id}_${eventDateStr}`,
            customerId: b.customer_id,
            bookingId: b.id,
            notificationType: 'POST_EVENT_BALANCE_REMINDER',
          });
        }
      }
    }
  },

  /**
   * Check and queue Upcoming Booking alerts for confirmed bookings occurring in the next 24-48 hours
   */
  async checkAndScheduleUpcomingBookingAlerts() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);

    const upcomingEvents = await prisma.booking_events.findMany({
      where: {
        event_date: {
          gte: in24Hours,
          lte: in48Hours,
        },
        bookings: {
          status: { in: ['CONFIRMED', 'PLANNING', 'READY'] },
        },
      },
      include: {
        bookings: {
          include: {
            customers: true,
            businesses: true,
            payment_records: true,
            packages: true,
          },
        },
      },
    });

    for (const ev of upcomingEvents) {
      const b = ev.bookings;
      if (!b || !b.businesses?.business_email) continue;

      const totalAmount = Number(b.total_amount_paise);
      const discount = Number(b.discount_paise);
      const netPayable = Math.max(0, totalAmount - discount);
      const totalPaid = (b.payment_records || []).reduce((acc, p) => acc + Number(p.amount_paise), 0);
      const balanceDue = Math.max(0, netPayable - totalPaid);

      const eventDateStr = ev.event_date.toISOString().split('T')[0];
      const eventTimeStr = ev.start_time ? new Date(ev.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const balanceFormatted = (balanceDue / 100).toFixed(2);
      const pkgName = b.package_name_snapshot || b.packages?.name || ev.title || 'Bridal Services';

      const idempotencyKey = `upc_alert_admin_${b.id}_${ev.id}_${eventDateStr}`;
      const studioSlug = b.businesses?.slug || 'srinivasbridalstudio';
      const template = emailTemplates.upcomingBookingAlertAdmin({
        clientName: b.customers?.full_name || 'Customer',
        bookingNumber: b.booking_number,
        eventDate: eventDateStr,
        eventTime: eventTimeStr,
        packageName: pkgName,
        status: b.status,
        balanceDue: balanceFormatted,
        dashboardUrl: APP_CONFIG.getStudioAdminUrl(studioSlug, `bookings/${b.id}`),
        businessName: b.businesses.name,
      });

      await this.queueNotification({
        businessId: b.business_id,
        recipient: b.businesses.business_email,
        channel: 'EMAIL',
        subject: template.subject,
        messageBody: template.html,
        idempotencyKey,
        customerId: b.customer_id,
        bookingId: b.id,
      });
    }
  },

  /**
   * Check and queue Subscription Expiry reminders for studio owners (Workflow #5)
   * Trigger: Exactly 3 days before the studio subscription expires
   */
  async checkAndScheduleSubscriptionReminders() {
    const now = new Date();
    // Exactly 3 days window: between now + 2.5 days and now + 3.5 days
    const in3DaysStart = new Date(now.getTime() + 2.5 * 24 * 60 * 60 * 1000);
    const in3DaysEnd = new Date(now.getTime() + 3.5 * 24 * 60 * 60 * 1000);

    const expiringEntitlements = await prisma.business_entitlements.findMany({
      where: {
        status: { in: ['ACTIVE', 'TRIAL'] },
        ends_at: {
          gte: in3DaysStart,
          lte: in3DaysEnd,
        },
      },
      include: {
        plans: true,
        businesses: {
          include: {
            business_members: {
              where: { role: 'OWNER', is_active: true },
              include: { users: true },
            },
          },
        },
      },
    });

    for (const ent of expiringEntitlements) {
      // Recheck status immediately before scheduling
      if (ent.status !== 'ACTIVE' && ent.status !== 'TRIAL') continue;

      const ownerMember = ent.businesses?.business_members?.[0];
      const ownerUser = ownerMember?.users;
      const ownerEmail = ownerUser?.email || ent.businesses?.business_email;
      if (!ownerEmail) continue;

      const plan = ent.plans;
      const planName = plan?.name || 'Studio';
      const expiryDateStr = ent.ends_at.toISOString().split('T')[0];
      const startDateStr = ent.starts_at ? ent.starts_at.toISOString().split('T')[0] : null;

      const studioSlug = ent.businesses?.slug || 'srinivasbridalstudio';
      const renewalUrl = APP_CONFIG.getStudioAdminUrl(studioSlug, 'subscription');

      // Notify once per subscription period using unique idempotency key
      const idempotencyKey = `sub_exp_3d_${ent.id}_${expiryDateStr}`;

      const template = emailTemplates.subscriptionExpiryAdmin({
        studioName: ent.businesses.name,
        currentPlanName: planName,
        subscriptionStartDateStr: startDateStr,
        subscriptionExpiryDateStr: expiryDateStr,
        daysRemaining: 3,
        renewalUrl,
      });

      await this.queueNotification({
        businessId: ent.business_id,
        recipient: ownerEmail,
        channel: 'EMAIL',
        subject: template.subject,
        messageBody: template.html,
        idempotencyKey,
        notificationType: 'TRANSACTIONAL',
        templateName: 'subscription_expiry_admin',
        templateParams: {
          planName,
          expiryDate: expiryDateStr,
        },
      });

      // WhatsApp Reminder if phone available
      const adminPhone = ent.businesses?.whatsapp_phone || ent.businesses?.business_phone || ownerUser?.phone;
      if (adminPhone) {
        const waParams = {
          admin_name: ownerUser?.name || 'Studio Owner',
          plan_name: planName,
          studio_name: ent.businesses.name,
          expiry_date: expiryDateStr,
          subscription_status: ent.status,
        };
        const waBody = formatWhatsAppMessage('SUBSCRIPTION_EXPIRY_REMINDER', waParams);

        await this.queueNotification({
          businessId: ent.business_id,
          recipient: adminPhone,
          channel: 'WHATSAPP',
          subject: 'Subscription Expiry Notice',
          messageBody: waBody,
          templateName: 'subscription_expiry_reminder',
          templateParams: waParams,
          idempotencyKey: `wa_sub_exp_3d_${ent.id}_${expiryDateStr}`,
        });
      }
    }
  },

  /**
   * Check and queue Consultation Reminders (Template 4: upcoming in 24 hours)
   */
  async checkAndScheduleConsultationReminders() {
    const now = new Date();
    const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in26Hours = new Date(now.getTime() + 26 * 60 * 60 * 1000);

    const upcomingConsultations = await prisma.consultations.findMany({
      where: {
        status: { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED'] },
        scheduled_start: {
          gte: in24Hours,
          lte: in26Hours,
        },
      },
      include: {
        businesses: true,
        customers: true,
      },
    });

    for (const c of upcomingConsultations) {
      const recipientPhone = c.requested_phone || c.customers?.phone;
      if (!recipientPhone) continue;

      const startDate = c.scheduled_start;
      const dateStr = startDate ? startDate.toISOString().split('T')[0] : 'Upcoming';
      const timeStr = startDate ? startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Coordinated Time';
      const studioLocation = c.location_address || c.location_name || c.businesses?.address_line1 || 'Studio';

      const studioPhone = c.businesses?.whatsapp_phone || c.businesses?.business_phone || '';
      const waParams = {
        customer_name: c.requested_name || c.customers?.full_name || 'Valued Client',
        studio_name: c.businesses?.name || 'Bridal Studio',
        consultation_date: dateStr,
        consultation_time: timeStr,
        studio_location: studioLocation,
        phone_number: studioPhone || 'Our Studio',
      };

      const waBody = formatWhatsAppMessage('CONSULTATION_REMINDER', waParams);

      await this.queueNotification({
        businessId: c.business_id,
        recipient: recipientPhone,
        channel: 'WHATSAPP',
        subject: 'Consultation Reminder',
        messageBody: waBody,
        templateName: 'consultation_reminder',
        templateParams: waParams,
        idempotencyKey: `wa_cons_rem_${c.id}_${dateStr}`,
        customerId: c.customer_id,
        consultationId: c.id,
      });
    }
  },

  /**
   * Check and queue Bridal Consultation Follow-ups (Template 8: ~24 hours after completion)
   */
  async checkAndScheduleConsultationFollowUps() {
    const now = new Date();
    // Consultations completed between 24 and 48 hours ago
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const completedConsultations = await prisma.consultations.findMany({
      where: {
        status: 'COMPLETED',
        scheduled_end: {
          gte: twoDaysAgo,
          lte: oneDayAgo,
        },
      },
      include: {
        businesses: true,
        customers: true,
        enquiries: true,
      },
    });

    for (const c of completedConsultations) {
      const recipientPhone = c.requested_phone || c.customers?.phone;
      if (!recipientPhone) continue;

      const dateStr = c.scheduled_start ? c.scheduled_start.toISOString().split('T')[0] : 'Recent Consultation';
      const interestedService = c.consultation_type || c.enquiries?.event_kind || 'Bridal Makeup & Styling';

      const studioPhone = c.businesses?.whatsapp_phone || c.businesses?.business_phone || '';
      const waParams = {
        customer_name: c.requested_name || c.customers?.full_name || 'Valued Client',
        studio_name: c.businesses?.name || 'Bridal Studio',
        consultation_date: dateStr,
        interested_service: interestedService,
        phone_number: studioPhone || 'Our Studio',
      };

      const waBody = formatWhatsAppMessage('CONSULTATION_FOLLOW_UP', waParams);

      await this.queueNotification({
        businessId: c.business_id,
        recipient: recipientPhone,
        channel: 'WHATSAPP',
        subject: 'Bridal Consultation Follow UP',
        messageBody: waBody,
        templateName: 'consultation_follow_up',
        templateParams: waParams,
        idempotencyKey: `wa_cons_fu_${c.id}_${dateStr}`,
        customerId: c.customer_id,
        consultationId: c.id,
      });
    }
  },

  /**
   * Check and queue Follow-Up Reminder Emails for Studio Admin (Workflow #2)
   * Trigger: When an enquiry or consultation follow-up becomes due
   */
  async checkAndScheduleFollowUpDueRemindersAdmin() {
    const now = new Date();
    // Follow-ups due up until now, looking back at most 24 hours to catch newly due items
    const lookback24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 1. Check due Enquiry Follow-Ups
    try {
      const dueEnquiries = await prisma.enquiries.findMany({
        where: {
          next_follow_up_at: {
            gte: lookback24h,
            lte: now,
          },
          status: { in: ['NEW', 'CONTACTED', 'FOLLOW_UP'] },
        },
        include: {
          businesses: {
            include: {
              business_members: {
                where: { role: 'OWNER', is_active: true },
                include: { users: true },
              },
            },
          },
          customers: true,
        },
      });

      for (const enq of dueEnquiries) {
        const ownerEmail =
          enq.businesses?.business_members?.[0]?.users?.email || enq.businesses?.business_email;
        if (!ownerEmail) continue;

        const custName = enq.customers?.full_name || enq.name || 'Bride Client';
        const custPhone = enq.customers?.phone || enq.phone;
        const custEmail = enq.customers?.email || enq.email;
        const followUpIso = enq.next_follow_up_at.toISOString();
        const followUpDateStr = enq.next_follow_up_at.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const studioSlug = enq.businesses?.slug || 'srinivasbridalstudio';
        const portalLink = APP_CONFIG.getStudioAdminUrl(studioSlug, 'enquiries');

        // Idempotency key per specific follow-up occurrence. If follow-up date changes, the timestamp changes.
        const idempotencyKey = `fu_admin_enq_${enq.id}_${new Date(followUpIso).getTime()}`;

        const template = emailTemplates.followUpReminderAdmin({
          customerName: custName,
          customerPhone: custPhone,
          customerEmail: custEmail,
          referenceType: 'Enquiry',
          referenceId: enq.id,
          referenceNumber: enq.id.substring(0, 8).toUpperCase(),
          followUpDateStr,
          previousInteractionNotes: enq.requirements || enq.event_kind || null,
          followUpNotes: enq.notes || 'Scheduled lead follow-up',
          portalLink,
          studioName: enq.businesses.name,
          logoUrl: enq.businesses.logo_url || null,
        });

        await this.queueNotification({
          businessId: enq.business_id,
          recipient: ownerEmail,
          channel: 'EMAIL',
          subject: template.subject,
          messageBody: template.html,
          idempotencyKey,
          customerId: enq.customer_id,
          enquiryId: enq.id,
          notificationType: 'TRANSACTIONAL',
          templateName: 'follow_up_reminder_admin',
          templateParams: {
            customerName: custName,
            referenceType: 'Enquiry',
            followUpDate: followUpDateStr,
          },
        });
      }
    } catch (enqErr) {
      console.error('[NotificationWorker] Error in enquiry follow-up reminder check:', enqErr.message);
    }

    // 2. Check due Consultation Outcomes Follow-Ups
    try {
      const dueOutcomes = await prisma.consultation_outcomes.findMany({
        where: {
          follow_up_date: {
            gte: lookback24h,
            lte: now,
          },
        },
        include: {
          businesses: {
            include: {
              business_members: {
                where: { role: 'OWNER', is_active: true },
                include: { users: true },
              },
            },
          },
          customers: true,
          consultations: true,
        },
      });

      for (const outcome of dueOutcomes) {
        // Skip if consultation was cancelled
        if (outcome.consultations && outcome.consultations.status === 'CANCELLED') continue;

        const ownerEmail =
          outcome.businesses?.business_members?.[0]?.users?.email || outcome.businesses?.business_email;
        if (!ownerEmail) continue;

        const custName = outcome.customers?.full_name || outcome.consultations?.requested_name || 'Bride Client';
        const custPhone = outcome.customers?.phone || outcome.consultations?.requested_phone;
        const custEmail = outcome.customers?.email || outcome.consultations?.requested_email;
        const followUpIso = outcome.follow_up_date.toISOString();
        const followUpDateStr = outcome.follow_up_date.toLocaleString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const studioSlug = outcome.businesses?.slug || 'srinivasbridalstudio';
        const portalLink = APP_CONFIG.getStudioAdminUrl(studioSlug, 'consultations');

        const idempotencyKey = `fu_admin_cons_${outcome.id}_${new Date(followUpIso).getTime()}`;

        const template = emailTemplates.followUpReminderAdmin({
          customerName: custName,
          customerPhone: custPhone,
          customerEmail: custEmail,
          referenceType: 'Consultation',
          referenceId: outcome.consultation_id,
          referenceNumber: outcome.consultation_id.substring(0, 8).toUpperCase(),
          followUpDateStr,
          previousInteractionNotes: outcome.feedback_summary || outcome.outcome_tag || null,
          followUpNotes: outcome.agreed_services ? `Agreed Services: ${outcome.agreed_services}` : 'Trial outcome follow-up',
          portalLink,
          studioName: outcome.businesses.name,
          logoUrl: outcome.businesses.logo_url || null,
        });

        await this.queueNotification({
          businessId: outcome.business_id,
          recipient: ownerEmail,
          channel: 'EMAIL',
          subject: template.subject,
          messageBody: template.html,
          idempotencyKey,
          customerId: outcome.customer_id,
          consultationId: outcome.consultation_id,
          notificationType: 'TRANSACTIONAL',
          templateName: 'follow_up_reminder_admin',
          templateParams: {
            customerName: custName,
            referenceType: 'Consultation',
            followUpDate: followUpDateStr,
          },
        });
      }
    } catch (outcomeErr) {
      console.error('[NotificationWorker] Error in consultation outcome follow-up check:', outcomeErr.message);
    }
  },

  /**
   * Run automated background cycle: process due jobs, check prep, balance, upcoming & subscription reminders
   */
  async runBackgroundWorkerCycle() {
    try {
      // 1. Process all pending jobs due right now
      await this.processDueJobs(25);

      // 2. Schedule reminders
      await this.checkAndScheduleEventPrepReminders();
      await this.checkAndScheduleBalanceReminders();
      await this.checkAndScheduleUpcomingBookingAlerts();
      await this.checkAndScheduleSubscriptionReminders();
      await this.checkAndScheduleConsultationReminders();
      await this.checkAndScheduleConsultationFollowUps();
      await this.checkAndScheduleFollowUpDueRemindersAdmin();
    } catch (err) {
      console.error('[NotificationWorker] Error in background cycle:', err.message);
    }
  },
};

