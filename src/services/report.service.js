import prisma from '../config/prisma.js';

export const reportService = {
  /**
   * Comprehensive Financial Reporting & Analytics
   * Provides:
   * 1. Financial Summary Cards (Booking Value, Collected, Expenses, Outstanding, Net Cash Flow, Net Profit)
   * 2. Financial Audit Reconciliation Summary
   * 3. Revenue vs Expense Timeline (Daily/Monthly aggregations for Recharts)
   * 4. Payment Collection Breakdown (by method: Cash, UPI, Bank Transfer, etc.)
   * 5. Booking Status Breakdown (Confirmed, Completed, Planning, Ready, Cancelled)
   * 6. Expense Category Breakdown (Makeup, Travel, Rent, Utilities, etc.)
   * 7. Booking & Revenue Performance KPIs (Count, Avg Value, Collection Rate)
   * 8. Recent Financial Transactions (unified ledger of payments and expenses)
   */
  async getFinancialReport(businessId, query = {}) {
    const whereBookings = { business_id: businessId };
    const wherePayments = { business_id: businessId };
    const whereExpenses = { business_id: businessId, status: 'RECORDED' };

    let start = null;
    let end = null;

    if (query.startDate || query.endDate) {
      if (query.startDate) start = new Date(`${query.startDate}T00:00:00.000Z`);
      if (query.endDate) end = new Date(`${query.endDate}T23:59:59.999Z`);

      whereBookings.created_at = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };

      wherePayments.paid_at = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };

      whereExpenses.expense_date = {
        ...(start ? { gte: start } : {}),
        ...(end ? { lte: end } : {}),
      };
    }

    // Run parallel aggregated queries across business records
    const [
      business,
      bookingsInPeriod,
      paymentsInPeriod,
      expensesInPeriod,
      activeBookingsForOutstanding,
    ] = await Promise.all([
      prisma.businesses.findUnique({
        where: { id: businessId },
        select: { id: true, name: true, city: true },
      }),
      prisma.bookings.findMany({
        where: whereBookings,
        select: {
          id: true,
          booking_number: true,
          status: true,
          total_amount_paise: true,
          discount_paise: true,
          created_at: true,
          customers: { select: { id: true, full_name: true, phone: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.payment_records.findMany({
        where: wherePayments,
        select: {
          id: true,
          amount_paise: true,
          status: true,
          method: true,
          paid_at: true,
          receipt_number: true,
          reference_note: true,
          bookings: { select: { id: true, booking_number: true } },
          customers: { select: { id: true, full_name: true } },
        },
        orderBy: { paid_at: 'desc' },
      }),
      prisma.expenses.findMany({
        where: whereExpenses,
        select: {
          id: true,
          category: true,
          description: true,
          vendor_name: true,
          amount_paise: true,
          expense_date: true,
          created_at: true,
        },
        orderBy: { expense_date: 'desc' },
      }),
      // For outstanding balance: check all active non-cancelled bookings in the business
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
            select: {
              amount_paise: true,
              status: true,
            },
          },
        },
      }),
    ]);

    // 1. Calculate Booking Values in period & Booking Status counts
    let totalGrossBookingValuePaise = 0;
    let totalBookingDiscountsPaise = 0;
    let totalNetBookingValuePaise = 0;
    const bookingStatusCounts = {
      CONFIRMED: 0,
      COMPLETED: 0,
      PLANNING: 0,
      READY: 0,
      IN_PROGRESS: 0,
      CANCELLED: 0,
      POSTPONED: 0,
    };

    let eligibleBookingCount = 0;

    for (const b of bookingsInPeriod) {
      if (bookingStatusCounts[b.status] !== undefined) {
        bookingStatusCounts[b.status]++;
      } else {
        bookingStatusCounts[b.status] = 1;
      }

      if (b.status !== 'CANCELLED') {
        eligibleBookingCount++;
        const gross = Number(b.total_amount_paise);
        const discount = Number(b.discount_paise);
        totalGrossBookingValuePaise += gross;
        totalBookingDiscountsPaise += discount;
        totalNetBookingValuePaise += Math.max(0, gross - discount);
      }
    }

    // 2. Calculate Payments Collected, Refunds, and Payment Methods
    let paymentsCollectedPaise = 0;
    let refundsProcessedPaise = 0;
    const paymentsByMethod = {};
    const timelineAgg = {}; // key: YYYY-MM-DD -> { date, revenue, expenses }

    for (const p of paymentsInPeriod) {
      const amt = Number(p.amount_paise);
      const day = p.paid_at.toISOString().split('T')[0];

      if (!timelineAgg[day]) {
        timelineAgg[day] = { date: day, revenue: 0, expenses: 0 };
      }

      if (p.status === 'RECORDED') {
        paymentsCollectedPaise += amt;
        paymentsByMethod[p.method] = (paymentsByMethod[p.method] || 0) + amt;
        timelineAgg[day].revenue += amt;
      } else if (p.status === 'REFUNDED') {
        refundsProcessedPaise += amt;
        timelineAgg[day].revenue -= amt;
      }
    }

    const netCashCollectedPaise = Math.max(0, paymentsCollectedPaise - refundsProcessedPaise);

    // 3. Calculate Expenses & Categories
    let totalExpensesPaise = 0;
    const expensesByCategory = {};

    for (const e of expensesInPeriod) {
      const amt = Number(e.amount_paise);
      totalExpensesPaise += amt;
      expensesByCategory[e.category] = (expensesByCategory[e.category] || 0) + amt;

      const day = e.expense_date.toISOString().split('T')[0];
      if (!timelineAgg[day]) {
        timelineAgg[day] = { date: day, revenue: 0, expenses: 0 };
      }
      timelineAgg[day].expenses += amt;
    }

    // 4. Net Cash Flow & Net Cash Profit
    const netCashMovementPaise = netCashCollectedPaise - totalExpensesPaise;

    // 5. Total Outstanding Balance across all active studio bookings
    let totalOutstandingBalancePaise = 0;
    for (const ab of activeBookingsForOutstanding) {
      const netPayable = Math.max(0, Number(ab.total_amount_paise) - Number(ab.discount_paise));
      let paid = 0;
      for (const pr of ab.payment_records) {
        if (pr.status === 'RECORDED') paid += Number(pr.amount_paise);
        else if (pr.status === 'REFUNDED') paid -= Number(pr.amount_paise);
      }
      const balance = Math.max(0, netPayable - Math.max(0, paid));
      totalOutstandingBalancePaise += balance;
    }

    // 6. Timeline chart data sorted chronologically
    const timelineData = Object.values(timelineAgg)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => ({
        date: entry.date,
        revenue: Math.round(entry.revenue / 100), // in INR
        expenses: Math.round(entry.expenses / 100), // in INR
        net: Math.round((entry.revenue - entry.expenses) / 100),
      }));

    // 7. Booking & Performance KPIs
    const avgBookingValuePaise = eligibleBookingCount > 0
      ? Math.round(totalNetBookingValuePaise / eligibleBookingCount)
      : 0;

    const collectionRate = totalNetBookingValuePaise > 0
      ? Math.min(100, Math.round((paymentsCollectedPaise / totalNetBookingValuePaise) * 100))
      : (paymentsCollectedPaise > 0 ? 100 : 0);

    // 8. Recent Financial Transactions Unified Feed (Top 20 latest)
    const transactionList = [
      ...paymentsInPeriod.map((p) => ({
        id: `pay-${p.id}`,
        type: p.status === 'REFUNDED' ? 'REFUND' : 'PAYMENT',
        date: p.paid_at,
        reference: p.receipt_number || p.reference_note || `PAY-${p.id.slice(0, 8).toUpperCase()}`,
        party: p.customers?.full_name || 'Walk-in Client',
        booking_number: p.bookings?.booking_number || null,
        method: p.method,
        amount_paise: Number(p.amount_paise),
        status: p.status,
      })),
      ...expensesInPeriod.map((e) => ({
        id: `exp-${e.id}`,
        type: 'EXPENSE',
        date: e.expense_date,
        reference: e.vendor_name ? `EXP: ${e.vendor_name}` : `EXP: ${e.category}`,
        party: e.description || e.vendor_name || 'Studio Expense',
        booking_number: null,
        method: 'EXPENSE',
        amount_paise: Number(e.amount_paise),
        status: 'PAID',
      })),
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      business: {
        id: business?.id,
        name: business?.name || 'Bridal Studio',
        city: business?.city || '',
      },
      period: {
        startDate: query.startDate || null,
        endDate: query.endDate || null,
      },
      summary: {
        total_gross_booking_value_paise: totalGrossBookingValuePaise,
        total_booking_discounts_paise: totalBookingDiscountsPaise,
        total_net_booking_value_paise: totalNetBookingValuePaise,
        payments_collected_paise: paymentsCollectedPaise,
        refunds_processed_paise: refundsProcessedPaise,
        net_cash_collected_paise: netCashCollectedPaise,
        total_expenses_paise: totalExpensesPaise,
        net_cash_movement_paise: netCashMovementPaise,
        total_outstanding_balance_paise: totalOutstandingBalancePaise,
        currency: 'INR',
      },
      performance: {
        total_bookings: bookingsInPeriod.length,
        eligible_bookings: eligibleBookingCount,
        confirmed_bookings: bookingStatusCounts.CONFIRMED + (bookingStatusCounts.READY || 0) + (bookingStatusCounts.PLANNING || 0),
        completed_bookings: bookingStatusCounts.COMPLETED || 0,
        cancelled_bookings: bookingStatusCounts.CANCELLED || 0,
        avg_booking_value_paise: avgBookingValuePaise,
        payment_collection_rate: collectionRate,
      },
      breakdowns: {
        payments_by_method: paymentsByMethod,
        expenses_by_category: expensesByCategory,
        booking_statuses: bookingStatusCounts,
      },
      charts: {
        timeline: timelineData,
      },
      recent_transactions: transactionList.slice(0, 25),
      all_transactions: transactionList, // For client-side statement exports
      definitions: {
        booking_value: 'Total agreed contract revenue for bookings created within the period (not cash collected).',
        payments_collected: 'Total actual cash/UPI/bank receipts recorded in the period.',
        refunds_processed: 'Total money refunded to clients during the period.',
        net_cash_collected: 'Payments collected minus refunds processed.',
        expenses: 'Total operational costs (cosmetics restocking, travel, studio rent) recorded in the period.',
        net_cash_movement: 'Net cash collected minus studio operational expenses.',
        outstanding_balance: 'Cumulative unpaid balance across all confirmed and in-progress studio bookings.',
      },
    };
  },
};
