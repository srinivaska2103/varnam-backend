import prisma from '../config/prisma.js';
import { ApiError } from '../utils/apiResponse.js';

/**
 * Helper to build safe Date objects from YYYY-MM-DD
 */
function parseDateRange(query) {
  let start = null;
  let end = null;

  if (query.startDate) {
    start = new Date(`${query.startDate}T00:00:00.000Z`);
    if (isNaN(start.getTime())) throw ApiError.badRequest('Invalid startDate');
  }

  if (query.endDate) {
    end = new Date(`${query.endDate}T23:59:59.999Z`);
    if (isNaN(end.getTime())) throw ApiError.badRequest('Invalid endDate');
  }

  if (start && end && start > end) {
    throw ApiError.badRequest('startDate must not be later than endDate');
  }

  return { start, end };
}

export const dashboardService = {
  /**
   * 1. GET /api/dashboard/overview
   */
  async getOverview(businessId, query = {}) {
    const { start, end } = parseDateRange(query);

    const business = await prisma.businesses.findUnique({
      where: { id: businessId },
      select: { currency: true, timezone: true, name: true },
    });
    const currency = business?.currency || 'INR';

    const dateFilterCreated = {};
    if (start) dateFilterCreated.gte = start;
    if (end) dateFilterCreated.lte = end;
    const hasDateFilter = start || end;

    // Run parallel metrics queries
    const [
      totalCustomers,
      newCustomersInPeriod,
      totalEnquiries,
      newEnquiriesInPeriod,
      convertedEnquiries,
      bookingsInPeriod,
      allActiveBookings,
      paymentsInPeriod,
      expensesInPeriod,
      inventoryItems,
    ] = await Promise.all([
      // Total customers all time
      prisma.customers.count({ where: { business_id: businessId } }),
      // New customers in period
      prisma.customers.count({
        where: {
          business_id: businessId,
          ...(hasDateFilter ? { created_at: dateFilterCreated } : {}),
        },
      }),
      // Total enquiries all time
      prisma.enquiries.count({ where: { business_id: businessId } }),
      // New enquiries in period
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          ...(hasDateFilter ? { created_at: dateFilterCreated } : {}),
        },
      }),
      // Converted enquiries in period
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: 'CONVERTED',
          ...(hasDateFilter ? { updated_at: dateFilterCreated } : {}),
        },
      }),
      // Bookings in period
      prisma.bookings.findMany({
        where: {
          business_id: businessId,
          ...(hasDateFilter ? { created_at: dateFilterCreated } : {}),
        },
        select: {
          id: true,
          status: true,
          total_amount_paise: true,
          discount_paise: true,
        },
      }),
      // All active bookings for outstanding balance calculation
      prisma.bookings.findMany({
        where: {
          business_id: businessId,
          status: { notIn: ['CANCELLED', 'DRAFT'] },
        },
        select: {
          id: true,
          total_amount_paise: true,
          discount_paise: true,
          payment_records: {
            select: { amount_paise: true, status: true },
          },
        },
      }),
      // Payments in period
      prisma.payment_records.findMany({
        where: {
          business_id: businessId,
          ...(hasDateFilter ? { paid_at: dateFilterCreated } : {}),
        },
        select: {
          amount_paise: true,
          status: true,
        },
      }),
      // Expenses in period
      prisma.expenses.findMany({
        where: {
          business_id: businessId,
          status: 'RECORDED',
          ...(hasDateFilter ? { expense_date: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } } : {}),
        },
        select: { amount_paise: true },
      }),
      // Inventory active items
      prisma.inventory_items.findMany({
        where: { business_id: businessId, is_active: true },
        select: { quantity_on_hand: true, minimum_quantity: true },
      }),
    ]);

    // Bookings breakdown
    let confirmedBookings = 0;
    let upcomingBookings = 0;
    let completedBookings = 0;
    let cancelledBookings = 0;
    let totalBookingValuePaise = 0;

    for (const b of bookingsInPeriod) {
      if (b.status === 'CONFIRMED' || b.status === 'PLANNING' || b.status === 'READY') {
        confirmedBookings++;
        upcomingBookings++;
      } else if (b.status === 'COMPLETED') {
        completedBookings++;
      } else if (b.status === 'CANCELLED') {
        cancelledBookings++;
      }

      if (b.status !== 'CANCELLED') {
        const net = Math.max(0, Number(b.total_amount_paise) - Number(b.discount_paise));
        totalBookingValuePaise += net;
      }
    }

    // Cash payments & refunds
    let paymentsCollectedPaise = 0;
    let refundsProcessedPaise = 0;

    for (const p of paymentsInPeriod) {
      const amt = Number(p.amount_paise);
      if (p.status === 'RECORDED') {
        paymentsCollectedPaise += amt;
      } else if (p.status === 'REFUNDED') {
        refundsProcessedPaise += amt;
      }
    }

    const netCashCollectedPaise = Math.max(0, paymentsCollectedPaise - refundsProcessedPaise);

    // Expenses
    let totalExpensesPaise = 0;
    for (const e of expensesInPeriod) {
      totalExpensesPaise += Number(e.amount_paise);
    }

    // Cash-based net amount (Estimated profit)
    const estimatedCashProfitPaise = netCashCollectedPaise - totalExpensesPaise;

    // Outstanding customer payments across active bookings
    let outstandingCustomerPaymentsPaise = 0;
    for (const ab of allActiveBookings) {
      const netPayable = Math.max(0, Number(ab.total_amount_paise) - Number(ab.discount_paise));
      let paid = 0;
      for (const pr of ab.payment_records) {
        if (pr.status === 'RECORDED') paid += Number(pr.amount_paise);
        else if (pr.status === 'REFUNDED') paid -= Number(pr.amount_paise);
      }
      outstandingCustomerPaymentsPaise += Math.max(0, netPayable - Math.max(0, paid));
    }

    // Low stock count
    let lowStockCount = 0;
    for (const item of inventoryItems) {
      if (Number(item.quantity_on_hand) <= Number(item.minimum_quantity)) {
        lowStockCount++;
      }
    }

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      currency,
      customers: {
        total: totalCustomers,
        new_in_period: newCustomersInPeriod,
      },
      enquiries: {
        total: totalEnquiries,
        new_in_period: newEnquiriesInPeriod,
        converted_in_period: convertedEnquiries,
        conversion_rate_percentage: newEnquiriesInPeriod > 0
          ? Number(((convertedEnquiries / newEnquiriesInPeriod) * 100).toFixed(1))
          : 0,
      },
      bookings: {
        total_in_period: bookingsInPeriod.length,
        confirmed: confirmedBookings,
        upcoming: upcomingBookings,
        completed: completedBookings,
        cancelled: cancelledBookings,
        total_booking_value_paise: totalBookingValuePaise,
        total_booking_value_formatted: `₹${(totalBookingValuePaise / 100).toFixed(2)}`,
      },
      financials: {
        payments_collected_paise: paymentsCollectedPaise,
        refunds_processed_paise: refundsProcessedPaise,
        net_cash_collected_paise: netCashCollectedPaise,
        outstanding_customer_payments_paise: outstandingCustomerPaymentsPaise,
        total_expenses_paise: totalExpensesPaise,
        estimated_cash_profit_paise: estimatedCashProfitPaise,
        estimated_cash_profit_formatted: `₹${(estimatedCashProfitPaise / 100).toFixed(2)}`,
        note: 'Profit is presented as a cash-based estimate (Net Cash Collected minus Studio Expenses) and does not represent formal audited accrual accounting profit.',
      },
      inventory: {
        total_active_items: inventoryItems.length,
        items_below_threshold: lowStockCount,
      },
    };
  },

  /**
   * 2. GET /api/dashboard/revenue
   */
  async getRevenueAnalytics(businessId, query = {}) {
    const { start, end } = parseDateRange(query);

    const where = { business_id: businessId };
    if (start || end) {
      where.paid_at = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    const payments = await prisma.payment_records.findMany({
      where,
      orderBy: { paid_at: 'asc' },
      select: {
        id: true,
        amount_paise: true,
        status: true,
        method: true,
        paid_at: true,
      },
    });

    let totalCollectedPaise = 0;
    let totalRefundsPaise = 0;
    const methodBreakdown = {};
    const monthlyTrends = {};
    const dailyCollections = {};

    for (const p of payments) {
      const amt = Number(p.amount_paise);
      const day = p.paid_at.toISOString().split('T')[0];
      const month = day.slice(0, 7); // YYYY-MM

      if (p.status === 'RECORDED') {
        totalCollectedPaise += amt;
        methodBreakdown[p.method] = (methodBreakdown[p.method] || 0) + amt;
        monthlyTrends[month] = (monthlyTrends[month] || 0) + amt;
        dailyCollections[day] = (dailyCollections[day] || 0) + amt;
      } else if (p.status === 'REFUNDED') {
        totalRefundsPaise += amt;
      }
    }

    const netRevenuePaise = Math.max(0, totalCollectedPaise - totalRefundsPaise);

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      summary: {
        total_payments_collected_paise: totalCollectedPaise,
        total_refunds_paise: totalRefundsPaise,
        net_revenue_paise: netRevenuePaise,
        net_revenue_inr: (netRevenuePaise / 100).toFixed(2),
      },
      payment_method_breakdown: methodBreakdown,
      monthly_collection_trends: monthlyTrends,
      daily_collections: dailyCollections,
    };
  },

  /**
   * 3. GET /api/dashboard/bookings
   */
  async getBookingAnalytics(businessId, query = {}) {
    const { start, end } = parseDateRange(query);

    const where = { business_id: businessId };
    if (start || end) {
      where.created_at = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    const [bookings, upcomingEvents] = await Promise.all([
      prisma.bookings.findMany({
        where,
        select: {
          id: true,
          status: true,
          package_name_snapshot: true,
          total_amount_paise: true,
          discount_paise: true,
          created_at: true,
        },
      }),
      prisma.booking_events.findMany({
        where: {
          business_id: businessId,
          event_date: { gte: new Date() },
          bookings: { status: { notIn: ['CANCELLED', 'DRAFT'] } },
        },
        take: 5,
        orderBy: { event_date: 'asc' },
        include: {
          bookings: { select: { booking_number: true, customer_id: true } },
        },
      }),
    ]);

    const statusBreakdown = {};
    const monthlyBookings = {};
    const packageBreakdown = {};
    let totalNonCancelledValue = 0;
    let nonCancelledCount = 0;
    let cancellationCount = 0;

    for (const b of bookings) {
      statusBreakdown[b.status] = (statusBreakdown[b.status] || 0) + 1;

      const month = b.created_at.toISOString().slice(0, 7);
      monthlyBookings[month] = (monthlyBookings[month] || 0) + 1;

      const pkg = b.package_name_snapshot || 'Custom Services';
      packageBreakdown[pkg] = (packageBreakdown[pkg] || 0) + 1;

      if (b.status === 'CANCELLED') {
        cancellationCount++;
      } else {
        nonCancelledCount++;
        totalNonCancelledValue += Math.max(0, Number(b.total_amount_paise) - Number(b.discount_paise));
      }
    }

    const averageBookingValuePaise = nonCancelledCount > 0
      ? Math.round(totalNonCancelledValue / nonCancelledCount)
      : 0;

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      total_bookings: bookings.length,
      status_breakdown: statusBreakdown,
      monthly_trends: monthlyBookings,
      package_breakdown: packageBreakdown,
      cancellations_count: cancellationCount,
      average_booking_value_paise: averageBookingValuePaise,
      average_booking_value_inr: (averageBookingValuePaise / 100).toFixed(2),
      upcoming_events: upcomingEvents.map((e) => ({
        id: e.id,
        title: e.title,
        event_kind: e.event_kind,
        event_date: e.event_date.toISOString().split('T')[0],
        booking_number: e.bookings.booking_number,
        venue: e.venue,
      })),
    };
  },

  /**
   * 4. GET /api/dashboard/enquiries
   */
  async getEnquiryAnalytics(businessId, query = {}) {
    const { start, end } = parseDateRange(query);

    const where = { business_id: businessId };
    if (start || end) {
      where.created_at = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    const [enquiries, overdueFollowUps, upcomingFollowUps] = await Promise.all([
      prisma.enquiries.findMany({
        where,
        select: {
          id: true,
          status: true,
          created_at: true,
        },
      }),
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          next_follow_up_at: { lt: new Date() },
        },
      }),
      prisma.enquiries.count({
        where: {
          business_id: businessId,
          status: { notIn: ['CONVERTED', 'LOST'] },
          next_follow_up_at: { gte: new Date() },
        },
      }),
    ]);

    const pipelineStatus = {};
    const monthlyNewEnquiries = {};
    let convertedCount = 0;
    let lostCount = 0;

    for (const enq of enquiries) {
      pipelineStatus[enq.status] = (pipelineStatus[enq.status] || 0) + 1;

      const month = enq.created_at.toISOString().slice(0, 7);
      monthlyNewEnquiries[month] = (monthlyNewEnquiries[month] || 0) + 1;

      if (enq.status === 'CONVERTED') convertedCount++;
      if (enq.status === 'LOST') lostCount++;
    }

    const total = enquiries.length;
    const conversionRate = total > 0 ? Number(((convertedCount / total) * 100).toFixed(1)) : 0;

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      total_enquiries: total,
      pipeline_status_breakdown: pipelineStatus,
      monthly_new_enquiries: monthlyNewEnquiries,
      converted_count: convertedCount,
      lost_count: lostCount,
      conversion_rate_percentage: conversionRate,
      follow_ups: {
        overdue_count: overdueFollowUps,
        upcoming_count: upcomingFollowUps,
      },
    };
  },

  /**
   * 5. GET /api/dashboard/payments
   */
  async getPaymentAnalytics(businessId, query = {}) {
    return this.getRevenueAnalytics(businessId, query);
  },

  /**
   * 6. GET /api/dashboard/expenses
   */
  async getExpenseAnalytics(businessId, query = {}) {
    const { start, end } = parseDateRange(query);

    const where = {
      business_id: businessId,
      status: { not: 'VOIDED' },
    };

    if (start || end) {
      where.expense_date = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    const expenses = await prisma.expenses.findMany({
      where,
      orderBy: { expense_date: 'asc' },
      select: {
        amount_paise: true,
        category: true,
        expense_date: true,
      },
    });

    let totalExpensesPaise = 0;
    const categoryBreakdown = {};
    const monthlyTrends = {};

    for (const e of expenses) {
      const amt = Number(e.amount_paise);
      totalExpensesPaise += amt;

      categoryBreakdown[e.category] = (categoryBreakdown[e.category] || 0) + amt;

      const month = e.expense_date.toISOString().slice(0, 7);
      monthlyTrends[month] = (monthlyTrends[month] || 0) + amt;
    }

    return {
      period: {
        startDate: query.startDate || 'all_time',
        endDate: query.endDate || 'all_time',
      },
      total_expenses_paise: totalExpensesPaise,
      total_expenses_inr: (totalExpensesPaise / 100).toFixed(2),
      category_breakdown: categoryBreakdown,
      monthly_trends: monthlyTrends,
    };
  },

  /**
   * 7. GET /api/dashboard/inventory
   */
  async getInventoryAnalytics(businessId) {
    const items = await prisma.inventory_items.findMany({
      where: { business_id: businessId },
      select: {
        is_active: true,
        quantity_on_hand: true,
        minimum_quantity: true,
        unit_cost_paise: true,
      },
    });

    let totalActive = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let totalValuationPaise = BigInt(0);

    for (const i of items) {
      if (i.is_active) {
        totalActive++;
        const qty = Number(i.quantity_on_hand);
        const min = Number(i.minimum_quantity);

        if (qty <= 0) outOfStockCount++;
        if (qty <= min) lowStockCount++;

        totalValuationPaise += BigInt(Math.round(qty * Number(i.unit_cost_paise)));
      }
    }

    const recentMovements = await prisma.stock_movements.findMany({
      where: { business_id: businessId },
      take: 5,
      orderBy: { created_at: 'desc' },
      include: {
        inventory_items: { select: { name: true, unit: true } },
      },
    });

    return {
      total_active_items: totalActive,
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      total_valuation_paise: Number(totalValuationPaise),
      total_valuation_inr: (Number(totalValuationPaise) / 100).toFixed(2),
      recent_movements: recentMovements.map((m) => ({
        id: m.id,
        item_name: m.inventory_items?.name,
        movement_type: m.movement_type,
        quantity_change: Number(m.quantity_change),
        created_at: m.created_at,
        reason: m.reason,
      })),
    };
  },

  /**
   * 8. GET /api/dashboard/recent-activities
   */
  async getRecentActivities(businessId, limit = 20) {
    const maxLimit = Math.min(100, Math.max(1, limit));

    // Parallel fetch from audit logs, recent payments, expenses, and enquiries
    const [auditLogs, recentPayments, recentExpenses, recentBookings] = await Promise.all([
      prisma.audit_logs.findMany({
        where: { business_id: businessId },
        take: maxLimit,
        orderBy: { created_at: 'desc' },
        include: { users: { select: { name: true } } },
      }),
      prisma.payment_records.findMany({
        where: { business_id: businessId },
        take: 10,
        orderBy: { created_at: 'desc' },
        include: { customers: { select: { full_name: true } } },
      }),
      prisma.expenses.findMany({
        where: { business_id: businessId },
        take: 10,
        orderBy: { created_at: 'desc' },
      }),
      prisma.bookings.findMany({
        where: { business_id: businessId },
        take: 10,
        orderBy: { created_at: 'desc' },
        include: { customers: { select: { full_name: true } } },
      }),
    ]);

    const activities = [];

    for (const log of auditLogs) {
      activities.push({
        id: log.id,
        type: 'AUDIT',
        title: log.action.replace(/_/g, ' '),
        description: log.entity_type ? `${log.entity_type} action` : 'Studio mutation',
        actor: log.users?.name || 'Studio Member',
        timestamp: log.created_at,
      });
    }

    for (const p of recentPayments) {
      activities.push({
        id: p.id,
        type: 'PAYMENT',
        title: `Payment ${p.status}`,
        description: `₹${(Number(p.amount_paise) / 100).toFixed(2)} received from ${p.customers?.full_name || 'Client'} via ${p.method}`,
        actor: 'Payment System',
        timestamp: p.created_at,
      });
    }

    for (const e of recentExpenses) {
      activities.push({
        id: e.id,
        type: 'EXPENSE',
        title: `Expense: ${e.category}`,
        description: `${e.description} - ₹${(Number(e.amount_paise) / 100).toFixed(2)}`,
        actor: 'Studio Accounting',
        timestamp: e.created_at,
      });
    }

    for (const b of recentBookings) {
      activities.push({
        id: b.id,
        type: 'BOOKING',
        title: `Booking: ${b.booking_number}`,
        description: `Status: ${b.status} for ${b.customers?.full_name || 'Client'}`,
        actor: 'Booking System',
        timestamp: b.created_at,
      });
    }

    // Sort combined activities by timestamp descending
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return {
      total: Math.min(activities.length, maxLimit),
      activities: activities.slice(0, maxLimit),
    };
  },
};
