import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { formatWhatsAppMessage, WHATSAPP_TEMPLATES, getWhatsAppTemplate } from '../utils/whatsappTemplates.js';
import { whatsappService } from './whatsapp.service.js';
import { whatsappBillingService } from './whatsapp-billing.service.js';
import { env } from '../config/env.js';

export const campaignService = {
  /**
   * Get filtered customer audience for a business based on segment
   * Excludes unsubscribed emails and customers without valid emails
   */
  async getAudience(businessId, segment, packageOrServiceId = null, customerIds = null) {
    // 1. Get unsubscribed email list for this business
    const unsubscribes = await prisma.marketing_unsubscribes.findMany({
      where: { business_id: businessId },
      select: { email: true },
    });
    const unsubscribedSet = new Set(unsubscribes.map((u) => u.email.toLowerCase().trim()));

    let eligibleCustomers = [];

    if (segment === 'CUSTOMER_DATA_WISE') {
      const ids = Array.isArray(customerIds) ? customerIds : [];
      if (ids.length > 0) {
        eligibleCustomers = await prisma.customers.findMany({
          where: {
            business_id: businessId,
            id: { in: ids },
          },
          select: {
            id: true,
            full_name: true,
            email: true,
            phone: true,
          },
        });
      }
    } else if (segment === 'ALL_CONTACTS') {
      // All customers in this business with valid email
      eligibleCustomers = await prisma.customers.findMany({
        where: {
          business_id: businessId,
          email: { not: null },
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      });
    } else if (segment === 'PAST_CUSTOMERS') {
      // Customers who have at least one completed or confirmed booking
      eligibleCustomers = await prisma.customers.findMany({
        where: {
          business_id: businessId,
          email: { not: null },
          bookings: {
            some: {
              status: { in: ['CONFIRMED', 'COMPLETED', 'READY', 'IN_PROGRESS'] },
            },
          },
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      });
    } else if (segment === 'ENQUIRIES_NOT_BOOKED') {
      // Customers who enquired but have zero confirmed or completed bookings
      eligibleCustomers = await prisma.customers.findMany({
        where: {
          business_id: businessId,
          email: { not: null },
          enquiries: { some: {} },
          bookings: {
            none: {
              status: { in: ['CONFIRMED', 'COMPLETED', 'READY', 'IN_PROGRESS'] },
            },
          },
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      });
    } else if (segment === 'SPECIFIC_SERVICE' && packageOrServiceId) {
      // Customers who booked this specific package
      eligibleCustomers = await prisma.customers.findMany({
        where: {
          business_id: businessId,
          email: { not: null },
          bookings: {
            some: {
              package_id: packageOrServiceId,
              status: { not: 'CANCELLED' },
            },
          },
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      });
    } else {
      // Default to all contacts with email
      eligibleCustomers = await prisma.customers.findMany({
        where: {
          business_id: businessId,
          email: { not: null },
        },
        select: {
          id: true,
          full_name: true,
          email: true,
          phone: true,
        },
      });
    }

    // Filter out deduplicated and unsubscribed contacts
    const seenEmails = new Set();
    const audience = [];

    for (const cust of eligibleCustomers) {
      if (!cust.email) continue;
      const cleanEmail = cust.email.toLowerCase().trim();
      if (!cleanEmail.includes('@') || unsubscribedSet.has(cleanEmail) || seenEmails.has(cleanEmail)) {
        continue;
      }
      seenEmails.add(cleanEmail);
      audience.push({
        id: cust.id,
        full_name: cust.full_name,
        email: cleanEmail,
        phone: cust.phone,
      });
    }

    return audience;
  },

  /**
   * Get audience count preview without fetching all details
   */
  async getAudienceCount(businessId, segment, packageOrServiceId = null, customerIds = null) {
    if (segment === 'CUSTOMER_DATA_WISE') {
      const ids = Array.isArray(customerIds) ? customerIds : [];
      return { count: ids.length };
    }
    const audience = await this.getAudience(businessId, segment, packageOrServiceId, customerIds);
    return { count: audience.length };
  },

  /**
   * List campaigns for a business with delivery statistics
   */
  async listCampaigns(businessId, query = {}) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(query.limit, 10) || 15));
    const skip = (page - 1) * limit;

    const where = { business_id: businessId };
    if (query.status) {
      where.status = query.status;
    }

    const [total, campaigns] = await Promise.all([
      prisma.campaigns.count({ where }),
      prisma.campaigns.findMany({
        where,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: {
          users: { select: { id: true, name: true, email: true } },
          _count: {
            select: { notification_jobs: true },
          },
        },
      }),
    ]);

    return {
      campaigns: campaigns.map((c) => ({
        ...c,
        body_text: c.body_html,
        banner_url: c.banner_image_url,
        recipient_segment: c.segment,
        sent_recipients: c.sent_count,
        delivered_recipients: c.delivered_count,
        failed_recipients: c.failed_count,
      })),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get single campaign by ID with full analytics
   */
  async getCampaignById(businessId, campaignId) {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
      include: {
        users: { select: { id: true, name: true, email: true } },
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            business_phone: true,
            whatsapp_phone: true,
            business_email: true,
            address_line1: true,
            city: true,
            state: true,
          },
        },
        notification_jobs: {
          select: {
            id: true,
            recipient: true,
            status: true,
            sent_at: true,
            error_message: true,
            opened_at: true,
            clicked_at: true,
            customers: { select: { id: true, full_name: true } },
          },
        },
      },
    });

    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    return {
      ...campaign,
      body_text: campaign.body_html,
      banner_url: campaign.banner_image_url,
      recipient_segment: campaign.segment,
      sent_recipients: campaign.sent_count,
      delivered_recipients: campaign.delivered_count,
      failed_recipients: campaign.failed_count,
    };
  },

  /**
   * Create a new draft campaign
   */
  async createCampaign(businessId, userId, data) {
    const segment = data.recipient_segment || data.segment || 'ALL_CONTACTS';
    const packageId = data.target_package_id || null;
    const customerIds = data.customer_ids || null;
    const audience = await this.getAudience(businessId, segment, packageId, customerIds);

    const bodyHtml = data.body_text || data.body_html || '';
    const offerDescription = data.body_text || data.offer_description || '';
    const bannerUrl = data.banner_url || data.banner_image_url || null;

    const campaign = await prisma.campaigns.create({
      data: {
        business_id: businessId,
        created_by: userId,
        name: data.name,
        subject: data.subject,
        heading: data.heading || data.name,
        offer_description: offerDescription,
        body_html: bodyHtml,
        banner_image_url: bannerUrl,
        cta_text: data.cta_text || null,
        cta_url: data.cta_url || null,
        segment: segment,
        segment_filter: {
          ...(packageId ? { target_package_id: packageId } : {}),
          ...(customerIds && Array.isArray(customerIds) ? { customer_ids: customerIds } : {}),
        },
        total_recipients: audience.length,
        status: data.scheduled_at ? 'SCHEDULED' : 'DRAFT',
        scheduled_at: data.scheduled_at ? new Date(data.scheduled_at) : null,
      },
    });

    return {
      ...campaign,
      body_text: campaign.body_html,
      banner_url: campaign.banner_image_url,
      recipient_segment: campaign.segment,
    };
  },

  /**
   * Update an existing draft campaign
   */
  async updateCampaign(businessId, campaignId, data) {
    const existing = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Campaign not found');
    }

    if (existing.status === 'SENT' || existing.status === 'SENDING') {
      throw ApiError.badRequest('Cannot edit an active or sent campaign');
    }

    const segment = data.recipient_segment || data.segment || existing.segment;
    const packageId = data.target_package_id !== undefined ? data.target_package_id : existing.segment_filter?.target_package_id;
    const customerIds = data.customer_ids !== undefined ? data.customer_ids : existing.segment_filter?.customer_ids;
    const audience = await this.getAudience(businessId, segment, packageId, customerIds);

    const bodyHtml = data.body_text !== undefined ? data.body_text : (data.body_html !== undefined ? data.body_html : existing.body_html);
    const bannerUrl = data.banner_url !== undefined ? data.banner_url : (data.banner_image_url !== undefined ? data.banner_image_url : existing.banner_image_url);

    const updated = await prisma.campaigns.update({
      where: { id: campaignId },
      data: {
        name: data.name ?? existing.name,
        subject: data.subject ?? existing.subject,
        heading: data.heading ?? existing.heading,
        offer_description: bodyHtml,
        body_html: bodyHtml,
        banner_image_url: bannerUrl,
        cta_text: data.cta_text !== undefined ? data.cta_text : existing.cta_text,
        cta_url: data.cta_url !== undefined ? data.cta_url : existing.cta_url,
        segment: segment,
        segment_filter: {
          ...(packageId ? { target_package_id: packageId } : {}),
          ...(customerIds && Array.isArray(customerIds) ? { customer_ids: customerIds } : {}),
        },
        total_recipients: audience.length,
        scheduled_at: data.scheduled_at !== undefined ? (data.scheduled_at ? new Date(data.scheduled_at) : null) : existing.scheduled_at,
        status: data.scheduled_at ? 'SCHEDULED' : (data.status ?? existing.status),
        updated_at: new Date(),
      },
    });

    return {
      ...updated,
      body_text: updated.body_html,
      banner_url: updated.banner_image_url,
      recipient_segment: updated.segment,
    };
  },

  /**
   * Send test email for campaign to an admin/artist recipient
   */
  async sendTestEmail(businessId, campaignId, testEmail) {
    if (!testEmail || !testEmail.includes('@')) {
      throw ApiError.badRequest('Valid test email address is required');
    }

    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            business_phone: true,
            whatsapp_phone: true,
            business_email: true,
            address_line1: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    const biz = campaign.businesses;
    const studioAddress = [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ');
    const template = emailTemplates.campaignEmail({
      businessName: biz?.name || 'Bridal Studio',
      campaignHeading: campaign.heading || campaign.name,
      offerDescription: campaign.body_html || campaign.offer_description,
      bannerImageUrl: campaign.banner_image_url,
      ctaText: campaign.cta_text,
      ctaUrl: campaign.cta_url,
      unsubscribeUrl: `${env.BACKEND_URL || 'http://localhost:5000'}/api/public/campaigns/unsubscribe?token=preview`,
      studioPhone: biz?.business_phone || biz?.whatsapp_phone,
      studioEmail: biz?.business_email,
      studioAddress: studioAddress || undefined,
    });

    const job = await notificationService.queueNotification({
      businessId,
      recipient: testEmail.toLowerCase().trim(),
      channel: 'EMAIL',
      subject: `[TEST] ${campaign.subject}`,
      messageBody: template.html,
      scheduledAt: new Date(),
      campaignId: campaign.id,
      notificationType: 'MARKETING',
    });

    if (job) {
      await notificationService.processJob(job.id);
    }

    return { message: `Test email dispatched to ${testEmail}` };
  },

  /**
   * Launch campaign now or confirm scheduled launch
   */
  async launchCampaign(businessId, campaignId) {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            business_phone: true,
            whatsapp_phone: true,
            business_email: true,
            address_line1: true,
            city: true,
            state: true,
          },
        },
      },
    });

    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    if (campaign.status === 'SENT' || campaign.status === 'SENDING') {
      throw ApiError.badRequest('Campaign has already been launched');
    }

    const packageId = campaign.segment_filter?.target_package_id;
    let customerIds = campaign.segment_filter?.customer_ids;
    let audience = await this.getAudience(businessId, campaign.segment, packageId, customerIds);

    // Fallback: If campaign was saved as CUSTOMER_DATA_WISE without customer_ids in draft,
    // or if the chosen segment yielded 0 contacts, check all available contacts with email in this business
    if (audience.length === 0) {
      const fallbackAudience = await this.getAudience(businessId, 'ALL_CONTACTS');
      if (fallbackAudience.length > 0) {
        audience = fallbackAudience;
      }
    }

    if (audience.length === 0) {
      throw ApiError.badRequest('No eligible contacts with email found for this audience segment. Please add client email addresses.');
    }

    // Update campaign status to SENDING
    await prisma.campaigns.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        total_recipients: audience.length,
        sent_count: 0,
        failed_count: 0,
        delivered_count: 0,
      },
    });

    const biz = campaign.businesses;
    const studioAddress = [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ');
    const baseUnsubUrl = `${env.BACKEND_URL || 'http://localhost:5000'}/api/public/campaigns/unsubscribe`;

    // Queue notifications for each recipient
    const jobs = [];
    for (const contact of audience) {
      const unsubLink = `${baseUnsubUrl}?biz=${businessId}&email=${encodeURIComponent(contact.email)}`;
      const template = emailTemplates.campaignEmail({
        businessName: biz?.name || 'Bridal Studio',
        campaignHeading: campaign.heading || campaign.name,
        offerDescription: campaign.body_html || campaign.offer_description,
        bannerImageUrl: campaign.banner_image_url,
        ctaText: campaign.cta_text,
        ctaUrl: campaign.cta_url,
        unsubscribeUrl: unsubLink,
        studioPhone: biz?.business_phone || biz?.whatsapp_phone,
        studioEmail: biz?.business_email,
        studioAddress: studioAddress || undefined,
      });

      const idempotencyKey = `camp_${campaign.id}_${contact.id}_${contact.email}`;

      const job = await notificationService.queueNotification({
        businessId,
        recipient: contact.email,
        channel: 'EMAIL',
        subject: campaign.subject,
        messageBody: template.html,
        scheduledAt: new Date(),
        idempotencyKey,
        customerId: contact.id,
        campaignId: campaign.id,
        notificationType: 'MARKETING',
      });

      if (job) {
        jobs.push(job);
      }
    }

    // Process first batch immediately
    let sentCount = 0;
    let failedCount = 0;
    for (const job of jobs) {
      const processed = await notificationService.processJob(job.id);
      if (processed?.status === 'SENT' || processed?.status === 'DELIVERED') {
        sentCount++;
      } else if (processed?.status === 'FAILED') {
        failedCount++;
      }
    }

    // Update campaign status to SENT
    const completedCampaign = await prisma.campaigns.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sent_at: new Date(),
        sent_count: sentCount,
        failed_count: failedCount,
        delivered_count: sentCount,
      },
    });

    return {
      ...completedCampaign,
      body_text: completedCampaign.body_html,
      banner_url: completedCampaign.banner_image_url,
      recipient_segment: completedCampaign.segment,
    };
  },

  /**
   * Cancel a scheduled or draft campaign
   */
  async cancelCampaign(businessId, campaignId) {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
    });

    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    if (campaign.status === 'SENT') {
      throw ApiError.badRequest('Cannot cancel an already completed campaign');
    }

    // Cancel queued notification jobs belonging to this campaign
    await prisma.notification_jobs.updateMany({
      where: { campaign_id: campaignId, status: 'QUEUED' },
      data: { status: 'CANCELLED', error_message: 'Campaign was cancelled by studio' },
    });

    const updated = await prisma.campaigns.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' },
    });

    return updated;
  },

  /**
   * Delete a campaign and its associated notification jobs
   */
  async deleteCampaign(businessId, campaignId) {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: campaignId, business_id: businessId },
    });

    if (!campaign) {
      throw ApiError.notFound('Campaign not found');
    }

    if (campaign.status === 'SENDING') {
      throw ApiError.badRequest('Cannot delete a campaign that is currently in the process of sending');
    }

    // Delete associated notification jobs first to respect FK constraints
    await prisma.notification_jobs.deleteMany({
      where: { campaign_id: campaignId },
    });

    // Delete campaign
    await prisma.campaigns.delete({
      where: { id: campaignId },
    });

    return { id: campaignId, message: 'Campaign deleted successfully' };
  },

  /**
   * Handle public marketing unsubscribe
   */
  async unsubscribe(businessId, email, reason = 'User requested unsubscribe') {
    if (!businessId || !email) {
      throw ApiError.badRequest('Invalid unsubscribe request');
    }

    const cleanEmail = email.toLowerCase().trim();

    const record = await prisma.marketing_unsubscribes.upsert({
      where: {
        business_id_email: {
          business_id: businessId,
          email: cleanEmail,
        },
      },
      create: {
        business_id: businessId,
        email: cleanEmail,
        reason,
      },
      update: {
        reason,
      },
    });

    return record;
  },

  /**
   * Preview WhatsApp Campaign Template 9 with sample or resolved data
   */
  async previewWhatsAppCampaign(businessId, { package_name, offer_description, offer_end_date }) {
    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { name: true, business_phone: true, whatsapp_phone: true },
    });

    const studioPhone = business?.whatsapp_phone || business?.business_phone || '';
    const params = {
      studio_name: business?.name || 'Bridal Studio',
      package_name: package_name || 'Exclusive Royal Bridal Package',
      offer_description: offer_description || '20% off bridal makeup + complimentary trial session',
      offer_end_date: offer_end_date || 'End of this month',
      phone_number: studioPhone || 'Our Studio',
    };

    return {
      template_name: 'special_bridal_packages',
      params,
      formatted_text: formatWhatsAppMessage('SPECIAL_BRIDAL_PACKAGES', params),
    };
  },

  /**
   * Send WhatsApp Campaign Template 9 (User-Triggered, strictly manual)
   */
  async sendWhatsAppCampaign(businessId, userId, data) {
    const { campaign_name, package_name, offer_description, offer_end_date, recipient_segment = 'ALL_CONTACTS', target_package_id, customer_ids } = data;

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { name: true, business_phone: true, whatsapp_phone: true },
    });
    const studioName = business?.name || 'Bridal Studio';

    // 1. Fetch audience with valid phone numbers (tenant-isolated)
    let whereClause = {
      business_id: businessId,
      phone: { not: '' },
    };

    if (recipient_segment === 'CUSTOMER_DATA_WISE') {
      const ids = Array.isArray(customer_ids) ? customer_ids : [];
      whereClause.id = { in: ids };
    } else if (recipient_segment === 'PAST_CUSTOMERS') {
      whereClause.bookings = {
        some: { status: { in: ['CONFIRMED', 'COMPLETED', 'READY', 'IN_PROGRESS'] } },
      };
    } else if (recipient_segment === 'SPECIFIC_SERVICE' && target_package_id) {
      whereClause.bookings = {
        some: { package_id: target_package_id },
      };
    }

    const customers = await prisma.customers.findMany({
      where: whereClause,
      select: {
        id: true,
        full_name: true,
        phone: true,
      },
    });

    // Deduplicate by normalized phone number
    const seenPhones = new Set();
    const validRecipients = [];
    for (const c of customers) {
      const norm = whatsappService.normalizePhoneNumber(c.phone);
      if (norm && !seenPhones.has(norm)) {
        seenPhones.add(norm);
        validRecipients.push({ ...c, normalizedPhone: norm });
      }
    }

    if (validRecipients.length === 0) {
      throw ApiError.badRequest('No customers with valid phone numbers match the selected audience segment.');
    }

    // 2. Billing Prerequisite & Balance Verification / Reservation
    // All broadcast campaigns use MARKETING message category
    const costEstimate = await whatsappBillingService.estimateCampaignCost(
      businessId,
      validRecipients.length,
      'MARKETING',
      'IN'
    );

    if (!costEstimate.has_sufficient_credits) {
      throw ApiError.badRequest(
        `Insufficient WhatsApp messaging balance. Required: ₹${costEstimate.total_estimated_rupees.toFixed(2)}, Available: ₹${costEstimate.studio_available_balance_rupees.toFixed(2)}. Shortfall: ₹${costEstimate.shortfall_rupees.toFixed(2)}. Please add credits before dispatching.`
      );
    }

    const studioPhone = business.whatsapp_phone || business.business_phone || '';
    const params = {
      studio_name: studioName,
      package_name,
      offer_description,
      offer_end_date,
      phone_number: studioPhone || 'Our Studio',
    };
    const messageBody = formatWhatsAppMessage('SPECIAL_BRIDAL_PACKAGES', params);

    // 3. Persist audit campaign record
    const campaign = await prisma.campaigns.create({
      data: {
        business_id: businessId,
        name: campaign_name,
        subject: `WhatsApp: ${package_name}`,
        heading: `Special Bridal Packages: ${package_name}`,
        offer_description: offer_description,
        body_html: messageBody,
        segment: recipient_segment,
        status: 'SENDING',
        total_recipients: validRecipients.length,
        created_by: userId,
        sent_at: new Date(),
      },
    });

    // 4. Atomically reserve estimated credits in studio account
    await whatsappBillingService.reserveCampaignCredits(
      businessId,
      campaign.id,
      validRecipients.length,
      'MARKETING'
    );

    // 5. Queue and dispatch WhatsApp notification jobs
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of validRecipients) {
      try {
        const idempotencyKey = `wa_camp_${campaign.id}_${recipient.id}_${recipient.normalizedPhone}`;
        const job = await notificationService.queueNotification({
          businessId,
          recipient: recipient.phone,
          channel: 'WHATSAPP',
          subject: `Special Bridal Packages: ${package_name}`,
          messageBody,
          templateName: 'special_bridal_packages',
          templateParams: params,
          idempotencyKey,
          customerId: recipient.id,
          campaignId: campaign.id,
          notificationType: 'CAMPAIGN',
        });

        if (job) {
          await notificationService.processJob(job.id);
          sentCount++;
        }
      } catch (err) {
        failedCount++;
        console.error(`[WhatsApp Campaign Dispatch] Error for ${recipient.phone}:`, err.message);
      }
    }

    // 6. Update campaign status and reconcile usage against actual successful transmissions
    const finalStatus = failedCount === validRecipients.length ? 'FAILED' : 'SENT';
    const updatedCampaign = await prisma.campaigns.update({
      where: { id: campaign.id },
      data: {
        status: finalStatus,
        sent_count: sentCount,
        failed_count: failedCount,
        delivered_count: sentCount,
      },
    });

    // 7. Settle/reconcile credits: releases unused reserved credits for any failed dispatches immediately
    let billingSummary = null;
    try {
      billingSummary = await whatsappBillingService.reconcileCampaign(campaign.id);
    } catch (billErr) {
      console.error('[WhatsApp Campaign Billing Reconcile Error]:', billErr.message);
    }

    return {
      campaign_id: updatedCampaign.id,
      campaign_name: updatedCampaign.name,
      total_recipients: validRecipients.length,
      sent_count: sentCount,
      failed_count: failedCount,
      status: finalStatus,
      billing: billingSummary,
    };
  },

  /**
   * Get all 9 WhatsApp templates with studio context, approval status, and read-only flags
   */
  async getWhatsAppTemplates(businessId) {
    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        business_phone: true,
        whatsapp_phone: true,
        address_line1: true,
        city: true,
      },
    });

    const studioName = business?.name || 'Bridal Studio';
    const studioLocation = [business?.address_line1, business?.city].filter(Boolean).join(', ') || 'Studio';

    const isConnected = whatsappService.isConfigured();

    const sampleContext = {
      customer_name: 'Ananya Sharma',
      studio_name: studioName,
      event_date: '28 Nov 2026',
      event_time: '09:00 AM',
      service_name: 'Bridal Makeover & Styling',
      package_name: 'Royal South Indian Bridal Package',
      studio_location: studioLocation,
      customer_phone: '9840123456',
      total_amount: '35,000',
      amount_paid: '15,000',
      balance_due: '20,000',
      due_date: '20 Nov 2026',
      consultation_date: '15 Nov 2026',
      consultation_time: '11:00 AM',
      event_location: 'Grand Chola Hall, ' + (business?.city || 'Madurai'),
      admin_name: 'Studio Owner',
      plan_name: 'Growth Monthly',
      expiry_date: '28 Nov 2026',
      subscription_status: 'Active',
      interested_service: 'HD Airbrush & Saree Draping',
      offer_description: 'Complimentary trial session + 20% off for 2 wedding events',
      offer_end_date: '30 Nov 2026',
    };

    const templates = [
      {
        id: 1,
        number: 1,
        key: 'CUSTOMER_ENQUIRY_ACK',
        name: 'Customer Enquiry Acknowledgement',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'When a customer submits a bridal enquiry.',
        purpose: 'Acknowledge the enquiry and inform the customer that the studio will contact them.',
        templateName: WHATSAPP_TEMPLATES.CUSTOMER_ENQUIRY_ACK.templateName,
        category: WHATSAPP_TEMPLATES.CUSTOMER_ENQUIRY_ACK.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.CUSTOMER_ENQUIRY_ACK.requiredParams,
        preview: WHATSAPP_TEMPLATES.CUSTOMER_ENQUIRY_ACK.format(sampleContext),
      },
      {
        id: 2,
        number: 2,
        key: 'ADMIN_ENQUIRY_ALERT',
        name: 'Studio Owner New Enquiry Notification',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'When the studio receives a new customer enquiry.',
        purpose: 'Notify the studio owner about the new enquiry.',
        templateName: WHATSAPP_TEMPLATES.ADMIN_ENQUIRY_ALERT.templateName,
        category: WHATSAPP_TEMPLATES.ADMIN_ENQUIRY_ALERT.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.ADMIN_ENQUIRY_ALERT.requiredParams,
        preview: WHATSAPP_TEMPLATES.ADMIN_ENQUIRY_ALERT.format(sampleContext),
      },
      {
        id: 3,
        number: 3,
        key: 'BOOKING_CONFIRMATION',
        name: 'Booking Confirmation',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'When a booking is successfully confirmed.',
        purpose: 'Send the customer their booking confirmation and relevant booking details.',
        templateName: WHATSAPP_TEMPLATES.BOOKING_CONFIRMATION.templateName,
        category: WHATSAPP_TEMPLATES.BOOKING_CONFIRMATION.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.BOOKING_CONFIRMATION.requiredParams,
        preview: WHATSAPP_TEMPLATES.BOOKING_CONFIRMATION.format(sampleContext),
      },
      {
        id: 4,
        number: 4,
        key: 'CONSULTATION_REMINDER',
        name: 'Consultation Reminder',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'Before a scheduled bridal consultation.',
        purpose: 'Remind the customer about their upcoming consultation.',
        templateName: WHATSAPP_TEMPLATES.CONSULTATION_REMINDER.templateName,
        category: WHATSAPP_TEMPLATES.CONSULTATION_REMINDER.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.CONSULTATION_REMINDER.requiredParams,
        preview: WHATSAPP_TEMPLATES.CONSULTATION_REMINDER.format(sampleContext),
      },
      {
        id: 5,
        number: 5,
        key: 'PENDING_BALANCE_REMINDER',
        name: 'Pending Balance Payment Reminder',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'When a booking has an outstanding balance and meets the configured reminder conditions.',
        purpose: 'Remind the customer about the pending payment.',
        templateName: WHATSAPP_TEMPLATES.PENDING_BALANCE_REMINDER.templateName,
        category: WHATSAPP_TEMPLATES.PENDING_BALANCE_REMINDER.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.PENDING_BALANCE_REMINDER.requiredParams,
        preview: WHATSAPP_TEMPLATES.PENDING_BALANCE_REMINDER.format(sampleContext),
      },
      {
        id: 6,
        number: 6,
        key: 'EVENT_PREPARATION_REMINDER',
        name: 'Event Preparation Reminder',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'Two days before the scheduled bridal event.',
        purpose: 'Remind the customer about event preparation and relevant appointment details.',
        templateName: WHATSAPP_TEMPLATES.EVENT_PREPARATION_REMINDER.templateName,
        category: WHATSAPP_TEMPLATES.EVENT_PREPARATION_REMINDER.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.EVENT_PREPARATION_REMINDER.requiredParams,
        preview: WHATSAPP_TEMPLATES.EVENT_PREPARATION_REMINDER.format(sampleContext),
      },
      {
        id: 7,
        number: 7,
        key: 'SUBSCRIPTION_EXPIRY_REMINDER',
        name: 'Subscription Expiry Reminder',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'When a studio subscription reaches its configured reminder period before expiry.',
        purpose: 'Notify the studio owner about the upcoming subscription expiry.',
        templateName: WHATSAPP_TEMPLATES.SUBSCRIPTION_EXPIRY_REMINDER.templateName,
        category: WHATSAPP_TEMPLATES.SUBSCRIPTION_EXPIRY_REMINDER.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.SUBSCRIPTION_EXPIRY_REMINDER.requiredParams,
        preview: WHATSAPP_TEMPLATES.SUBSCRIPTION_EXPIRY_REMINDER.format(sampleContext),
      },
      {
        id: 8,
        number: 8,
        key: 'CONSULTATION_FOLLOW_UP',
        name: 'Consultation Follow-Up',
        type: 'Automated',
        isAutomated: true,
        isReadOnly: true,
        trigger: 'After a consultation is marked as completed.',
        purpose: 'Follow up with the customer about their consultation and next steps.',
        templateName: WHATSAPP_TEMPLATES.CONSULTATION_FOLLOW_UP.templateName,
        category: WHATSAPP_TEMPLATES.CONSULTATION_FOLLOW_UP.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Read-Only Automated',
        requiredParams: WHATSAPP_TEMPLATES.CONSULTATION_FOLLOW_UP.requiredParams,
        preview: WHATSAPP_TEMPLATES.CONSULTATION_FOLLOW_UP.format(sampleContext),
      },
      {
        id: 9,
        number: 9,
        key: 'SPECIAL_BRIDAL_PACKAGES',
        name: 'Special Bridal Packages WhatsApp Campaign',
        type: 'Manual',
        isAutomated: false,
        isReadOnly: false,
        trigger: 'Explicit action by the studio owner.',
        purpose: 'Promote special bridal packages, offers, and seasonal campaigns.',
        templateName: WHATSAPP_TEMPLATES.SPECIAL_BRIDAL_PACKAGES.templateName,
        category: WHATSAPP_TEMPLATES.SPECIAL_BRIDAL_PACKAGES.category,
        approvalStatus: 'APPROVED',
        status: 'Active',
        badge: 'Manual Send Only',
        requiredParams: WHATSAPP_TEMPLATES.SPECIAL_BRIDAL_PACKAGES.requiredParams,
        preview: WHATSAPP_TEMPLATES.SPECIAL_BRIDAL_PACKAGES.format(sampleContext),
      },
    ];

    return {
      connectionStatus: isConnected ? 'CONNECTED' : 'DEVELOPMENT_SIMULATED',
      phoneNumber: business?.whatsapp_phone || business?.business_phone || null,
      templates,
    };
  },

  /**
   * Dispatch a test message for any automated WhatsApp template (1-8 or 9)
   * to verify Meta WhatsApp delivery on demand
   */
  async sendTestWhatsAppTemplate(businessId, userId, { template_key, recipient_phone, custom_params = {} }) {
    if (!recipient_phone) {
      throw ApiError.badRequest('Recipient phone number is required for test send');
    }

    const tplConfig = getWhatsAppTemplate(template_key);
    if (!tplConfig) {
      throw ApiError.notFound(`WhatsApp template not found for key: ${template_key}`);
    }

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        business_phone: true,
        whatsapp_phone: true,
        address_line1: true,
        city: true,
      },
    });

    const studioName = business?.name || 'Bridal Studio';
    const studioLocation = [business?.address_line1, business?.city].filter(Boolean).join(', ') || 'Studio';

    // Base defaults matching Meta template parameters
    const mergedParams = {
      customer_name: 'Ananya Sharma',
      studio_name: studioName,
      event_date: '28 Nov 2026',
      event_time: '09:00 AM',
      service_name: 'Bridal Makeover & Styling',
      package_name: 'Royal South Indian Bridal Package',
      studio_location: studioLocation,
      customer_phone: recipient_phone,
      total_amount: '35,000',
      amount_paid: '15,000',
      balance_due: '20,000',
      due_date: '20 Nov 2026',
      consultation_date: '15 Nov 2026',
      consultation_time: '11:00 AM',
      event_location: studioLocation,
      admin_name: 'Studio Owner',
      plan_name: 'Pro Studio Plan',
      expiry_date: '30 Nov 2026',
      subscription_status: 'Active',
      interested_service: 'HD Airbrush Makeup',
      offer_description: 'Special seasonal bridal package discount',
      offer_end_date: '30 Nov 2026',
      ...custom_params,
    };

    const formattedMessage = formatWhatsAppMessage(tplConfig.templateName, mergedParams);

    // Queue and dispatch immediately
    const job = await notificationService.queueNotification({
      businessId,
      recipient: recipient_phone,
      channel: 'WHATSAPP',
      subject: `Test: ${tplConfig.templateName}`,
      messageBody: formattedMessage,
      templateName: tplConfig.templateName,
      templateParams: mergedParams,
      idempotencyKey: `wa_test_${tplConfig.templateName}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      notificationType: 'TEST',
    });

    let dispatchResult = null;
    if (job) {
      dispatchResult = await notificationService.processJob(job.id);
    }

    if (dispatchResult?.status === 'FAILED' || (dispatchResult?.status !== 'SENT' && dispatchResult?.error_message)) {
      throw ApiError.badRequest(dispatchResult.error_message || 'WhatsApp test delivery failed via provider');
    }

    return {
      success: true,
      status: dispatchResult?.status || 'SENT',
      template_name: tplConfig.templateName,
      recipient: recipient_phone,
      provider_message_id: dispatchResult?.provider_message_id,
      message_preview: formattedMessage,
    };
  },

  /**
   * Diagnostic inspection for Meta WhatsApp configuration and registered templates
   */
  async getWhatsAppDiagnostics(businessId, user) {
    const diagnostics = await whatsappService.runDiagnostics();
    return diagnostics;
  },
};
