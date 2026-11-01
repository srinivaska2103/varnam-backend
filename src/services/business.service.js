import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { ApiError } from '../utils/apiResponse.js';
import { isReservedSlug, suggestAlternativeSlug } from '../utils/reservedSlugs.js';

/**
 * Generates an alphanumeric URL slug from a business name
 */
function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-') // Replace spaces with -
    .replace(/[^\w-]+/g, '') // Remove all non-word chars
    .replace(/--+/g, '-') // Replace multiple - with single -
    .replace(/^-+/, '') // Trim - from start of text
    .replace(/-+$/, ''); // Trim - from end of text
}

export const businessService = {
  /**
   * Create a new business:
   * 1. Checks if user already owns a business (prevents accidental duplicate ownership).
   * 2. Generates unique URL slug.
   * 3. Finds default Basic Monthly plan.
   * 4. In a single atomic Prisma transaction:
   *    - Creates business
   *    - Creates OWNER membership
   *    - Creates 14-day trial/active entitlement for Basic plan
   *    - Creates initial business_websites draft record
   */
  async createBusiness(userId, data) {
    // Check if user already owns an active business
    const existingOwnership = await prisma.business_members.findFirst({
      where: {
        user_id: userId,
        role: 'OWNER',
        is_active: true,
      },
      include: {
        businesses: true,
      },
    });

    if (existingOwnership) {
      throw ApiError.conflict('You already own an active bridal business. You can manage your existing studio.');
    }

    // Normalize field names
    const businessName = data.name.trim();
    const phone = data.business_phone || data.phone || null;
    const email = data.business_email || data.email || null;
    const whatsapp = data.whatsapp_phone || null;
    const address1 = data.address_line1 || data.address || null;
    const address2 = data.address_line2 || null;

    // Generate unique slug (guaranteed not reserved and unique in DB)
    let baseSlug = slugify(businessName) || 'bridal-studio';
    if (isReservedSlug(baseSlug)) {
      baseSlug = `${baseSlug}-studio`;
    }
    let uniqueSlug = baseSlug;
    let counter = 1;

    while (isReservedSlug(uniqueSlug) || (await prisma.businesses.findUnique({ where: { slug: uniqueSlug } }))) {
      uniqueSlug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Locate default Basic Monthly plan
    let defaultPlan = await prisma.plans.findUnique({
      where: { code: 'BASIC_MONTHLY' },
    });

    if (!defaultPlan) {
      // Fallback: seed plans if not yet seeded
      const { seedPlans } = await import('../../scripts/seed-plans.js');
      const seeded = await seedPlans();
      defaultPlan = seeded.basicPlan;
    }

    // Execute atomic creation transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Create Business
      const business = await tx.businesses.create({
        data: {
          name: businessName,
          slug: uniqueSlug,
          business_phone: phone,
          business_email: email,
          whatsapp_phone: whatsapp,
          address_line1: address1,
          address_line2: address2,
          city: data.city || null,
          state: data.state || null,
          postal_code: data.postal_code || null,
          country: data.country || 'IN',
          timezone: data.timezone || 'Asia/Kolkata',
          currency: data.currency || 'INR',
          status: 'ACTIVE',
        },
      });

      // 2. Create Owner Membership
      const membership = await tx.business_members.create({
        data: {
          business_id: business.id,
          user_id: userId,
          role: 'OWNER',
          is_active: true,
        },
      });

      // 3. Create initial 14-day trial entitlement for the Basic Plan
      const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      const entitlement = await tx.business_entitlements.create({
        data: {
          business_id: business.id,
          plan_id: defaultPlan.id,
          status: 'TRIAL',
          starts_at: new Date(),
          ends_at: trialEndsAt,
          auto_renew: false,
          notes: 'Standard 14-day trial on Basic Monthly plan upon studio registration.',
        },
        include: {
          plans: {
            select: {
              id: true,
              code: true,
              name: true,
              price_paise: true,
              billing_type: true,
            },
          },
        },
      });

      // 4. Create draft website container
      await tx.business_websites.create({
        data: {
          business_id: business.id,
          subdomain: uniqueSlug,
          site_title: business.name,
          contact_email: email,
          contact_phone: phone,
          whatsapp_phone: whatsapp,
          public_address: address1,
          status: 'DRAFT',
        },
      });

      // 5. Create audit log entry
      await tx.audit_logs.create({
        data: {
          business_id: business.id,
          actor_user_id: userId,
          action: 'BUSINESS_CREATED',
          entity_type: 'businesses',
          entity_id: business.id,
          details: {
            name: business.name,
            slug: business.slug,
            plan: defaultPlan.code,
          },
        },
      });

      return {
        business,
        membership: {
          id: membership.id,
          role: membership.role,
        },
        subscription: {
          status: entitlement.status,
          planName: entitlement.plans.name,
          planCode: entitlement.plans.code,
          trialEndsAt: entitlement.ends_at,
        },
      };
    });
  },

  /**
   * Get all businesses authorized for the authenticated user
   */
  async getMyBusinesses(userId) {
    const memberships = await prisma.business_members.findMany({
      where: {
        user_id: userId,
        is_active: true,
      },
      include: {
        businesses: {
          include: {
            business_entitlements: {
              include: {
                plans: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                    price_paise: true,
                    billing_type: true,
                  },
                },
              },
            },
            business_websites: {
              select: {
                subdomain: true,
                custom_domain: true,
                status: true,
              },
            },
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return memberships.map((m) => {
      const b = m.businesses;
      const plan = b.business_entitlements?.plans;
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        businessEmail: b.business_email,
        businessPhone: b.business_phone,
        whatsappPhone: b.whatsapp_phone,
        city: b.city,
        state: b.state,
        country: b.country,
        currency: b.currency,
        status: b.status,
        myRole: m.role,
        memberSince: m.created_at,
        subscription: b.business_entitlements
          ? {
              status: b.business_entitlements.status,
              planCode: plan?.code,
              planName: plan?.name,
              pricePaise: plan?.price_paise ? Number(plan.price_paise) : 0,
              endsAt: b.business_entitlements.ends_at,
            }
          : null,
        website: b.business_websites || null,
      };
    });
  },

  /**
   * Get single business details with membership authorization
   */
  async getBusinessById(businessId, userId) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
      },
      include: {
        businesses: {
          include: {
            business_entitlements: {
              include: {
                plans: {
                  include: {
                    plan_features: true,
                  },
                },
              },
            },
            business_websites: true,
            _count: {
              select: {
                customers: true,
                enquiries: true,
                bookings: true,
                services: true,
                inventory_items: true,
              },
            },
          },
        },
      },
    });

    if (!membership || !membership.businesses || membership.businesses.status !== 'ACTIVE') {
      throw ApiError.forbidden('You do not have access to this business');
    }

    const b = membership.businesses;
    const entitlement = b.business_entitlements;
    const plan = entitlement?.plans;

    return {
      id: b.id,
      name: b.name,
      slug: b.slug,
      businessEmail: b.business_email,
      businessPhone: b.business_phone,
      whatsappPhone: b.whatsapp_phone,
      logoUrl: b.logo_url,
      timezone: b.timezone,
      currency: b.currency,
      addressLine1: b.address_line1,
      addressLine2: b.address_line2,
      city: b.city,
      state: b.state,
      postalCode: b.postal_code,
      country: b.country,
      status: b.status,
      createdAt: b.created_at,
      myRole: membership.role,
      counts: b._count,
      subscription: entitlement
        ? {
            status: entitlement.status,
            planCode: plan?.code,
            planName: plan?.name,
            billingType: plan?.billing_type,
            pricePaise: plan?.price_paise ? Number(plan.price_paise) : 0,
            startsAt: entitlement.starts_at,
            endsAt: entitlement.ends_at,
            features: plan?.plan_features?.map((f) => ({
              featureKey: f.feature_key,
              enabled: f.enabled,
            })) || [],
          }
        : null,
      website: b.business_websites || null,
    };
  },

  /**
   * Update permitted business profile fields
   * Disallows modifying ownership, roles, subscription status, or sensitive tenant keys
   */
  async updateBusiness(businessId, userId, updateData) {
    // Verify membership has OWNER or MANAGER role
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
      },
    });

    if (!membership) {
      throw ApiError.forbidden('You do not have access to this business');
    }

    if (!['OWNER', 'MANAGER'].includes(membership.role)) {
      throw ApiError.forbidden('Only owners and managers can update business profile details');
    }

    // Filter permitted safe update fields
    const safeData = {};
    if (updateData.name !== undefined) safeData.name = updateData.name.trim();
    if (updateData.business_phone !== undefined) safeData.business_phone = updateData.business_phone || null;
    if (updateData.phone !== undefined && safeData.business_phone === undefined) safeData.business_phone = updateData.phone || null;
    if (updateData.business_email !== undefined) safeData.business_email = updateData.business_email || null;
    if (updateData.email !== undefined && safeData.business_email === undefined) safeData.business_email = updateData.email || null;
    if (updateData.whatsapp_phone !== undefined) safeData.whatsapp_phone = updateData.whatsapp_phone || null;
    if (updateData.logo_url !== undefined) safeData.logo_url = updateData.logo_url || null;
    if (updateData.address_line1 !== undefined) safeData.address_line1 = updateData.address_line1 || null;
    if (updateData.address !== undefined && safeData.address_line1 === undefined) safeData.address_line1 = updateData.address || null;
    if (updateData.address_line2 !== undefined) safeData.address_line2 = updateData.address_line2 || null;
    if (updateData.city !== undefined) safeData.city = updateData.city || null;
    if (updateData.state !== undefined) safeData.state = updateData.state || null;
    if (updateData.postal_code !== undefined) safeData.postal_code = updateData.postal_code || null;
    if (updateData.slug !== undefined && updateData.slug.trim()) {
      const targetSlug = slugify(updateData.slug.trim());
      if (isReservedSlug(targetSlug)) {
        throw ApiError.badRequest(`'${targetSlug}' is a reserved system keyword and cannot be used as a business slug.`);
      }
      const existing = await prisma.businesses.findFirst({
        where: { slug: targetSlug, id: { not: businessId } },
      });
      if (existing) {
        const suggestion = suggestAlternativeSlug(targetSlug, Math.floor(10 + Math.random() * 89));
        throw ApiError.conflict(`This studio URL slug is already taken. Try '${suggestion}' instead.`);
      }
      safeData.slug = targetSlug;
    }
    if (updateData.timezone !== undefined) safeData.timezone = updateData.timezone;
    if (updateData.currency !== undefined) safeData.currency = updateData.currency;
    safeData.updated_at = new Date();

    const updated = await prisma.businesses.update({
      where: { id: businessId },
      data: safeData,
    });

    // Record audit log
    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'BUSINESS_UPDATED',
        entity_type: 'businesses',
        entity_id: businessId,
        details: safeData,
      },
    });

    return updated;
  },

  /**
   * Business dashboard summary:
   * Returns business profile, module breakdown, real counts from database, and feature entitlements
   */
  async getBusinessSummary(businessId, userId) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
      },
      include: {
        businesses: {
          include: {
            business_entitlements: {
              include: {
                plans: {
                  include: {
                    plan_features: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!membership || !membership.businesses || membership.businesses.status !== 'ACTIVE') {
      throw ApiError.forbidden('You do not have access to this business');
    }

    const b = membership.businesses;
    const entitlement = b.business_entitlements;
    const plan = entitlement?.plans;

    // Fetch real metrics from actual database tables
    const [
      customersCount,
      enquiriesCount,
      confirmedBookingsCount,
      servicesCount,
      inventoryCount,
      staffCount,
    ] = await Promise.all([
      prisma.customers.count({ where: { business_id: businessId } }),
      prisma.enquiries.count({ where: { business_id: businessId } }),
      prisma.bookings.count({ where: { business_id: businessId, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'READY'] } } }),
      prisma.services.count({ where: { business_id: businessId } }),
      prisma.inventory_items.count({ where: { business_id: businessId } }),
      prisma.business_members.count({ where: { business_id: businessId, is_active: true } }),
    ]);

    // Build feature map
    const featureMap = {};
    if (plan?.plan_features) {
      plan.plan_features.forEach((f) => {
        featureMap[f.feature_key] = f.enabled;
      });
    }

    return {
      business: {
        id: b.id,
        name: b.name,
        slug: b.slug,
        city: b.city,
        currency: b.currency,
        status: b.status,
        myRole: membership.role,
      },
      subscription: {
        status: entitlement?.status || 'NO_SUBSCRIPTION',
        planCode: plan?.code || null,
        planName: plan?.name || 'No Active Plan',
        isExclusive: plan?.code === 'EXCLUSIVE_LIFETIME',
        endsAt: entitlement?.ends_at || null,
      },
      metrics: {
        customers: customersCount,
        enquiries: enquiriesCount,
        confirmedBookings: confirmedBookingsCount,
        services: servicesCount,
        inventoryItems: inventoryCount,
        activeStaff: staffCount,
      },
      featureEntitlements: {
        brandedWebsite: Boolean(featureMap['BRANDED_WEBSITE']),
        publicCatalogue: Boolean(featureMap['PUBLIC_SERVICE_CATALOGUE']),
        portfolioShowcase: Boolean(featureMap['PORTFOLIO_SHOWCASE']),
        websiteEnquiryForm: Boolean(featureMap['WEBSITE_ENQUIRY_FORM']),
        consultationRequests: Boolean(featureMap['CONSULTATION_REQUESTS']),
        locationSharing: Boolean(featureMap['LOCATION_SHARING']),
        customDomain: Boolean(featureMap['CUSTOM_DOMAIN_SUPPORT']),
      },
    };
  },

  /**
   * List team members/staff for a business with login metadata
   */
  async getBusinessMembers(businessId) {
    const members = await prisma.business_members.findMany({
      where: {
        business_id: businessId,
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            is_active: true,
            last_login_at: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      user_id: m.user_id,
      role: m.role,
      is_active: m.is_active && (m.users?.is_active ?? true),
      name: m.users?.name || 'Staff Member',
      email: m.users?.email,
      phone: m.users?.phone,
      last_login_at: m.users?.last_login_at,
      created_at: m.created_at,
    }));
  },

  /**
   * Admin Creates a USER account for this studio
   */
  async createStudioUser(businessId, adminUserId, data) {
    const { name, email, password, phone } = data;
    const normalizedEmail = email.trim().toLowerCase();

    // Verify current admin membership
    const adminMembership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: adminUserId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        businesses: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (!adminMembership) {
      throw ApiError.forbidden('Only studio administrators can create user accounts.');
    }

    const business = adminMembership.businesses;

    // Check if user already exists
    let existingUser = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    let createdUser;
    if (existingUser) {
      // Check if already a member of this studio
      const existingMembership = await prisma.business_members.findUnique({
        where: {
          business_id_user_id: {
            business_id: businessId,
            user_id: existingUser.id,
          },
        },
      });

      if (existingMembership) {
        throw ApiError.conflict('A member with this email address already exists in your studio.');
      }

      // If user exists in another studio or system, assign them to this studio as USER
      createdUser = existingUser;
      await prisma.business_members.create({
        data: {
          business_id: businessId,
          user_id: existingUser.id,
          role: 'USER',
          is_active: true,
        },
      });
    } else {
      // Create new user record
      createdUser = await prisma.users.create({
        data: {
          name: name.trim(),
          email: normalizedEmail,
          phone: phone ? phone.trim() : null,
          password_hash: passwordHash,
          is_email_verified: true, // Admin-created employee account is pre-verified
          is_active: true,
        },
      });

      // Create business membership with USER role
      await prisma.business_members.create({
        data: {
          business_id: businessId,
          user_id: createdUser.id,
          role: 'USER',
          is_active: true,
        },
      });
    }

    const loginUrl = `https://app.varnam.vexatech.in/${business.slug}/user/login`;
    const localLoginUrl = `/${business.slug}/user/login`;

    return {
      userId: createdUser.id,
      name: createdUser.name,
      email: createdUser.email,
      role: 'USER',
      isActive: true,
      studioName: business.name,
      studioSlug: business.slug,
      loginUrl,
      localLoginUrl,
    };
  },

  /**
   * Admin Toggles User Active Status
   */
  async toggleStudioUserStatus(businessId, adminUserId, targetUserId, isActive) {
    // Verify admin
    const adminMembership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: adminUserId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!adminMembership) {
      throw ApiError.forbidden('Only studio administrators can manage user status.');
    }

    if (adminUserId === targetUserId) {
      throw ApiError.badRequest('Administrators cannot deactivate their own account.');
    }

    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: targetUserId,
      },
    });

    if (!membership) {
      throw ApiError.notFound('Studio user not found.');
    }

    // Update membership status
    const updatedMembership = await prisma.business_members.update({
      where: { id: membership.id },
      data: { is_active: Boolean(isActive) },
    });

    return {
      userId: targetUserId,
      isActive: updatedMembership.is_active,
    };
  },

  /**
   * Admin Resets Studio User Password
   */
  async resetStudioUserPassword(businessId, adminUserId, targetUserId, newPassword) {
    const adminMembership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: adminUserId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!adminMembership) {
      throw ApiError.forbidden('Only studio administrators can reset user passwords.');
    }

    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: targetUserId,
      },
    });

    if (!membership) {
      throw ApiError.notFound('Studio user not found.');
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.users.update({
      where: { id: targetUserId },
      data: {
        password_hash: passwordHash,
        updated_at: new Date(),
      },
    });

    return {
      userId: targetUserId,
      message: 'Password has been updated successfully.',
    };
  },

  /**
   * Admin Deletes a Studio User / Revokes Studio Access
   */
  async deleteStudioUser(businessId, adminUserId, targetUserId) {
    // Verify admin privileges
    const adminMembership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: adminUserId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!adminMembership) {
      throw ApiError.forbidden('Only studio administrators can delete user accounts.');
    }

    if (adminUserId === targetUserId) {
      throw ApiError.badRequest('Administrators cannot delete their own account.');
    }

    // Verify target membership in this studio
    const targetMembership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: targetUserId,
      },
    });

    if (!targetMembership) {
      throw ApiError.notFound('Studio user membership not found.');
    }

    if (targetMembership.role === 'OWNER') {
      throw ApiError.forbidden('Studio Owner accounts cannot be deleted from here.');
    }

    // Delete membership from this business
    await prisma.business_members.delete({
      where: { id: targetMembership.id },
    });

    // Check if target user belongs to any other businesses
    const otherMemberships = await prisma.business_members.count({
      where: { user_id: targetUserId },
    });

    // If user has no other business memberships, check if user record itself can be safely cleaned up
    if (otherMemberships === 0) {
      try {
        await prisma.users.delete({
          where: { id: targetUserId },
        });
      } catch (e) {
        // If foreign key constraints on audit/history records prevent deleting the user row, deactivate it safely
        await prisma.users.update({
          where: { id: targetUserId },
          data: { is_active: false },
        });
      }
    }

    return {
      userId: targetUserId,
      deleted: true,
    };
  },
};
