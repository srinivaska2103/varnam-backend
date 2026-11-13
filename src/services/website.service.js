import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { notificationService } from './notification.service.js';
import { emailTemplates } from '../utils/emailTemplates.js';
import { formatWhatsAppMessage } from '../utils/whatsappTemplates.js';
import { isReservedSlug, suggestAlternativeSlug } from '../utils/reservedSlugs.js';
import { bookingService } from './booking.service.js';

export const websiteService = {
  /**
   * Upsert website configuration for an authenticated business (Exclusive Plan)
   */
  async upsertWebsite(businessId, data) {
    // If subdomain is provided, validate reserved status and ensure uniqueness across all businesses
    if (data.subdomain) {
      const normalizedSubdomain = data.subdomain.toLowerCase().trim();
      if (isReservedSlug(normalizedSubdomain)) {
        throw ApiError.badRequest(
          `'${normalizedSubdomain}' is a reserved system keyword and cannot be used as a public website slug.`
        );
      }

      const existingWithSlug = await prisma.business_websites.findFirst({
        where: {
          subdomain: normalizedSubdomain,
          business_id: { not: businessId },
        },
      });
      if (existingWithSlug) {
        const suggestion = suggestAlternativeSlug(normalizedSubdomain, Math.floor(10 + Math.random() * 89));
        throw ApiError.conflict(
          `Public slug '${normalizedSubdomain}' is already taken. Try '${suggestion}' instead.`
        );
      }
    }

    if (data.custom_domain) {
      // Enforce plan entitlement: custom_domain requires Premium (CUSTOM_DOMAIN_SUPPORT)
      const entitlement = await prisma.business_entitlements.findUnique({
        where: { business_id: businessId },
        include: {
          plans: {
            include: { plan_features: true },
          },
        },
      });

      const hasDomainEntitlement = entitlement?.plans?.plan_features?.some(
        (f) => f.feature_key === 'CUSTOM_DOMAIN_SUPPORT' && f.enabled
      );

      if (!hasDomainEntitlement) {
        throw ApiError.forbidden(
          'Custom domain configuration is a Premium Plan feature. Please upgrade to the Premium Plan to connect your domain.'
        );
      }

      const existingDomain = await prisma.business_websites.findFirst({
        where: {
          custom_domain: data.custom_domain,
          business_id: { not: businessId },
        },
      });
      if (existingDomain) {
        throw ApiError.conflict(`Custom domain '${data.custom_domain}' is already registered with another business.`);
      }
    }

    // Default subdomain to business slug if website record does not exist yet
    const existing = await prisma.business_websites.findUnique({
      where: { business_id: businessId },
    });

    let subdomain = data.subdomain;
    if (!subdomain && !existing) {
      const biz = await prisma.businesses.findUnique({ where: { id: businessId } });
      subdomain = biz?.slug || `studio-${businessId.slice(0, 8)}`;
      // Check if business slug is already in use in websites table
      const slugTaken = await prisma.business_websites.findFirst({
        where: { subdomain, business_id: { not: businessId } },
      });
      if (slugTaken) {
        subdomain = `${subdomain}-${Date.now().toString(36)}`;
      }
    }

    const updatePayload = {
      ...(subdomain !== undefined ? { subdomain } : {}),
      ...(data.site_title !== undefined ? { site_title: data.site_title } : {}),
      ...(data.tagline !== undefined ? { tagline: data.tagline } : {}),
      ...(data.about_text !== undefined ? { about_text: data.about_text } : {}),
      ...(data.contact_email !== undefined ? { contact_email: data.contact_email } : {}),
      ...(data.contact_phone !== undefined ? { contact_phone: data.contact_phone } : {}),
      ...(data.whatsapp_phone !== undefined ? { whatsapp_phone: data.whatsapp_phone } : {}),
      ...(data.public_address !== undefined ? { public_address: data.public_address } : {}),
      ...(data.map_url !== undefined ? { map_url: data.map_url } : {}),
      ...(data.primary_color !== undefined ? { primary_color: data.primary_color } : {}),
      ...(data.logo_url !== undefined ? { logo_url: data.logo_url } : {}),
      ...(data.seo_title !== undefined ? { seo_title: data.seo_title } : {}),
      ...(data.seo_description !== undefined ? { seo_description: data.seo_description } : {}),
      ...(data.custom_domain !== undefined ? { custom_domain: data.custom_domain } : {}),
    };

    const website = await prisma.business_websites.upsert({
      where: { business_id: businessId },
      create: {
        business_id: businessId,
        subdomain: subdomain || `studio-${businessId.slice(0, 8)}`,
        status: 'DRAFT',
        ...updatePayload,
      },
      update: updatePayload,
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            city: true,
            state: true,
          },
        },
      },
    });

    return website;
  },

  /**
   * Get website configuration for authenticated business
   */
  async getWebsiteByBusinessId(businessId) {
    let website = await prisma.business_websites.findUnique({
      where: { business_id: businessId },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            business_email: true,
            business_phone: true,
            city: true,
            state: true,
            country: true,
          },
        },
      },
    });

    if (!website) {
      // Return a default draft representation with business details
      const biz = await prisma.businesses.findUnique({ where: { id: businessId } });
      if (!biz) throw ApiError.notFound('Business not found');

      return {
        id: null,
        business_id: businessId,
        status: 'DRAFT',
        subdomain: biz.slug,
        site_title: biz.name,
        tagline: 'Bridal & Makeup Artistry',
        contact_email: biz.business_email,
        contact_phone: biz.business_phone,
        logo_url: biz.logo_url,
        published_at: null,
        businesses: {
          id: biz.id,
          name: biz.name,
          slug: biz.slug,
          city: biz.city,
        },
      };
    }

    return website;
  },

  /**
   * Publish website
   */
  async publishWebsite(businessId) {
    // Verify business entitlement: Starter tier is strictly blocked from publishing
    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: {
        plans: {
          include: { plan_features: true },
        },
      },
    });

    const hasWebsiteEntitlement = entitlement?.plans?.plan_features?.some(
      (f) => f.feature_key === 'BRANDED_WEBSITE' && f.enabled
    );

    if (!hasWebsiteEntitlement) {
      throw ApiError.forbidden(
        'Public branded website is available on the Growth (₹999/mo) and Premium (₹29,999) plans. Please upgrade your plan to publish your website.'
      );
    }

    const existing = await prisma.business_websites.findUnique({
      where: { business_id: businessId },
    });

    if (!existing) {
      throw ApiError.badRequest('Please configure your website settings before publishing');
    }

    if (!existing.subdomain) {
      throw ApiError.badRequest('Website must have a valid public subdomain/slug before publishing');
    }

    const updated = await prisma.business_websites.update({
      where: { business_id: businessId },
      data: {
        status: 'PUBLISHED',
        published_at: existing.published_at || new Date(),
      },
    });

    return updated;
  },

  /**
   * Unpublish website
   */
  async unpublishWebsite(businessId) {
    const existing = await prisma.business_websites.findUnique({
      where: { business_id: businessId },
    });

    if (!existing) {
      throw ApiError.notFound('Website configuration not found');
    }

    const updated = await prisma.business_websites.update({
      where: { business_id: businessId },
      data: {
        status: 'DRAFT',
      },
    });

    return updated;
  },

  /**
   * Authenticated preview of the website including draft/published state
   */
  async getWebsitePreview(businessId) {
    const [website, biz, services, packages, portfolio, businessHours, aboutSection, footerSettings] = await Promise.all([
      prisma.business_websites.findUnique({ where: { business_id: businessId } }),
      prisma.businesses.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, slug: true, logo_url: true, city: true, state: true, currency: true },
      }),
      prisma.services.findMany({
        where: { business_id: businessId, is_active: true },
        select: { id: true, name: true, description: true, default_price_paise: true, duration_minutes: true },
        orderBy: { name: 'asc' },
      }),
      prisma.packages.findMany({
        where: { business_id: businessId, is_active: true },
        include: {
          package_services: {
            include: {
              services: { select: { id: true, name: true, duration_minutes: true } },
            },
          },
        },
        orderBy: { price_paise: 'asc' },
      }),
      prisma.portfolio_items.findMany({
        where: { business_id: businessId, is_public: true },
        orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
      }),
      prisma.studio_business_hours.findMany({
        where: { business_id: businessId },
        orderBy: { day_of_week: 'asc' },
      }),
      prisma.studio_about_sections.findFirst({
        where: { business_id: businessId, is_active: true },
        orderBy: { created_at: 'desc' },
      }),
      this.getFooterSettings(businessId),
    ]);

    return {
      preview_mode: true,
      status: website?.status || 'DRAFT',
      website: website || {
        business_id: businessId,
        subdomain: biz.slug,
        site_title: biz.name,
        status: 'DRAFT',
      },
      business: biz,
      services,
      packages,
      portfolio,
      business_hours: businessHours,
      about_section: aboutSection,
      footer_settings: footerSettings,
    };
  },

  // =========================================================================
  // PUBLIC WEBSITE APIS (Read-only, no auth required, strictly PUBLISHED)
  // =========================================================================

  /**
   * Find published website by public slug (subdomain or business slug)
   */
  async getPublicWebsiteBySlug(slug, isPreview = false) {
    const normalizedSlug = slug.toLowerCase().trim();

    // Try finding by website subdomain first, then fallback to business slug
    const website = await prisma.business_websites.findFirst({
      where: {
        OR: [
          { subdomain: normalizedSlug },
          { businesses: { slug: normalizedSlug } },
        ],
        ...(isPreview ? {} : { status: 'PUBLISHED' }),
      },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
            logo_url: true,
            city: true,
            state: true,
            currency: true,
          },
        },
      },
    });

    if (!website) {
      throw ApiError.notFound('Website not found or is currently not published');
    }

    const [businessHours, aboutSection, footerSettings] = await Promise.all([
      prisma.studio_business_hours.findMany({
        where: { business_id: website.business_id },
        orderBy: { day_of_week: 'asc' },
      }),
      prisma.studio_about_sections.findFirst({
        where: { business_id: website.business_id, is_active: true },
        orderBy: { created_at: 'desc' },
      }),
      this.getFooterSettings(website.business_id),
    ]);

    // Sanitize output: Return strictly public-facing info
    return {
      subdomain: website.subdomain,
      site_title: website.site_title || website.businesses.name,
      tagline: website.tagline,
      about_text: website.about_text,
      contact_email: website.contact_email,
      contact_phone: website.contact_phone,
      whatsapp_phone: website.whatsapp_phone,
      public_address: website.public_address,
      map_url: website.map_url,
      primary_color: website.primary_color || '#D4AF37',
      logo_url: website.logo_url || website.businesses.logo_url,
      seo_title: website.seo_title,
      seo_description: website.seo_description,
      business: {
        name: website.businesses.name,
        city: website.businesses.city,
        state: website.businesses.state,
        currency: website.businesses.currency,
      },
      status: website.status,
      preview_mode: Boolean(isPreview),
      published_at: website.published_at,
      business_hours: businessHours,
      about_section: aboutSection,
      footer_settings: footerSettings,
    };
  },

  /**
   * Get active public services for a published website
   */
  async getPublicServices(slug, isPreview = false) {
    const website = await this.resolvePublishedWebsite(slug, isPreview);

    const services = await prisma.services.findMany({
      where: {
        business_id: website.business_id,
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        default_price_paise: true,
        duration_minutes: true,
      },
      orderBy: { name: 'asc' },
    });

    return services;
  },

  /**
   * Get active public packages for a published website
   */
  async getPublicPackages(slug, isPreview = false) {
    const website = await this.resolvePublishedWebsite(slug, isPreview);

    const packages = await prisma.packages.findMany({
      where: {
        business_id: website.business_id,
        is_active: true,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price_paise: true,
        package_services: {
          select: {
            services: {
              select: {
                id: true,
                name: true,
                duration_minutes: true,
              },
            },
          },
        },
      },
      orderBy: { price_paise: 'asc' },
    });

    // Format included services cleanly
    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      description: pkg.description,
      price_paise: pkg.price_paise,
      included_services: pkg.package_services.map((ps) => ps.services),
    }));
  },

  /**
   * Get public portfolio items for a published website
   */
  async getPublicPortfolio(slug, isPreview = false) {
    const website = await this.resolvePublishedWebsite(slug, isPreview);

    const portfolio = await prisma.portfolio_items.findMany({
      where: {
        business_id: website.business_id,
        is_public: true,
      },
      select: {
        id: true,
        title: true,
        description: true,
        image_url: true,
        category: true,
        display_order: true,
        created_at: true,
      },
      orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
    });

    return portfolio;
  },

  /**
   * Submit enquiry through public website form
   */
  async submitPublicEnquiry(slug, data) {
    const website = await this.resolvePublishedWebsite(slug);
    const businessId = website.business_id;

    // Verify service if provided
    if (data.selected_service_id) {
      const srv = await prisma.services.findFirst({
        where: { id: data.selected_service_id, business_id: businessId, is_active: true },
      });
      if (!srv) {
        throw ApiError.badRequest('Selected service is invalid or unavailable');
      }
    }

    // Verify package if provided
    if (data.selected_package_id) {
      const pkg = await prisma.packages.findFirst({
        where: { id: data.selected_package_id, business_id: businessId, is_active: true },
      });
      if (!pkg) {
        throw ApiError.badRequest('Selected package is invalid or unavailable');
      }
    }

    const customerName = data.customer_name || data.name;
    const customerPhone = data.customer_phone || data.phone;
    const customerEmail = data.customer_email || data.email || null;

    // Validate event date availability if provided
    if (data.event_date) {
      await bookingService.assertDateAvailable(businessId, data.event_date);
    }

    // Find or create customer by phone for this business
    let customer = await prisma.customers.findUnique({
      where: {
        business_id_phone: {
          business_id: businessId,
          phone: customerPhone,
        },
      },
    });

    if (!customer) {
      customer = await prisma.customers.create({
        data: {
          business_id: businessId,
          full_name: customerName,
          phone: customerPhone,
          email: customerEmail,
        },
      });
    }

    // Build comprehensive notes
    const noteParts = [];
    if (data.service_interested) noteParts.push(`Service Interested: ${data.service_interested}`);
    if (data.message) noteParts.push(`Message: ${data.message}`);
    const notesSummary = noteParts.length > 0
      ? `Website Enquiry: ${noteParts.join(' | ')}`
      : 'Enquiry submitted via branded website';

    // Create enquiry under this business in NEW status
    const enquiry = await prisma.enquiries.create({
      data: {
        business_id: businessId,
        customer_id: customer.id,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail,
        status: 'NEW',
        source: 'BRANDED_WEBSITE',
        source_reference: `/${website.subdomain}`,
        event_kind: data.event_kind || 'WEDDING',
        event_date: data.event_date ? new Date(data.event_date) : null,
        event_venue: data.location || null,
        selected_package_id: data.selected_package_id || null,
        notes: notesSummary,
      },
    });

    // Record audit log entry
    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        action: 'WEBSITE_ENQUIRY_RECEIVED',
        entity_type: 'ENQUIRY',
        entity_id: enquiry.id,
        details: {
          customer_name: data.customer_name,
          customer_phone: data.customer_phone,
          source: 'PUBLIC_WEBSITE',
        },
      },
    });

    // Send email & WhatsApp notifications asynchronously without blocking customer response
    (async () => {
      try {
        const biz = await prisma.businesses.findUnique({
          where: { id: businessId },
          select: {
            id: true,
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
        const contactPhone = biz?.whatsapp_phone || biz?.business_phone || '';
        const studioAddress = biz?.business_websites?.public_address || [biz?.address_line1, biz?.city, biz?.state].filter(Boolean).join(', ') || 'Studio';
        const eventDateFormatted = enquiry.event_date ? enquiry.event_date.toISOString().split('T')[0] : (data.event_date || 'Date TBD');
        const serviceName = data.service_interested || data.event_kind || 'Bridal Makeup';

        // 1. WhatsApp Notification: Customer Acknowledgement (CUSTOMER_ENQUIRY_ACK / new_enquirt_2)
        if (customerPhone) {
          try {
            const waAckParams = {
              customer_name: customerName,
              studio_name: bizName,
              event_date: eventDateFormatted,
              service_name: serviceName,
              studio_location: studioAddress,
              phone_number: contactPhone || 'Our Studio',
            };
            const waAckBody = formatWhatsAppMessage('CUSTOMER_ENQUIRY_ACK', waAckParams);

            const waAckJob = await notificationService.queueNotification({
              businessId,
              recipient: customerPhone,
              channel: 'WHATSAPP',
              subject: 'Bridal Enquiry Acknowledgement',
              messageBody: waAckBody,
              templateName: 'new_enquirt_2',
              templateParams: waAckParams,
              idempotencyKey: `wa_web_enq_ack_${enquiry.id}_${customerPhone}`,
              customerId: customer.id,
              enquiryId: enquiry.id,
              notificationType: 'TRANSACTIONAL',
            });

            if (waAckJob) {
              await notificationService.processJob(waAckJob.id);
            }
          } catch (waCustErr) {
            console.warn('[WebsiteService] WhatsApp customer ack error:', waCustErr.message);
          }
        }

        // 2. WhatsApp Notification: Admin Alert (ADMIN_ENQUIRY_ALERT / new_enquiry_alert__admin)
        const adminWhatsapp = biz?.whatsapp_phone || biz?.business_phone;
        if (adminWhatsapp) {
          try {
            const waAdminParams = {
              customer_name: customerName,
              customer_phone: customerPhone || 'Not provided',
              event_date: eventDateFormatted,
              service_name: serviceName,
            };
            const waAdminBody = formatWhatsAppMessage('ADMIN_ENQUIRY_ALERT', waAdminParams);

            const waAdminJob = await notificationService.queueNotification({
              businessId,
              recipient: adminWhatsapp,
              channel: 'WHATSAPP',
              subject: 'New Bridal Enquiry Alert',
              messageBody: waAdminBody,
              templateName: 'new_enquiry_alert__admin',
              templateParams: waAdminParams,
              idempotencyKey: `wa_web_enq_admin_${enquiry.id}_${adminWhatsapp}`,
              enquiryId: enquiry.id,
              notificationType: 'TRANSACTIONAL',
            });

            if (waAdminJob) {
              await notificationService.processJob(waAdminJob.id);
            }
          } catch (waAdminErr) {
            console.warn('[WebsiteService] WhatsApp admin alert error:', waAdminErr.message);
          }
        }

        // 3. Email Notification to Studio Admin
        if (biz?.business_email) {
          try {
            const emailTpl = emailTemplates.websiteEnquiryAlert({
              customerName: customerName,
              customerPhone: customerPhone,
              customerEmail: customerEmail,
              eventDate: eventDateFormatted,
              message: data.message,
              businessName: bizName,
            });

            await notificationService.triggerEventNotification({
              businessId,
              eventKey: 'NEW_ENQUIRY',
              recipientEmail: biz.business_email,
              subject: emailTpl.subject,
              htmlBody: emailTpl.html,
              enquiryId: enquiry.id,
              idempotencyKey: `enq-alert-${enquiry.id}`,
            });
          } catch (emailErr) {
            console.warn('[WebsiteService] Admin email notification error:', emailErr.message);
          }
        }
      } catch (notifErr) {
        console.warn('⚠️ Non-fatal notification error on website enquiry:', notifErr.message);
      }
    })();

    return {
      enquiry_id: enquiry.id,
      message: 'Thank you! Your bridal enquiry has been received. Connect on WhatsApp or visit our studio to finalize your consultation.',
    };
  },

  /**
   * Submit public consultation request through branded website
   */
  async submitPublicConsultation(slug, data) {
    const website = await this.resolvePublishedWebsite(slug);
    const businessId = website.business_id;

    // Create consultation request in REQUESTED status
    let scheduledStart = null;
    let scheduledEnd = null;

    if (data.preferred_date) {
      const timeStr = data.preferred_time || '10:00:00';
      scheduledStart = new Date(`${data.preferred_date}T${timeStr}.000Z`);
      scheduledEnd = new Date(scheduledStart.getTime() + 60 * 60 * 1000); // 1-hour window
    }

    const consultation = await prisma.consultations.create({
      data: {
        business_id: businessId,
        requested_name: data.requested_name,
        requested_phone: data.requested_phone,
        consultation_type: data.consultation_type || 'IN_PERSON',
        status: 'REQUESTED',
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
        notes: data.notes
          ? `Public website request: ${data.notes} (Email: ${data.requested_email || 'N/A'})`
          : `Requested via branded website (Email: ${data.requested_email || 'N/A'})`,
      },
    });

    // Record audit log
    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        action: 'PUBLIC_CONSULTATION_REQUESTED',
        entity_type: 'CONSULTATION',
        entity_id: consultation.id,
        details: {
          client: data.requested_name,
          phone: data.requested_phone,
          consultation_type: data.consultation_type,
        },
      },
    });

    return {
      consultation_id: consultation.id,
      status: 'REQUESTED',
      message: 'Your consultation request has been submitted. The bridal studio will review and confirm your slot.',
    };
  },

  /**
   * Helper: Resolve and verify a published website by slug (or any status if preview)
   */
  async resolvePublishedWebsite(slug, isPreview = false) {
    const normalizedSlug = slug.toLowerCase().trim();
    const website = await prisma.business_websites.findFirst({
      where: {
        OR: [
          { subdomain: normalizedSlug },
          { businesses: { slug: normalizedSlug } },
        ],
        ...(isPreview ? {} : { status: 'PUBLISHED' }),
      },
      select: {
        id: true,
        business_id: true,
        subdomain: true,
        status: true,
      },
    });

    if (!website) {
      throw ApiError.notFound('Published website not found');
    }

    return website;
  },

  // =========================================================================
  // PORTFOLIO MANAGEMENT APIS (Protected, requires PORTFOLIO_SHOWCASE)
  // =========================================================================

  /**
   * Create a portfolio item
   */
  async createPortfolioItem(businessId, data) {
    const item = await prisma.portfolio_items.create({
      data: {
        business_id: businessId,
        title: data.title || null,
        description: data.description || null,
        image_url: data.image_url,
        category: data.category || null,
        display_order: data.display_order ?? 0,
        is_public: data.is_public ?? true,
      },
    });

    return item;
  },

  /**
   * List portfolio items for authenticated business
   */
  async listPortfolio(businessId, { category, isPublic } = {}) {
    const where = {
      business_id: businessId,
      ...(category ? { category } : {}),
      ...(isPublic !== undefined ? { is_public: isPublic === 'true' || isPublic === true } : {}),
    };

    const items = await prisma.portfolio_items.findMany({
      where,
      orderBy: [{ display_order: 'asc' }, { created_at: 'desc' }],
    });

    return items;
  },

  /**
   * Get portfolio item by ID
   */
  async getPortfolioItemById(businessId, itemId) {
    const item = await prisma.portfolio_items.findFirst({
      where: { id: itemId, business_id: businessId },
    });

    if (!item) {
      throw ApiError.notFound('Portfolio item not found in this business');
    }

    return item;
  },

  /**
   * Update portfolio item
   */
  async updatePortfolioItem(businessId, itemId, data) {
    await this.getPortfolioItemById(businessId, itemId);

    const updated = await prisma.portfolio_items.update({
      where: { id: itemId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.image_url !== undefined ? { image_url: data.image_url } : {}),
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.display_order !== undefined ? { display_order: data.display_order } : {}),
        ...(data.is_public !== undefined ? { is_public: data.is_public } : {}),
      },
    });

    return updated;
  },

  /**
   * Publish portfolio item (make public)
   */
  async publishPortfolioItem(businessId, itemId) {
    await this.getPortfolioItemById(businessId, itemId);

    const updated = await prisma.portfolio_items.update({
      where: { id: itemId },
      data: { is_public: true },
    });

    return updated;
  },

  /**
   * Archive/hide portfolio item (make private)
   */
  async archivePortfolioItem(businessId, itemId) {
    await this.getPortfolioItemById(businessId, itemId);

    const updated = await prisma.portfolio_items.update({
      where: { id: itemId },
      data: { is_public: false },
    });

    return updated;
  },

  /**
   * Delete a portfolio item permanently
   */
  async deletePortfolioItem(businessId, itemId) {
    await this.getPortfolioItemById(businessId, itemId);

    await prisma.portfolio_items.delete({
      where: { id: itemId },
    });

    return { id: itemId, deleted: true };
  },

  // =========================================================================
  // STUDIO BUSINESS HOURS MANAGEMENT
  // =========================================================================

  /**
   * Get business hours for a studio
   */
  async getBusinessHours(businessId) {
    const hours = await prisma.studio_business_hours.findMany({
      where: { business_id: businessId },
      orderBy: { day_of_week: 'asc' },
    });

    // If no custom hours set, return standard 7 days defaults
    if (hours.length === 0) {
      const defaultDays = [
        { day_of_week: 0, is_closed: true, open_time: '10:00 AM', close_time: '06:00 PM' }, // Sun
        { day_of_week: 1, is_closed: false, open_time: '09:00 AM', close_time: '08:00 PM' }, // Mon
        { day_of_week: 2, is_closed: false, open_time: '09:00 AM', close_time: '08:00 PM' }, // Tue
        { day_of_week: 3, is_closed: false, open_time: '09:00 AM', close_time: '08:00 PM' }, // Wed
        { day_of_week: 4, is_closed: false, open_time: '09:00 AM', close_time: '08:00 PM' }, // Thu
        { day_of_week: 5, is_closed: false, open_time: '09:00 AM', close_time: '08:00 PM' }, // Fri
        { day_of_week: 6, is_closed: false, open_time: '09:00 AM', close_time: '08:30 PM' }, // Sat
      ];
      return defaultDays;
    }

    return hours;
  },

  /**
   * Upsert business hours for all 7 days
   */
  async updateBusinessHours(businessId, hoursArray) {
    const results = await prisma.$transaction(
      hoursArray.map((h) =>
        prisma.studio_business_hours.upsert({
          where: {
            business_id_day_of_week: {
              business_id: businessId,
              day_of_week: h.day_of_week,
            },
          },
          create: {
            business_id: businessId,
            day_of_week: h.day_of_week,
            is_closed: Boolean(h.is_closed),
            open_time: h.is_closed ? null : h.open_time || '09:00 AM',
            close_time: h.is_closed ? null : h.close_time || '08:00 PM',
          },
          update: {
            is_closed: Boolean(h.is_closed),
            open_time: h.is_closed ? null : h.open_time || '09:00 AM',
            close_time: h.is_closed ? null : h.close_time || '08:00 PM',
            updated_at: new Date(),
          },
        })
      )
    );

    return results;
  },

  // =========================================================================
  // STUDIO ABOUT SECTION MANAGEMENT
  // =========================================================================

  /**
   * Get about section for studio
   */
  async getStudioAboutSection(businessId) {
    const section = await prisma.studio_about_sections.findFirst({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
    });
    return section;
  },

  /**
   * Upsert about section for studio
   */
  async upsertStudioAboutSection(businessId, data) {
    const existing = await prisma.studio_about_sections.findFirst({
      where: { business_id: businessId },
      orderBy: { created_at: 'desc' },
    });

    if (existing) {
      return await prisma.studio_about_sections.update({
        where: { id: existing.id },
        data: {
          title: data.title ?? existing.title,
          subtitle: data.subtitle ?? existing.subtitle,
          description: data.description ?? existing.description,
          experience_years: data.experience_years ?? existing.experience_years,
          brides_styled: data.brides_styled ?? existing.brides_styled,
          awards_count: data.awards_count ?? existing.awards_count,
          image_url: data.image_url ?? existing.image_url,
          secondary_image_url: data.secondary_image_url ?? existing.secondary_image_url,
          is_active: data.is_active ?? existing.is_active,
          updated_at: new Date(),
        },
      });
    }

    return await prisma.studio_about_sections.create({
      data: {
        business_id: businessId,
        title: data.title || 'About Our Studio',
        subtitle: data.subtitle || 'Where Bridal Artistry Meets Timeless Elegance',
        description: data.description || '',
        experience_years: data.experience_years || '8+ Years',
        brides_styled: data.brides_styled || '500+ Happy Brides',
        awards_count: data.awards_count || '15+ Bridal Awards',
        image_url: data.image_url || null,
        secondary_image_url: data.secondary_image_url || null,
        is_active: data.is_active ?? true,
      },
    });
  },

  /**
   * Get footer settings for a business (authenticated or fallback defaults)
   */
  async getFooterSettings(businessId) {
    const [footer, biz, website] = await Promise.all([
      prisma.studio_footer_settings.findUnique({ where: { business_id: businessId } }),
      prisma.businesses.findUnique({
        where: { id: businessId },
        select: {
          id: true,
          name: true,
          slug: true,
          logo_url: true,
          business_phone: true,
          business_email: true,
          address_line1: true,
          city: true,
          state: true,
        },
      }),
      prisma.business_websites.findUnique({
        where: { business_id: businessId },
        select: {
          site_title: true,
          tagline: true,
          logo_url: true,
          contact_email: true,
          contact_phone: true,
          public_address: true,
          map_url: true,
          primary_color: true,
        },
      }),
    ]);

    if (!biz) {
      throw ApiError.notFound('Business not found');
    }

    const defaultStudioName = website?.site_title || biz.name;
    const defaultLogo = website?.logo_url || biz.logo_url;
    const defaultAddress = website?.public_address || (biz.city && biz.state ? `${biz.city}, ${biz.state}` : biz.city || '');
    const defaultPhone = website?.contact_phone || biz.business_phone || '';
    const defaultEmail = website?.contact_email || biz.business_email || '';

    const defaultQuickLinks = [
      { id: 'home', label: 'Home', url: '#', enabled: true },
      { id: 'about', label: 'About Us', url: '#about', enabled: true },
      { id: 'services', label: 'Services', url: '#services', enabled: true },
      { id: 'packages', label: 'Packages', url: '#packages', enabled: true },
      { id: 'portfolio', label: 'Portfolio', url: '#portfolio', enabled: true },
      { id: 'contact', label: 'Contact Us', url: '#contact', enabled: true },
    ];

    if (!footer) {
      return {
        id: null,
        business_id: businessId,
        logo_url: defaultLogo,
        studio_name: defaultStudioName,
        description: website?.tagline || 'Bridal makeup artistry for your most memorable moments.',
        layout: 'multi_column',
        background_color: '#1C1917',
        text_color: '#A8A29E',
        accent_color: website?.primary_color || '#F97316',
        copyright_text: `© ${new Date().getFullYear()} ${defaultStudioName}. All rights reserved.`,
        show_logo: true,
        show_social_links: true,
        show_quick_links: true,
        show_contact_info: true,
        show_copyright: true,
        social_links: [
          { platform: 'instagram', url: '', enabled: false },
          { platform: 'facebook', url: '', enabled: false },
          { platform: 'youtube', url: '', enabled: false },
          { platform: 'whatsapp', url: defaultPhone, enabled: Boolean(defaultPhone) },
          { platform: 'pinterest', url: '', enabled: false },
          { platform: 'linkedin', url: '', enabled: false },
        ],
        quick_links: defaultQuickLinks,
        contact_settings: {
          phone: defaultPhone,
          show_phone: true,
          email: defaultEmail,
          show_email: true,
          address: defaultAddress,
          show_address: true,
          map_url: website?.map_url || '',
          show_map: true,
          show_hours: true,
        },
      };
    }

    return {
      ...footer,
      studio_name: footer.studio_name || defaultStudioName,
      logo_url: footer.logo_url || defaultLogo,
      copyright_text: footer.copyright_text || `© ${new Date().getFullYear()} ${footer.studio_name || defaultStudioName}. All rights reserved.`,
      quick_links: Array.isArray(footer.quick_links) && footer.quick_links.length > 0 ? footer.quick_links : defaultQuickLinks,
      social_links: Array.isArray(footer.social_links) ? footer.social_links : [],
      contact_settings: footer.contact_settings && typeof footer.contact_settings === 'object' ? footer.contact_settings : {},
    };
  },

  /**
   * Upsert footer settings for a business (Owner/Manager protected, tenant isolated)
   */
  async upsertFooterSettings(businessId, data) {
    const existing = await prisma.studio_footer_settings.findUnique({
      where: { business_id: businessId },
    });

    const payload = {
      logo_url: data.logo_url !== undefined ? data.logo_url : existing?.logo_url,
      studio_name: data.studio_name !== undefined ? data.studio_name : existing?.studio_name,
      description: data.description !== undefined ? data.description : existing?.description,
      layout: data.layout || existing?.layout || 'multi_column',
      background_color: data.background_color || existing?.background_color || '#1C1917',
      text_color: data.text_color || existing?.text_color || '#A8A29E',
      accent_color: data.accent_color || existing?.accent_color || '#F97316',
      copyright_text: data.copyright_text !== undefined ? data.copyright_text : existing?.copyright_text,
      show_logo: data.show_logo !== undefined ? Boolean(data.show_logo) : (existing?.show_logo ?? true),
      show_social_links: data.show_social_links !== undefined ? Boolean(data.show_social_links) : (existing?.show_social_links ?? true),
      show_quick_links: data.show_quick_links !== undefined ? Boolean(data.show_quick_links) : (existing?.show_quick_links ?? true),
      show_contact_info: data.show_contact_info !== undefined ? Boolean(data.show_contact_info) : (existing?.show_contact_info ?? true),
      show_copyright: data.show_copyright !== undefined ? Boolean(data.show_copyright) : (existing?.show_copyright ?? true),
      social_links: data.social_links !== undefined ? data.social_links : (existing?.social_links || []),
      quick_links: data.quick_links !== undefined ? data.quick_links : (existing?.quick_links || []),
      contact_settings: data.contact_settings !== undefined ? data.contact_settings : (existing?.contact_settings || {}),
      updated_at: new Date(),
    };

    if (existing) {
      return await prisma.studio_footer_settings.update({
        where: { business_id: businessId },
        data: payload,
      });
    }

    return await prisma.studio_footer_settings.create({
      data: {
        business_id: businessId,
        ...payload,
      },
    });
  },
};


