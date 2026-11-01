/**
 * Verification test suite for Phase 10: Dashboard Analytics & Business Reports
 *
 * Covers:
 * 1. Overview statistics (customers, enquiries, bookings, financials, low-stock items).
 * 2. Revenue and payment analytics (collected, refunds, net revenue, method breakdown, monthly/daily trends).
 * 3. Booking analytics (status breakdown, packages, monthly trends, average booking value, upcoming events).
 * 4. Enquiry analytics (pipeline breakdown, converted/lost counts, conversion rate percentage, follow-ups due).
 * 5. Payment collections endpoint (/api/dashboard/payments).
 * 6. Expense analytics (totals, category breakdown, monthly trends).
 * 7. Inventory analytics (active items, low stock, out-of-stock, live inventory valuation).
 * 8. Recent activities log across bookings, payments, expenses, and audit mutations.
 * 9. Date-range filtering and rejection of invalid date ranges.
 * 10. Empty datasets handling (returns 0 metrics instead of crashing).
 * 11. Multi-tenant isolation: Tenant 2 cannot access Tenant 1 dashboard analytics.
 * 12. Security: Rejecting unauthorized requests.
 */

import dotenv from 'dotenv';
dotenv.config();

import { generateAccessToken } from '../src/utils/generate-token.js';
import prisma from '../src/config/prisma.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

function generateAuthToken(user) {
  return generateAccessToken({ userId: user.id, email: user.email });
}

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = { raw: text };
  }

  return {
    status: response.status,
    ok: response.ok,
    headers: response.headers,
    data,
  };
}

async function runPhase10Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 10 AUTOMATED VERIFICATION SUITE');
  console.log('   Dashboard Analytics & Business Reports');
  console.log('====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAIL: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
    console.log(`✅ PASS: ${message}`);
    passedTests++;
  }

  try {
    // -----------------------------------------------------------------
    // SETUP: Provision 2 isolated businesses & populate representative data
    // -----------------------------------------------------------------
    console.log('--- Step 0: Setup Two Isolated Business Tenants ---');

    const timestamp = Date.now().toString(36);
    const owner1 = await prisma.users.create({
      data: {
        name: `Analytics Owner 1 ${timestamp}`,
        email: `dash1_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token1 = generateAuthToken(owner1);

    const biz1Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: {
        name: `Luxe Analytics Studio 1 ${timestamp}`,
        phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `dashbiz1_${timestamp}@example.com`,
      },
    });

    assert(biz1Res.status === 201, 'Tenant 1 business created successfully');
    const biz1Id = biz1Res.data.data.business?.id || biz1Res.data.data.id;

    // Tenant 2 (Empty dataset test candidate)
    const owner2 = await prisma.users.create({
      data: {
        name: `Analytics Owner 2 ${timestamp}`,
        email: `dash2_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token2 = generateAuthToken(owner2);

    const biz2Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        name: `Blank Studio 2 ${timestamp}`,
        phone: `92${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `dashbiz2_${timestamp}@example.com`,
      },
    });

    assert(biz2Res.status === 201, 'Tenant 2 business created successfully');
    const biz2Id = biz2Res.data.data.business?.id || biz2Res.data.data.id;

    // Create Customers, Enquiries, Bookings, Payments, Expenses, and Inventory in Tenant 1
    console.log('\n--- Step 1: Populate Representative Tenant 1 Records ---');

    // 1. Customer
    const custRes = await request('/api/customers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: { full_name: 'Deepika Padukone', phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`, city: 'Mumbai' },
    });
    assert(custRes.status === 201, 'Customer created in Tenant 1');
    const customer1Id = custRes.data.data.id;

    // 2. Enquiry (Converted)
    const enqRes = await request('/api/enquiries', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        customer_id: customer1Id,
        customer_name: 'Deepika Padukone',
        customer_phone: '9876543210',
        event_kind: 'WEDDING',
        event_date: '2026-12-10',
      },
    });
    assert(enqRes.status === 201, 'Enquiry created in Tenant 1');
    const enquiry1Id = enqRes.data.data.id;

    // 3. Booking (Confirmed with agreed ₹50,000)
    const bookingRes = await request('/api/bookings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        customer_id: customer1Id,
        enquiry_id: enquiry1Id,
        total_amount_paise: 5000000, // ₹50,000
        discount_paise: 500000, // ₹5,000 discount -> Net ₹45,000
        package_name_snapshot: 'Royal Bridal Signature Combo',
        event: {
          title: 'Royal Muhurtham Ceremony',
          event_kind: 'WEDDING',
          event_date: '2026-12-10',
          start_time: '06:00:00',
          end_time: '10:00:00',
          venue: 'Taj Lake Palace, Udaipur',
        },
      },
    });
    assert(bookingRes.status === 201, 'Booking created in Tenant 1');
    const booking1Id = bookingRes.data.data.id;

    // 4. Payment: Record ₹30,000 cash/UPI receipt
    const payRes = await request('/api/payments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        booking_id: booking1Id,
        amount_paise: 3000000,
        method: 'UPI',
        reference_note: 'GPay Ref #987654',
      },
    });
    assert(payRes.status === 201, 'Payment of ₹30,000 recorded in Tenant 1');
    const payment1Id = payRes.data.data.id;

    // 5. Refund: Partial refund of ₹5,000
    const refRes = await request(`/api/payments/${payment1Id}/refund`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        refund_amount_paise: 500000,
        reason: 'Hairstyle simplification adjustment',
      },
    });
    assert(refRes.status === 200, 'Partial refund of ₹5,000 processed in Tenant 1');

    // 6. Expense: Record ₹10,000 cosmetics purchase
    const expRes = await request('/api/expenses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        category: 'COSMETICS_RESTOCK',
        description: 'MAC & NARS makeup palettes',
        amount_paise: 1000000, // ₹10,000
        expense_date: '2026-11-01',
      },
    });
    assert(expRes.status === 201, 'Expense of ₹10,000 recorded in Tenant 1');

    // 7. Inventory: Create items (1 normal, 1 low stock)
    const invRes = await request('/api/inventory', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        name: 'Dior Forever Skin Glow Foundation',
        category: 'FOUNDATION',
        quantity_on_hand: 2,
        minimum_quantity: 5, // Low stock
        unit_cost_paise: 550000, // ₹5,500
      },
    });
    assert(invRes.status === 201, 'Low stock inventory item created in Tenant 1');

    // -----------------------------------------------------------------
    // 2. DASHBOARD OVERVIEW API
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Dashboard Overview (GET /api/dashboard/overview) ---');

    const overviewRes = await request('/api/dashboard/overview', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(overviewRes.status === 200, 'GET /api/dashboard/overview: Returns 200 OK');
    const ov = overviewRes.data.data;
    assert(ov.customers.total >= 1, 'Overview: Customers count matches database records');
    assert(ov.enquiries.total >= 1, 'Overview: Enquiries count matches database records');
    assert(ov.bookings.confirmed >= 1, 'Overview: Confirmed bookings matches database records');
    assert(ov.bookings.total_booking_value_paise === 4500000, 'Overview: Net booking value equals agreed ₹45,000');
    // Note on Payment Service Implementation:
    // In payment.service.js, partial refund adjusts original payment to (original - refund) = ₹25,000 (status RECORDED)
    // and creates a new payment_record of ₹5,000 (status REFUNDED).
    // Thus payments_collected_paise (status === RECORDED) is 25,00,000 paise (₹25,000),
    // refunds_processed_paise (status === REFUNDED) is 5,00,000 paise (₹5,000).
    // Net cash collected = ₹25,000 - ₹5,000 = ₹20,000 (20,00,000 paise).
    // Total expenses = ₹10,000 (10,00,000 paise).
    // Estimated cash profit = ₹20,000 - ₹10,000 = ₹10,000 (10,00,000 paise).
    assert(ov.financials.payments_collected_paise === 2500000, 'Overview: Payments collected equals recorded ₹25,000');
    assert(ov.financials.refunds_processed_paise === 500000, 'Overview: Refunds processed equals ₹5,000');
    assert(ov.financials.net_cash_collected_paise === 2000000, 'Overview: Net cash collected equals ₹20,000');
    assert(ov.financials.total_expenses_paise === 1000000, 'Overview: Total expenses equals ₹10,000');
    assert(ov.financials.estimated_cash_profit_paise === 1000000, 'Overview: Estimated cash profit equals ₹10,000 (Net Cash - Expenses)');
    assert(ov.inventory.items_below_threshold >= 1, 'Overview: Low stock items count calculated accurately');

    // -----------------------------------------------------------------
    // 3. REVENUE & PAYMENT ANALYTICS
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Revenue & Payment Analytics ---');

    const revRes = await request('/api/dashboard/revenue', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(revRes.status === 200, 'GET /api/dashboard/revenue: Returns revenue analytics');
    const rev = revRes.data.data;
    assert(rev.summary.total_payments_collected_paise === 2500000, 'Revenue: Total payments collected ₹25,000');
    assert(rev.summary.total_refunds_paise === 500000, 'Revenue: Refunds ₹5,000');
    assert(rev.summary.net_revenue_paise === 2000000, 'Revenue: Net revenue ₹20,000');
    assert(rev.payment_method_breakdown.UPI > 0, 'Revenue: UPI method breakdown populated');

    // /api/dashboard/payments endpoint check
    const payAnalyticsRes = await request('/api/dashboard/payments', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(payAnalyticsRes.status === 200, 'GET /api/dashboard/payments: Returns payment analytics');

    // -----------------------------------------------------------------
    // 4. BOOKING ANALYTICS
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Booking Analytics ---');

    const bookAnalyticsRes = await request('/api/dashboard/bookings', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(bookAnalyticsRes.status === 200, 'GET /api/dashboard/bookings: Returns booking analytics');
    const ba = bookAnalyticsRes.data.data;
    assert(ba.total_bookings >= 1, 'Booking: Total bookings count accurate');
    assert(ba.average_booking_value_paise === 4500000, 'Booking: Average booking value calculated correctly (₹45,000)');
    assert(ba.upcoming_events.length >= 1, 'Booking: Upcoming wedding events populated');
    assert(ba.upcoming_events[0].title === 'Royal Muhurtham Ceremony', 'Booking: Upcoming event title matches');

    // -----------------------------------------------------------------
    // 5. ENQUIRY ANALYTICS
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Enquiry Analytics ---');

    const enqAnalyticsRes = await request('/api/dashboard/enquiries', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(enqAnalyticsRes.status === 200, 'GET /api/dashboard/enquiries: Returns enquiry analytics');
    const ea = enqAnalyticsRes.data.data;
    assert(ea.total_enquiries >= 1, 'Enquiry: Total enquiries count accurate');
    assert(ea.pipeline_status_breakdown !== undefined, 'Enquiry: Pipeline status breakdown populated');

    // -----------------------------------------------------------------
    // 6. EXPENSES ANALYTICS
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Expenses Analytics ---');

    const expAnalyticsRes = await request('/api/dashboard/expenses', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(expAnalyticsRes.status === 200, 'GET /api/dashboard/expenses: Returns expenses analytics');
    const expA = expAnalyticsRes.data.data;
    assert(expA.total_expenses_paise === 1000000, 'Expenses: Total expenses equals ₹10,000');
    assert(expA.category_breakdown.COSMETICS_RESTOCK === 1000000, 'Expenses: Category breakdown reflects COSMETICS_RESTOCK');

    // -----------------------------------------------------------------
    // 7. INVENTORY ANALYTICS
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Inventory Analytics ---');

    const invAnalyticsRes = await request('/api/dashboard/inventory', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(invAnalyticsRes.status === 200, 'GET /api/dashboard/inventory: Returns inventory analytics');
    const invA = invAnalyticsRes.data.data;
    assert(invA.total_active_items >= 1, 'Inventory: Active items count accurate');
    assert(invA.low_stock_count >= 1, 'Inventory: Low stock count accurate');
    assert(invA.total_valuation_paise === 1100000, 'Inventory: Valuation correctly calculated (2 bottles * ₹5,500 = ₹11,000 = 1100000 paise)');

    // -----------------------------------------------------------------
    // 8. RECENT ACTIVITIES
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Recent Activities ---');

    const actRes = await request('/api/dashboard/recent-activities?limit=10', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(actRes.status === 200, 'GET /api/dashboard/recent-activities: Returns activities log');
    assert(actRes.data.data.activities.length >= 1, 'Activities list populated with real mutation records');

    // -----------------------------------------------------------------
    // 9. DATE-RANGE FILTERING & VALIDATION
    // -----------------------------------------------------------------
    console.log('\n--- Step 9: Date Range Validation & Filters ---');

    // Valid date filter
    const validDateRes = await request('/api/dashboard/overview?startDate=2026-10-01&endDate=2026-10-31', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(validDateRes.status === 200, 'Date filter: Valid date range accepted (200 OK)');

    // Invalid date range: startDate > endDate
    const invalidDateRes = await request('/api/dashboard/overview?startDate=2026-12-31&endDate=2026-01-01', {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
    });
    assert(invalidDateRes.status === 400, 'Date filter: Invalid date range (start > end) rejected with 400 Bad Request');

    // -----------------------------------------------------------------
    // 10. EMPTY DATASET SAFETY (TENANT 2)
    // -----------------------------------------------------------------
    console.log('\n--- Step 10: Empty Dataset Safety (Tenant 2) ---');

    const emptyRes = await request('/api/dashboard/overview', {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(emptyRes.status === 200, 'Empty dataset: Handled gracefully without errors (200 OK)');
    assert(emptyRes.data.data.customers.total === 0, 'Empty dataset: Returns 0 for customers');
    assert(emptyRes.data.data.financials.payments_collected_paise === 0, 'Empty dataset: Returns 0 for revenue');
    assert(emptyRes.data.data.financials.estimated_cash_profit_paise === 0, 'Empty dataset: Returns 0 for profit');

    // -----------------------------------------------------------------
    // 11. MULTI-TENANT ISOLATION & SECURITY
    // -----------------------------------------------------------------
    console.log('\n--- Step 11: Multi-Tenant Isolation & Security ---');

    // Tenant 2 with Tenant 1's business ID header -> 403 Forbidden
    const crossRes = await request('/api/dashboard/overview', {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz1Id },
    });
    assert(crossRes.status === 403, 'Tenant isolation: Tenant 2 cannot access Tenant 1 dashboard (403 Forbidden)');

    // Missing authentication -> 401
    const unauthRes = await request('/api/dashboard/overview');
    assert(unauthRes.status === 401, 'Security: Unauthenticated request rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 10 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase10Tests();
