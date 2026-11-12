import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';
import { emailService } from './email.service.js';
import { env } from '../config/env.js';

export const subscriptionService = {
  /**
   * List all available commercial plans and their included feature matrices
   */
  async getAvailablePlans() {
    const plans = await prisma.plans.findMany({
      where: { is_active: true },
      include: {
        plan_features: {
          orderBy: { feature_key: 'asc' },
        },
      },
      orderBy: { price_paise: 'asc' },
    });

    return plans.map((p) => {
      const baseRupees = Number(p.price_paise) / 100;
      const feeRupees = p.billing_type === 'RECURRING' ? Math.round(baseRupees * 0.02 * 100) / 100 : 0;
      const totalRupees = Math.round((baseRupees + feeRupees) * 100) / 100;
      const totalPaise = Math.round(totalRupees * 100);

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        billingType: p.billing_type,
        billingInterval: p.billing_interval,
        basePriceRupees: baseRupees,
        transactionFeePercent: p.billing_type === 'RECURRING' ? 2 : 0,
        transactionFeeRupees: feeRupees,
        pricePaise: totalPaise,
        priceRupees: totalRupees,
        currency: p.currency,
        description: p.description,
        features: p.plan_features.map((f) => ({
          key: f.feature_key,
          enabled: f.enabled,
          limit: f.numeric_limit,
        })),
      };
    });
  },

  /**
   * Get authenticated user's active business subscriptions and entitlements
   */
  async getMySubscriptions(userId) {
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

    return memberships.map((m) => {
      const b = m.businesses;
      const entitlement = b.business_entitlements;
      const plan = entitlement?.plans;

      return {
        businessId: b.id,
        businessName: b.name,
        businessSlug: b.slug,
        myRole: m.role,
        subscription: entitlement
          ? {
              status: entitlement.status,
              planCode: plan?.code,
              planName: plan?.name,
              billingType: plan?.billing_type,
              pricePaise: plan?.price_paise ? Number(plan.price_paise) : 0,
              startsAt: entitlement.starts_at,
              endsAt: entitlement.ends_at,
              autoRenew: entitlement.auto_renew,
              features: plan?.plan_features?.map((f) => ({
                key: f.feature_key,
                enabled: f.enabled,
              })) || [],
            }
          : null,
      };
    });
  },

  /**
   * Return authorized feature entitlements for a specific business
   */
  async getBusinessFeatures(businessId, userId) {
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

    if (!entitlement) {
      return {
        businessId: b.id,
        businessName: b.name,
        hasActiveSubscription: false,
        status: 'NO_SUBSCRIPTION',
        subscriptionStatus: 'NO_SUBSCRIPTION',
        features: {},
      };
    }

    const featureMap = {};
    if (plan?.plan_features) {
      plan.plan_features.forEach((f) => {
        featureMap[f.feature_key] = f.enabled;
      });
    }

    const now = new Date();
    const isWithinBillingPeriod = Boolean(entitlement.ends_at && new Date(entitlement.ends_at) > now);
    const isGracePeriodCancelled = entitlement.status === 'CANCELLED' && isWithinBillingPeriod;
    const isActive = ['ACTIVE', 'TRIAL'].includes(entitlement.status) || isGracePeriodCancelled;
    
    const isPremium = plan?.code === 'EXCLUSIVE_LIFETIME';
    const isGrowth = plan?.code === 'GROWTH_MONTHLY';
    const isStarter = plan?.code === 'BASIC_MONTHLY';

    // Parse scheduled plan changes stored in entitlement notes if available
    let scheduledChange = null;
    if (entitlement.notes) {
      try {
        if (entitlement.notes.startsWith('{') && entitlement.notes.includes('scheduledChange')) {
          const parsedNotes = JSON.parse(entitlement.notes);
          if (parsedNotes.scheduledChange) {
            scheduledChange = parsedNotes.scheduledChange;
          }
        }
      } catch (err) {
        // notes might be a plain string note
      }
    }

    return {
      businessId: b.id,
      businessName: b.name,
      hasActiveSubscription: isActive,
      status: entitlement.status,
      subscriptionStatus: entitlement.status,
      isCancelledGracePeriod: isGracePeriodCancelled,
      planCode: plan?.code || null,
      planName: plan?.name || 'No Active Plan',
      planTier: isPremium ? 'PREMIUM' : isGrowth ? 'GROWTH' : isStarter ? 'STARTER' : 'NONE',
      pricePaise: plan ? Number(plan.price_paise) : 0,
      priceRupees: plan ? Number(plan.price_paise) / 100 : 0,
      billingInterval: plan?.billing_interval || null,
      billingType: plan?.billing_type || null,
      isExclusive: isPremium,
      isPremium,
      isGrowth,
      isStarter,
      startsAt: entitlement.starts_at,
      endsAt: entitlement.ends_at,
      autoRenew: entitlement.auto_renew,
      purchaseReference: entitlement.purchase_reference,
      notes: entitlement.notes,
      scheduledChange,
      features: featureMap,
    };
  },

  /**
   * Schedule a plan change to take effect at the end of the current billing cycle
   */
  async schedulePlanChange(businessId, userId, targetPlanCode) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can modify subscription plans');
    }

    if (targetPlanCode === 'EXCLUSIVE_LIFETIME') {
      throw ApiError.badRequest('The Premium plan (₹29,999) requires contacting sales.');
    }

    const [entitlement, targetPlan] = await Promise.all([
      prisma.business_entitlements.findUnique({
        where: { business_id: businessId },
        include: { plans: true },
      }),
      prisma.plans.findUnique({
        where: { code: targetPlanCode },
      }),
    ]);

    if (!entitlement || !['ACTIVE', 'TRIAL'].includes(entitlement.status)) {
      throw ApiError.badRequest('An active subscription is required to schedule a plan change');
    }

    if (!targetPlan || !targetPlan.is_active) {
      throw ApiError.badRequest('Requested target plan is invalid or inactive');
    }

    if (entitlement.plans?.code === targetPlanCode) {
      throw ApiError.badRequest(`You are already subscribed to the ${targetPlan.name}`);
    }

    const effectiveDate = entitlement.ends_at || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const scheduledChange = {
      targetPlanCode: targetPlan.code,
      targetPlanName: targetPlan.name,
      targetPriceRupees: Number(targetPlan.price_paise) / 100,
      targetBillingInterval: targetPlan.billing_interval,
      effectiveDate: effectiveDate.toISOString(),
      currentPlanCode: entitlement.plans?.code,
      currentPlanName: entitlement.plans?.name,
      scheduledAt: new Date().toISOString(),
      actionType: targetPlanCode === 'GROWTH_MONTHLY' ? 'UPGRADE' : 'DOWNGRADE',
    };

    let existingNotesObj = {};
    if (entitlement.notes) {
      try {
        if (entitlement.notes.startsWith('{')) {
          existingNotesObj = JSON.parse(entitlement.notes);
        } else {
          existingNotesObj = { previousNote: entitlement.notes };
        }
      } catch (e) {
        existingNotesObj = { previousNote: entitlement.notes };
      }
    }

    const updatedNotes = JSON.stringify({
      ...existingNotesObj,
      scheduledChange,
    });

    const updated = await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        notes: updatedNotes,
      },
      include: { plans: true },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_CHANGE_SCHEDULED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updated.id,
        details: scheduledChange,
      },
    });

    return {
      success: true,
      message: `Plan change to ${targetPlan.name} has been scheduled for ${effectiveDate.toLocaleDateString('en-IN', { dateStyle: 'medium' })}.`,
      scheduledChange,
      currentPlanName: entitlement.plans?.name,
      effectiveDate,
    };
  },

  /**
   * Cancel a previously scheduled plan change
   */
  async cancelScheduledPlanChange(businessId, userId) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can modify subscription plans');
    }

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: { plans: true },
    });

    if (!entitlement || !entitlement.notes) {
      throw ApiError.badRequest('No scheduled plan change found');
    }

    let notesObj = {};
    try {
      if (entitlement.notes.startsWith('{')) {
        notesObj = JSON.parse(entitlement.notes);
      }
    } catch (e) {}

    delete notesObj.scheduledChange;

    const updated = await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        notes: Object.keys(notesObj).length > 0 ? JSON.stringify(notesObj) : null,
      },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_CHANGE_CANCELLED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updated.id,
        details: { planCode: entitlement.plans?.code },
      },
    });

    return {
      success: true,
      message: 'Scheduled plan change has been removed.',
    };
  },

  /**
   * Upgrade business subscription plan (STARTER / GROWTH / PREMIUM)
   */
  async upgradePlan(businessId, userId, targetPlanCode) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
      include: {
        businesses: true,
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can modify subscription plans');
    }

    const targetPlan = await prisma.plans.findUnique({
      where: { code: targetPlanCode },
      include: { plan_features: true },
    });

    if (!targetPlan || !targetPlan.is_active) {
      throw ApiError.badRequest('Requested subscription plan is invalid or inactive');
    }

    // Upsert entitlement for this business
    const startsAt = new Date();
    // 30 days for recurring monthly, 1 year (365 days) for one-time
    const isMonthly = String(targetPlan.billing_interval || '').toUpperCase() === 'MONTH' || String(targetPlan.billing_interval || '').toUpperCase() === 'MONTHLY';
    const endsAt = isMonthly
      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const updatedEntitlement = await prisma.business_entitlements.upsert({
      where: { business_id: businessId },
      create: {
        business_id: businessId,
        plan_id: targetPlan.id,
        status: 'ACTIVE',
        starts_at: startsAt,
        ends_at: endsAt,
        auto_renew: targetPlan.billing_type === 'RECURRING',
        notes: `Subscribed to ${targetPlan.name} via portal`,
      },
      update: {
        plan_id: targetPlan.id,
        status: 'ACTIVE',
        starts_at: startsAt,
        ends_at: endsAt,
        auto_renew: targetPlan.billing_type === 'RECURRING',
        notes: `Upgraded to ${targetPlan.name} via portal`,
      },
      include: {
        plans: {
          include: {
            plan_features: true,
          },
        },
      },
    });

    // Create audit log
    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_UPGRADED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updatedEntitlement.id,
        details: {
          planCode: targetPlan.code,
          planName: targetPlan.name,
          pricePaise: Number(targetPlan.price_paise),
        },
      },
    });

    return {
      success: true,
      planCode: targetPlan.code,
      planName: targetPlan.name,
      status: updatedEntitlement.status,
      startsAt: updatedEntitlement.starts_at,
      endsAt: updatedEntitlement.ends_at,
    };
  },

  /**
   * Cancel business subscription
   */
  async cancelSubscription(businessId, userId, reason = 'Cancelled by business owner') {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can cancel subscription');
    }

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: { plans: true },
    });

    if (!entitlement || entitlement.status !== 'ACTIVE') {
      throw ApiError.badRequest('No active subscription found to cancel');
    }

    if (entitlement.plans?.billing_type === 'ONE_TIME') {
      throw ApiError.badRequest('One-time purchases (such as Premium Lifetime) cannot be cancelled');
    }

    // Cancel in Razorpay Subscriptions API if cf_subscription_id exists
    if (entitlement.purchase_reference) {
      try {
        await razorpayClient.SubsCancelSubscription(entitlement.purchase_reference, {
          cancellation_reason: reason,
        });
      } catch (err) {
        // If Razorpay cancellation fails because it was a PG order fallback or already cancelled, continue gracefully
      }
    }

    const updated = await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        status: 'CANCELLED',
        auto_renew: false,
        notes: `Cancelled by user on ${new Date().toISOString()}. Reason: ${reason}`,
      },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_CANCELLED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updated.id,
        details: { reason, planCode: entitlement.plans?.code },
      },
    });

    return {
      success: true,
      status: updated.status,
      endsAt: updated.ends_at,
      message: 'Subscription has been cancelled. Features remain available until the end of your current billing period.',
    };
  },

  /**
   * Reactivate cancelled subscription if within valid period
   */
  async reactivateSubscription(businessId, userId) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can reactivate subscription');
    }

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: { plans: true },
    });

    if (!entitlement) {
      throw ApiError.badRequest('No subscription record found');
    }

    if (entitlement.status === 'ACTIVE') {
      throw ApiError.badRequest('Subscription is already active');
    }

    if (entitlement.status !== 'CANCELLED') {
      throw ApiError.badRequest(`Cannot reactivate subscription in ${entitlement.status} state. Please select a new plan.`);
    }

    // Check if period has already expired
    if (entitlement.ends_at && new Date(entitlement.ends_at) < new Date()) {
      throw ApiError.badRequest('Subscription period has expired. Please subscribe to a new plan to resume service.');
    }

    // Reactivate subscription
    const updated = await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        status: 'ACTIVE',
        auto_renew: entitlement.plans?.billing_type === 'RECURRING',
        notes: `Reactivated on ${new Date().toISOString()}`,
      },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_REACTIVATED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updated.id,
        details: { planCode: entitlement.plans?.code },
      },
    });

    return {
      success: true,
      status: updated.status,
      autoRenew: updated.auto_renew,
      endsAt: updated.ends_at,
      message: 'Subscription has been successfully reactivated.',
    };
  },

  /**
   * Toggle auto-renewal for recurring plans
   */
  async updateAutoRenewal(businessId, userId, autoRenew) {
    const membership = await prisma.business_members.findFirst({
      where: {
        business_id: businessId,
        user_id: userId,
        is_active: true,
        role: { in: ['OWNER', 'MANAGER'] },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Only business owners or managers can change auto-renewal settings');
    }

    const entitlement = await prisma.business_entitlements.findUnique({
      where: { business_id: businessId },
      include: { plans: true },
    });

    if (!entitlement || entitlement.status !== 'ACTIVE') {
      throw ApiError.badRequest('Active subscription is required to adjust auto-renewal');
    }

    if (entitlement.plans?.billing_type === 'ONE_TIME') {
      throw ApiError.badRequest('Auto-renewal is not applicable to one-time plans');
    }

    const updated = await prisma.business_entitlements.update({
      where: { business_id: businessId },
      data: {
        auto_renew: Boolean(autoRenew),
      },
    });

    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'SUBSCRIPTION_AUTORENEW_CHANGED',
        entity_type: 'SUBSCRIPTION',
        entity_id: updated.id,
        details: { autoRenew: Boolean(autoRenew), planCode: entitlement.plans?.code },
      },
    });

    return {
      success: true,
      autoRenew: updated.auto_renew,
      message: `Auto-renewal ${updated.auto_renew ? 'enabled' : 'disabled'} successfully.`,
    };
  },

  /**
   * Submit a Contact Sales enquiry for the Premium plan (₹29,999)
   */
  async submitContactSalesEnquiry(businessId, userId, data) {
    const { businessName, contactName, email, phone, requirements, planCode = 'EXCLUSIVE_LIFETIME' } = data;

    if (!contactName || !email || !phone) {
      throw ApiError.badRequest('Contact name, email address, and phone number are required.');
    }

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw ApiError.notFound('Business not found');
    }

    // 1. Persist in dedicated premium_sales_enquiries table
    const enquiry = await prisma.premium_sales_enquiries.create({
      data: {
        business_id: businessId,
        studio_name: businessName || business.name,
        contact_person: contactName,
        email,
        phone,
        requested_plan: 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
        status: 'NEW',
        requirements: requirements || 'Interested in Premium Branded Website & Dedicated Hosting package.',
      },
    });

    // 2. Persist in audit log
    const auditRecord = await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: userId,
        action: 'PREMIUM_CONTACT_SALES_SUBMITTED',
        entity_type: 'SUBSCRIPTION_ENQUIRY',
        entity_id: enquiry.id,
        details: {
          enquiryId: enquiry.id,
          businessName: businessName || business.name,
          contactName,
          email,
          phone,
          interestedPlan: 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
          requirements: requirements || 'Interested in Premium Branded Website & Dedicated Hosting package.',
          submittedAt: new Date().toISOString(),
        },
      },
    });

    // 3. Dispatch instant email notification to Super Admin
    const targetAdminEmail = process.env.SUPER_ADMIN_EMAIL || process.env.SUBSCRIPTION_ADMIN_EMAIL || 'vexatech.connect@gmail.com';
    emailService.sendSalesEnquiryNotificationToAdmin({
      adminEmail: targetAdminEmail,
      businessName: businessName || business.name,
      contactName,
      clientEmail: email,
      clientPhone: phone,
      requirements: requirements || '',
      planName: 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
    }).catch((err) => {
      console.warn('Asynchronous Contact Sales email delivery note:', err?.message || err);
    });

    return {
      success: true,
      enquiryId: enquiry.id,
      message: 'Thank you for your interest in VEXA TECH Premium! Our sales and engineering team will contact you within 24 business hours to finalize your custom domain setup and dedicated deployment.',
      details: {
        businessName: businessName || business.name,
        contactName,
        email,
        phone,
        plan: 'Premium — ₹29,999',
      },
    };
  },
};


