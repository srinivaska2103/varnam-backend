import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

export const adminService = {
  /**
   * 1. Dashboard Overview Statistics
   * Real database aggregations for accounts, subscriptions, revenue, and churn
   */
  async getDashboardOverview() {
    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfPreviousMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // 1. Total Accounts & Registration Trends
    const [
      totalAccounts,
      accountsThisMonth,
      accountsPreviousMonth,
      accountsToday,
      accountsLast30Days,
    ] = await Promise.all([
      prisma.businesses.count(),
      prisma.businesses.count({
        where: { created_at: { gte: startOfCurrentMonth } },
      }),
      prisma.businesses.count({
        where: {
          created_at: {
            gte: startOfPreviousMonth,
            lte: endOfPreviousMonth,
          },
        },
      }),
      prisma.businesses.count({
        where: { created_at: { gte: startOfToday } },
      }),
      prisma.businesses.count({
        where: { created_at: { gte: thirtyDaysAgo } },
      }),
    ]);

    const accountsMoMChange =
      accountsPreviousMonth > 0
        ? Number((((accountsThisMonth - accountsPreviousMonth) / accountsPreviousMonth) * 100).toFixed(1))
        : null;

    // 2. Subscriptions Breakdown
    const [
      activeSubscriptionsCount,
      starterSubscriptionsCount,
      growthSubscriptionsCount,
      premiumSubscriptionsCount,
      cancelledActiveSubscriptionsCount,
      expiredSubscriptionsCount,
      trialAccountsCount,
      upcomingRenewalsCount,
    ] = await Promise.all([
      // Active paid subscriptions (Starter & Growth)
      prisma.business_entitlements.count({
        where: {
          status: 'ACTIVE',
          plans: { code: { in: ['BASIC_MONTHLY', 'GROWTH_MONTHLY'] } },
        },
      }),
      // Starter active
      prisma.business_entitlements.count({
        where: {
          status: 'ACTIVE',
          plans: { code: 'BASIC_MONTHLY' },
        },
      }),
      // Growth active
      prisma.business_entitlements.count({
        where: {
          status: 'ACTIVE',
          plans: { code: 'GROWTH_MONTHLY' },
        },
      }),
      // Premium one-time active
      prisma.business_entitlements.count({
        where: {
          status: 'ACTIVE',
          plans: { code: 'EXCLUSIVE_LIFETIME' },
        },
      }),
      // Cancelled but paid-through ends_at >= now
      prisma.business_entitlements.count({
        where: {
          status: 'CANCELLED',
          ends_at: { gte: now },
        },
      }),
      // Expired subscriptions
      prisma.business_entitlements.count({
        where: {
          OR: [
            { status: 'EXPIRED' },
            { ends_at: { lt: now }, status: { in: ['ACTIVE', 'PAST_DUE'] } },
          ],
        },
      }),
      // Trial accounts
      prisma.business_entitlements.count({
        where: { status: 'TRIAL' },
      }),
      // Renewals approaching in next 7 days
      prisma.business_entitlements.count({
        where: {
          status: 'ACTIVE',
          auto_renew: true,
          ends_at: { gte: now, lte: sevenDaysFromNow },
        },
      }),
    ]);

    // 3. Real Collected Revenue (Exclusively verified SUCCESS Razorpay payments)
    const [
      totalRevAgg,
      monthlyRevAgg,
      previousMonthRevAgg,
      failedPaymentsCount,
      pendingPaymentsCount,
    ] = await Promise.all([
      prisma.subscription_orders.aggregate({
        where: { status: 'SUCCESS' },
        _sum: { amount_paise: true },
      }),
      prisma.subscription_orders.aggregate({
        where: {
          status: 'SUCCESS',
          paid_at: { gte: startOfCurrentMonth },
        },
        _sum: { amount_paise: true },
      }),
      prisma.subscription_orders.aggregate({
        where: {
          status: 'SUCCESS',
          paid_at: {
            gte: startOfPreviousMonth,
            lte: endOfPreviousMonth,
          },
        },
        _sum: { amount_paise: true },
      }),
      prisma.subscription_orders.count({
        where: { status: 'FAILED' },
      }),
      prisma.subscription_orders.count({
        where: { status: 'PENDING' },
      }),
    ]);

    const totalRevenueRupees = Number(totalRevAgg._sum.amount_paise || 0n) / 100;
    const monthlyRevenueRupees = Number(monthlyRevAgg._sum.amount_paise || 0n) / 100;
    const previousMonthRevenueRupees = Number(previousMonthRevAgg._sum.amount_paise || 0n) / 100;

    const revenueMoMChange =
      previousMonthRevenueRupees > 0
        ? Number((((monthlyRevenueRupees - previousMonthRevenueRupees) / previousMonthRevenueRupees) * 100).toFixed(1))
        : null;

    // Monthly Recurring Revenue (MRR) - ONLY Starter (₹599) and Growth (₹999), excluding one-time Premium
    const mrrRupees = starterSubscriptionsCount * 599 + growthSubscriptionsCount * 999;

    // Average Revenue Per Paying Account
    const totalPayingAccounts = activeSubscriptionsCount + premiumSubscriptionsCount;
    const arpuRupees = totalPayingAccounts > 0 ? Number((totalRevenueRupees / totalPayingAccounts).toFixed(2)) : 0;

    // Recent 5 Registrations
    const recentAccounts = await prisma.businesses.findMany({
      take: 5,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        business_email: true,
        status: true,
        created_at: true,
        business_members: {
          where: { role: 'OWNER' },
          select: {
            users: {
              select: { name: true, email: true },
            },
          },
          take: 1,
        },
        business_entitlements: {
          select: {
            status: true,
            starts_at: true,
            ends_at: true,
            plans: { select: { code: true, name: true, price_paise: true } },
          },
        },
      },
    });

    // Recent 5 Subscription Payments (SUCCESS)
    const recentPayments = await prisma.subscription_orders.findMany({
      where: { status: 'SUCCESS' },
      take: 5,
      orderBy: { paid_at: 'desc' },
      include: {
        businesses: { select: { id: true, name: true, slug: true } },
        plans: { select: { code: true, name: true } },
      },
    });

    // Recent 5 Pending/Upcoming Renewals
    const upcomingRenewals = await prisma.business_entitlements.findMany({
      where: {
        status: 'ACTIVE',
        ends_at: { gte: now },
      },
      take: 5,
      orderBy: { ends_at: 'asc' },
      include: {
        businesses: { select: { id: true, name: true } },
        plans: { select: { code: true, name: true } },
      },
    });

    return {
      kpiCards: {
        totalAccounts: {
          count: totalAccounts,
          createdThisMonth: accountsThisMonth,
          momPercentageChange: accountsMoMChange,
        },
        activeSubscriptions: {
          totalActive: activeSubscriptionsCount,
          starter: starterSubscriptionsCount,
          growth: growthSubscriptionsCount,
          premium: premiumSubscriptionsCount,
          cancelledStillActive: cancelledActiveSubscriptionsCount,
        },
        monthlyRevenue: {
          amountRupees: monthlyRevenueRupees,
          momPercentageChange: revenueMoMChange,
          previousMonthRupees: previousMonthRevenueRupees,
        },
        totalRevenue: {
          amountRupees: totalRevenueRupees,
          currency: 'INR',
          mrrRupees,
          arpuRupees,
        },
        newAccounts: {
          today: accountsToday,
          last30Days: accountsLast30Days,
        },
        expiringSubscriptions: {
          approachingRenewal: upcomingRenewalsCount,
          expired: expiredSubscriptionsCount,
          cancelledInGrace: cancelledActiveSubscriptionsCount,
        },
        failedPayments: {
          failedCount: failedPaymentsCount,
          pendingCount: pendingPaymentsCount,
          requiringAction: failedPaymentsCount + pendingPaymentsCount,
        },
        trialAccounts: {
          supported: true,
          count: trialAccountsCount,
        },
      },
      recentAccounts: recentAccounts.map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        ownerName: b.business_members[0]?.users?.name || 'Studio Owner',
        ownerEmail: b.business_members[0]?.users?.email || b.business_email || '—',
        status: b.status,
        planName: b.business_entitlements?.plans?.name || 'Starter Monthly',
        subscriptionStatus: b.business_entitlements?.status || 'TRIAL',
        createdAt: b.created_at,
      })),
      recentPayments: recentPayments.map((p) => ({
        id: p.id,
        paymentReference: p.cf_order_id || p.cf_subscription_id || p.id,
        businessName: p.businesses?.name || 'Studio',
        planName: p.plans?.name || 'Subscription',
        amountRupees: Number(p.amount_paise) / 100,
        currency: p.currency,
        status: p.status,
        paidAt: p.paid_at,
      })),
      upcomingRenewals: upcomingRenewals.map((r) => ({
        id: r.id,
        businessName: r.businesses?.name,
        planName: r.plans?.name,
        endsAt: r.ends_at,
        autoRenew: r.auto_renew,
      })),
    };
  },

  /**
   * 2. Revenue Analytics & Charts
   */
  async getRevenueAnalytics({ startDate, endDate, interval = 'monthly' } = {}) {
    // 1. Fetch all SUCCESS subscription orders within range
    const whereClause = { status: 'SUCCESS' };
    if (startDate || endDate) {
      whereClause.paid_at = {};
      if (startDate) whereClause.paid_at.gte = new Date(startDate);
      if (endDate) whereClause.paid_at.lte = new Date(endDate);
    }

    const orders = await prisma.subscription_orders.findMany({
      where: whereClause,
      include: {
        plans: true,
        businesses: { select: { id: true, name: true } },
      },
      orderBy: { paid_at: 'asc' },
    });

    // 2. Revenue aggregation by time bucket
    const timeBuckets = {};
    let starterRevenuePaise = 0n;
    let growthRevenuePaise = 0n;
    let premiumRevenuePaise = 0n;
    let totalPaise = 0n;

    for (const order of orders) {
      const amountPaise = order.amount_paise;
      totalPaise += amountPaise;
      const date = order.paid_at ? new Date(order.paid_at) : new Date(order.created_at);

      let key;
      if (interval === 'daily') {
        key = date.toISOString().split('T')[0]; // YYYY-MM-DD
      } else if (interval === 'yearly') {
        key = `${date.getFullYear()}`;
      } else {
        // default monthly
        const month = String(date.getMonth() + 1).padStart(2, '0');
        key = `${date.getFullYear()}-${month}`; // YYYY-MM
      }

      if (!timeBuckets[key]) {
        timeBuckets[key] = {
          date: key,
          total: 0,
          starter: 0,
          growth: 0,
          premium: 0,
          count: 0,
        };
      }

      const amountRupees = Number(amountPaise) / 100;
      timeBuckets[key].total += amountRupees;
      timeBuckets[key].count += 1;

      if (order.plans?.code === 'BASIC_MONTHLY') {
        timeBuckets[key].starter += amountRupees;
        starterRevenuePaise += amountPaise;
      } else if (order.plans?.code === 'GROWTH_MONTHLY') {
        timeBuckets[key].growth += amountRupees;
        growthRevenuePaise += amountPaise;
      } else if (order.plans?.code === 'EXCLUSIVE_LIFETIME') {
        timeBuckets[key].premium += amountRupees;
        premiumRevenuePaise += amountPaise;
      }
    }

    // Active subscriptions for MRR calculation
    const [activeStarter, activeGrowth] = await Promise.all([
      prisma.business_entitlements.count({
        where: { status: 'ACTIVE', plans: { code: 'BASIC_MONTHLY' } },
      }),
      prisma.business_entitlements.count({
        where: { status: 'ACTIVE', plans: { code: 'GROWTH_MONTHLY' } },
      }),
    ]);

    const mrrRupees = activeStarter * 599 + activeGrowth * 999;
    const totalCollectedRupees = Number(totalPaise) / 100;

    return {
      timeline: Object.values(timeBuckets),
      breakdown: {
        starter: {
          code: 'BASIC_MONTHLY',
          name: 'Starter Monthly (₹599/mo)',
          revenueRupees: Number(starterRevenuePaise) / 100,
          activeSubscribers: activeStarter,
        },
        growth: {
          code: 'GROWTH_MONTHLY',
          name: 'Growth Monthly (₹999/mo)',
          revenueRupees: Number(growthRevenuePaise) / 100,
          activeSubscribers: activeGrowth,
        },
        premium: {
          code: 'EXCLUSIVE_LIFETIME',
          name: 'Premium One-Time (₹29,999 one-time)',
          revenueRupees: Number(premiumRevenuePaise) / 100,
          salesCount: orders.filter((o) => o.plans?.code === 'EXCLUSIVE_LIFETIME').length,
          note: 'One-time custom deployment collection; not counted in recurring MRR.',
        },
      },
      metrics: {
        grossCollectionsRupees: totalCollectedRupees,
        refundsRupees: 0, // Recorded when refund pipeline exists
        netRevenueRupees: totalCollectedRupees,
        mrrRupees,
        totalTransactions: orders.length,
      },
    };
  },

  /**
   * 3. Accounts Management
   * Searchable, paginated list of all studios/businesses
   */
  async getAccounts({ page = 1, limit = 15, search = '', filter = 'ALL' } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};

    // Filter by subscription status
    if (filter === 'ACTIVE_SUBSCRIPTION') {
      where.business_entitlements = { status: 'ACTIVE' };
    } else if (filter === 'CANCELLED') {
      where.business_entitlements = { status: 'CANCELLED' };
    } else if (filter === 'EXPIRED') {
      where.business_entitlements = {
        OR: [{ status: 'EXPIRED' }, { ends_at: { lt: new Date() } }],
      };
    } else if (filter === 'TRIAL_OR_UNPAID') {
      where.business_entitlements = { status: 'TRIAL' };
    } else if (filter === 'RECENT') {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      where.created_at = { gte: thirtyDaysAgo };
    }

    // Search by name, slug, email, or city
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
        { business_email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        {
          business_members: {
            some: {
              users: {
                OR: [
                  { name: { contains: q, mode: 'insensitive' } },
                  { email: { contains: q, mode: 'insensitive' } },
                ],
              },
            },
          },
        },
      ];
    }

    const [total, accounts] = await Promise.all([
      prisma.businesses.count({ where }),
      prisma.businesses.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          business_members: {
            where: { role: 'OWNER' },
            include: { users: true },
            take: 1,
          },
          business_entitlements: {
            include: { plans: true },
          },
          _count: {
            select: {
              customers: true,
              bookings: true,
              enquiries: true,
            },
          },
        },
      }),
    ]);

    return {
      items: accounts.map((b) => {
        const owner = b.business_members[0]?.users;
        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          ownerName: owner?.name || 'Studio Owner',
          ownerEmail: owner?.email || b.business_email || '—',
          ownerPhone: owner?.phone || b.business_phone || '—',
          registrationDate: b.created_at,
          accountStatus: b.status,
          city: b.city || '—',
          planName: b.business_entitlements?.plans?.name || 'Starter Monthly',
          planCode: b.business_entitlements?.plans?.code || 'BASIC_MONTHLY',
          subscriptionStatus: b.business_entitlements?.status || 'TRIAL',
          subscriptionEndsAt: b.business_entitlements?.ends_at,
          autoRenew: b.business_entitlements?.auto_renew || false,
          totalCustomers: b._count.customers,
          totalBookings: b._count.bookings,
          totalEnquiries: b._count.enquiries,
        };
      }),
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * Get single account details for inspection
   */
  async getAccountById(id) {
    const business = await prisma.businesses.findUnique({
      where: { id },
      include: {
        business_members: {
          include: { users: true },
        },
        business_entitlements: {
          include: { plans: { include: { plan_features: true } } },
        },
        business_websites: true,
        subscription_orders: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: { plans: true },
        },
        _count: {
          select: {
            customers: true,
            bookings: true,
            enquiries: true,
            consultations: true,
            payment_records: true,
          },
        },
      },
    });

    if (!business) {
      throw ApiError.notFound('Studio account not found');
    }

    return business;
  },

  /**
   * Suspend or Reactivate Account
   * Never deletes business data
   */
  async updateAccountStatus(businessId, { status, reason }, adminUserId) {
    if (!['ACTIVE', 'SUSPENDED', 'CLOSED'].includes(status)) {
      throw ApiError.badRequest('Invalid status. Allowed: ACTIVE, SUSPENDED, CLOSED');
    }

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw ApiError.notFound('Account not found');
    }

    const updated = await prisma.businesses.update({
      where: { id: businessId },
      data: {
        status,
        updated_at: new Date(),
      },
    });

    // Record audit log
    await prisma.audit_logs.create({
      data: {
        business_id: businessId,
        actor_user_id: adminUserId,
        action: status === 'ACTIVE' ? 'ADMIN_ACCOUNT_REACTIVATED' : 'ADMIN_ACCOUNT_SUSPENDED',
        entity_type: 'BUSINESS_ACCOUNT',
        entity_id: businessId,
        details: {
          previousStatus: business.status,
          newStatus: status,
          reason: reason || 'Administrative action by Super Admin',
          updatedAt: new Date().toISOString(),
        },
      },
    });

    return {
      success: true,
      message: `Account status successfully changed to ${status}`,
      account: updated,
    };
  },

  /**
   * 4. Subscriptions Management
   */
  async getSubscriptions({ page = 1, limit = 15, planCode, status, search = '' } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (planCode) {
      where.plans = { code: planCode };
    }
    if (status) {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.businesses = {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } },
          { business_email: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [total, entitlements] = await Promise.all([
      prisma.business_entitlements.count({ where }),
      prisma.business_entitlements.findMany({
        where,
        skip,
        take,
        orderBy: { updated_at: 'desc' },
        include: {
          plans: true,
          businesses: {
            include: {
              business_members: {
                where: { role: 'OWNER' },
                include: { users: true },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    return {
      items: entitlements.map((e) => {
        const owner = e.businesses?.business_members[0]?.users;
        return {
          id: e.id,
          businessId: e.business_id,
          businessName: e.businesses?.name,
          ownerName: owner?.name || 'Studio Owner',
          ownerEmail: owner?.email || e.businesses?.business_email || '—',
          planName: e.plans?.name,
          planCode: e.plans?.code,
          priceRupees: Number(e.plans?.price_paise) / 100,
          billingType: e.plans?.billing_type,
          status: e.status,
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          autoRenew: e.auto_renew,
          purchaseReference: e.purchase_reference,
          notes: e.notes,
        };
      }),
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * 5. Payments Management (Razorpay Subscription Orders)
   */
  async getPayments({ page = 1, limit = 15, status, planCode, search = '', startDate, endDate } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (status) {
      where.status = status;
    }
    if (planCode) {
      where.plans = { code: planCode };
    }
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { cf_order_id: { contains: q, mode: 'insensitive' } },
        { cf_subscription_id: { contains: q, mode: 'insensitive' } },
        { businesses: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, orders] = await Promise.all([
      prisma.subscription_orders.count({ where }),
      prisma.subscription_orders.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          plans: true,
          businesses: {
            include: {
              business_members: {
                where: { role: 'OWNER' },
                include: { users: true },
                take: 1,
              },
            },
          },
        },
      }),
    ]);

    return {
      items: orders.map((o) => {
        const owner = o.businesses?.business_members[0]?.users;
        return {
          id: o.id,
          paymentReference: o.cf_order_id || o.cf_subscription_id || o.id,
          businessId: o.business_id,
          businessName: o.businesses?.name || 'Studio',
          ownerName: owner?.name || 'Owner',
          ownerEmail: owner?.email || o.businesses?.business_email || '—',
          planName: o.plans?.name || 'Plan',
          planCode: o.plans?.code,
          orderType: o.order_type,
          amountRupees: Number(o.amount_paise) / 100,
          currency: o.currency,
          status: o.status,
          paymentMethod: o.payment_method || 'Razorpay PG / Mandate',
          createdAt: o.created_at,
          paidAt: o.paid_at,
          errorMessage: o.error_message,
        };
      }),
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * 6. Plans Management
   */
  async getPlans() {
    const plans = await prisma.plans.findMany({
      orderBy: { price_paise: 'asc' },
      include: {
        plan_features: true,
        _count: {
          select: {
            business_entitlements: true,
            subscription_orders: true,
          },
        },
      },
    });

    return plans.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      billingType: p.billing_type,
      billingInterval: p.billing_interval,
      priceRupees: Number(p.price_paise) / 100,
      currency: p.currency,
      description: p.description,
      isActive: p.is_active,
      entitlementsCount: p._count.business_entitlements,
      ordersCount: p._count.subscription_orders,
      features: p.plan_features.map((f) => ({
        id: f.id,
        featureKey: f.feature_key,
        enabled: f.enabled,
      })),
    }));
  },

  /**
   * 7. Premium Sales Enquiries Management
   */
  async getPremiumEnquiries({ page = 1, limit = 15, status, search = '' } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (status) {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { studio_name: { contains: q, mode: 'insensitive' } },
        { contact_person: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, enquiries] = await Promise.all([
      prisma.premium_sales_enquiries.count({ where }),
      prisma.premium_sales_enquiries.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          businesses: { select: { id: true, name: true, slug: true } },
          assigned_admin: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    return {
      items: enquiries,
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * Update Premium Enquiry Status and Notes
   */
  async updatePremiumEnquiry(enquiryId, { status, notes, followUpDate }, adminUserId) {
    const enquiry = await prisma.premium_sales_enquiries.findUnique({
      where: { id: enquiryId },
    });

    if (!enquiry) {
      throw ApiError.notFound('Sales enquiry not found');
    }

    const updated = await prisma.premium_sales_enquiries.update({
      where: { id: enquiryId },
      data: {
        status: status || enquiry.status,
        notes: notes !== undefined ? notes : enquiry.notes,
        follow_up_date: followUpDate ? new Date(followUpDate) : enquiry.follow_up_date,
        assigned_admin_id: adminUserId,
        updated_at: new Date(),
      },
    });

    // Record audit log
    await prisma.audit_logs.create({
      data: {
        business_id: enquiry.business_id,
        actor_user_id: adminUserId,
        action: 'PREMIUM_ENQUIRY_UPDATED',
        entity_type: 'PREMIUM_SALES_ENQUIRY',
        entity_id: enquiryId,
        details: {
          previousStatus: enquiry.status,
          newStatus: status || enquiry.status,
          updatedNotes: notes,
          followUpDate,
        },
      },
    });

    return updated;
  },

  /**
   * 8. Reports & Exports
   */
  async getReportData({ type = 'accounts', startDate, endDate } = {}) {
    const where = {};
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    if (type === 'accounts') {
      const records = await prisma.businesses.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          business_members: {
            where: { role: 'OWNER' },
            include: { users: true },
            take: 1,
          },
          business_entitlements: {
            include: { plans: true },
          },
        },
      });

      return records.map((b) => ({
        Business_ID: b.id,
        Business_Name: b.name,
        Slug: b.slug,
        Owner_Name: b.business_members[0]?.users?.name || 'Owner',
        Owner_Email: b.business_members[0]?.users?.email || b.business_email || '',
        Phone: b.business_members[0]?.users?.phone || b.business_phone || '',
        City: b.city || '',
        Account_Status: b.status,
        Plan: b.business_entitlements?.plans?.name || 'Starter Monthly',
        Plan_Code: b.business_entitlements?.plans?.code || 'BASIC_MONTHLY',
        Subscription_Status: b.business_entitlements?.status || 'TRIAL',
        Registered_At: b.created_at.toISOString(),
      }));
    }

    if (type === 'payments') {
      const paymentWhere = { status: 'SUCCESS' };
      if (startDate || endDate) {
        paymentWhere.paid_at = {};
        if (startDate) paymentWhere.paid_at.gte = new Date(startDate);
        if (endDate) paymentWhere.paid_at.lte = new Date(endDate);
      }

      const records = await prisma.subscription_orders.findMany({
        where: paymentWhere,
        orderBy: { paid_at: 'desc' },
        include: {
          plans: true,
          businesses: true,
        },
      });

      return records.map((p) => ({
        Payment_ID: p.id,
        Razorpay_Reference: p.cf_order_id || p.cf_subscription_id || '',
        Business_Name: p.businesses?.name || '',
        Plan_Name: p.plans?.name || '',
        Amount_INR: Number(p.amount_paise) / 100,
        Order_Type: p.order_type,
        Payment_Status: p.status,
        Paid_At: p.paid_at ? p.paid_at.toISOString() : '',
        Created_At: p.created_at.toISOString(),
      }));
    }

    if (type === 'enquiries') {
      const records = await prisma.premium_sales_enquiries.findMany({
        where,
        orderBy: { created_at: 'desc' },
      });

      return records.map((e) => ({
        Enquiry_ID: e.id,
        Studio_Name: e.studio_name,
        Contact_Person: e.contact_person,
        Email: e.email,
        Phone: e.phone,
        Requested_Plan: e.requested_plan,
        Status: e.status,
        Requirements: e.requirements || '',
        Notes: e.notes || '',
        Created_At: e.created_at.toISOString(),
      }));
    }

    throw ApiError.badRequest(`Unknown report type: ${type}`);
  },

  /**
   * 9. Audit Logs & Platform Activity
   */
  async getActivityLogs({ page = 1, limit = 20, entityType, action, search = '' } = {}) {
    const skip = (Number(page) - 1) * Number(limit);
    const take = Number(limit);

    const where = {};
    if (entityType) {
      where.entity_type = entityType;
    }
    if (action) {
      where.action = action;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { action: { contains: q, mode: 'insensitive' } },
        { entity_type: { contains: q, mode: 'insensitive' } },
        { businesses: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.audit_logs.count({ where }),
      prisma.audit_logs.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: 'desc' },
        include: {
          users: { select: { id: true, name: true, email: true } },
          businesses: { select: { id: true, name: true, slug: true } },
        },
      }),
    ]);

    return {
      items: logs.map((l) => ({
        id: l.id,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        details: l.details,
        actorName: l.users?.name || 'System / Platform',
        actorEmail: l.users?.email || 'system@vexatech.in',
        businessName: l.businesses?.name || 'Platform-wide',
        businessId: l.business_id,
        timestamp: l.created_at,
      })),
      pagination: {
        page: Number(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
      },
    };
  },

  /**
   * 10. Super Admin OTP Authentication: Request OTP
   * Strictly restricted to the authorized platform Super Admin: vexatech.connect@gmail.com
   */
  async requestAdminOtp(email) {
    if (!email) {
      throw ApiError.badRequest('Admin email is required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const authorizedSuperAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'vexatech.connect@gmail.com').toLowerCase().trim();

    // Strict single-admin restriction: only the designated super admin email is allowed
    if (normalizedEmail !== authorizedSuperAdminEmail) {
      throw ApiError.forbidden('Access denied. Only the authorized platform Super Admin email can sign in.');
    }

    // Check if user exists and is a Super Admin
    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.is_super_admin) {
      throw ApiError.forbidden('Access denied. Only registered platform Super Admin emails can sign in.');
    }

    if (!user.is_active) {
      throw ApiError.forbidden('This administrator account has been deactivated.');
    }

    // Invalidate existing active OTPs for this email
    await prisma.email_verifications.updateMany({
      where: {
        email: normalizedEmail,
        is_consumed: false,
      },
      data: { is_consumed: true },
    });

    // Generate cryptographically secure 6-digit OTP
    const { generateOtp, hashOtp } = await import('../utils/otp.js');
    const { emailService } = await import('./email.service.js');
    const { env } = await import('../config/env.js');

    const plainOtp = generateOtp();
    const hashed = hashOtp(plainOtp);
    const expiryMinutes = env.OTP_EXPIRES_MINUTES || 5;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    await prisma.email_verifications.create({
      data: {
        email: normalizedEmail,
        otp_hash: hashed,
        expires_at: expiresAt,
        max_attempts: 5,
        attempts: 0,
        is_consumed: false,
      },
    });

    // Send OTP via SMTP
    await emailService.sendVerificationOtp({
      to: normalizedEmail,
      name: user.name || 'Platform Super Admin',
      otp: plainOtp,
      expiryMinutes,
    });

    return {
      success: true,
      email: normalizedEmail,
      expiryMinutes,
      message: `A 6-digit security code has been sent to ${normalizedEmail}`,
    };
  },

  /**
   * 11. Super Admin OTP Authentication: Verify OTP & Issue Token
   */
  async verifyAdminOtp({ email, otp }) {
    if (!email || !otp) {
      throw ApiError.badRequest('Email and 6-digit verification code are required');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const authorizedSuperAdminEmail = (process.env.SUPER_ADMIN_EMAIL || 'vexatech.connect@gmail.com').toLowerCase().trim();

    if (normalizedEmail !== authorizedSuperAdminEmail) {
      throw ApiError.forbidden('Access denied. Only the authorized platform Super Admin email can sign in.');
    }

    const cleanOtp = String(otp).trim();

    const user = await prisma.users.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.is_super_admin) {
      throw ApiError.forbidden('Access denied. Not an authorized Super Admin account.');
    }

    if (!user.is_active) {
      throw ApiError.forbidden('This administrator account has been deactivated.');
    }

    const { verifyOtpHash } = await import('../utils/otp.js');
    const { generateAccessToken } = await import('../utils/generate-token.js');

    return await prisma.$transaction(async (tx) => {
      const verification = await tx.email_verifications.findFirst({
        where: {
          email: normalizedEmail,
          is_consumed: false,
        },
        orderBy: { created_at: 'desc' },
      });

      if (!verification) {
        throw ApiError.badRequest('No active verification request found. Please request a new code.');
      }

      if (new Date() > new Date(verification.expires_at)) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Verification code has expired. Please request a new one.');
      }

      if (verification.attempts >= verification.max_attempts) {
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { is_consumed: true },
        });
        throw ApiError.badRequest('Maximum attempts exceeded. Please request a new code.');
      }

      const isValid = verifyOtpHash(cleanOtp, verification.otp_hash);
      if (!isValid) {
        const remainingAttempts = verification.max_attempts - (verification.attempts + 1);
        await tx.email_verifications.update({
          where: { id: verification.id },
          data: { attempts: { increment: 1 } },
        });
        throw ApiError.badRequest(`Invalid verification code. ${remainingAttempts} attempts remaining.`);
      }

      // Mark OTP as consumed
      await tx.email_verifications.update({
        where: { id: verification.id },
        data: { is_consumed: true, updated_at: new Date() },
      });

      // Update last login
      await tx.users.update({
        where: { id: user.id },
        data: { last_login_at: new Date() },
      });

      // Record audit log
      await tx.audit_logs.create({
        data: {
          actor_user_id: user.id,
          action: 'SUPER_ADMIN_OTP_LOGIN',
          entity_type: 'AUTHENTICATION',
          entity_id: user.id,
          details: {
            email: user.email,
            method: 'EMAIL_OTP',
            timestamp: new Date().toISOString(),
          },
        },
      });

      // Generate JWT Access Token
      const token = generateAccessToken({
        userId: user.id,
        email: user.email,
      });

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          is_super_admin: true,
          is_email_verified: user.is_email_verified,
          last_login_at: new Date(),
        },
      };
    });
  },
};

