import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/utils/generate-token.js';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting Phase 6: Manual Payment Management & Financial Tracking Tests...\n');

  let testUser1, testUser2;
  let token1, token2;
  let business1, business2;
  let customer1, customer2;
  let booking1, booking2;
  let payment1Id, payment2Id;
  let expense1Id;

  try {
    // -------------------------------------------------------------------------
    // Setup: Isolated Users, Businesses, Customers & Bookings
    // -------------------------------------------------------------------------
    console.log('Setup: Preparing isolated test users, businesses & bookings...');
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const ts = Date.now();

    testUser1 = await prisma.users.create({
      data: {
        email: `fin_owner1_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Finance Owner One',
        is_email_verified: true,
      },
    });
    token1 = generateAccessToken({ userId: testUser1.id, email: testUser1.email });

    testUser2 = await prisma.users.create({
      data: {
        email: `fin_owner2_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Finance Owner Two',
        is_email_verified: true,
      },
    });
    token2 = generateAccessToken({ userId: testUser2.id, email: testUser2.email });

    // Business 1
    const resB1 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: 'Glow Bridal Finance Studio 1',
        phone: `910000${ts.toString().slice(-4)}`,
        city: 'Madurai',
      }),
    });
    const b1Json = await resB1.json();
    business1 = b1Json.data.business;

    // Business 2
    const resB2 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: 'Glam Finance Studio 2',
        phone: `920000${ts.toString().slice(-4)}`,
        city: 'Tirunelveli',
      }),
    });
    const b2Json = await resB2.json();
    business2 = b2Json.data.business;

    // Customer 1 in Business 1
    const resC1 = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        full_name: 'Nayanthara Kurian',
        phone: '9840555666',
        city: 'Madurai',
      }),
    });
    const c1Json = await resC1.json();
    customer1 = c1Json.data;

    // Customer 2 in Business 2
    const resC2 = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
        'x-business-id': business2.id,
      },
      body: JSON.stringify({
        full_name: 'Samantha Ruth',
        phone: '9840777888',
        city: 'Tirunelveli',
      }),
    });
    const c2Json = await resC2.json();
    customer2 = c2Json.data;

    // Booking 1 in Business 1: Total ₹80,000, Discount ₹5,000 -> Net Payable ₹75,000
    const resBk1 = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        customer_id: customer1.id,
        total_amount_paise: 8000000,
        discount_paise: 500000,
        notes: 'Grand wedding combo package',
        event: {
          event_kind: 'WEDDING',
          title: 'Muhurtham',
          event_date: '2026-11-20',
          start_time: '06:00:00',
          end_time: '10:00:00',
        },
      }),
    });
    const bk1Json = await resBk1.json();
    booking1 = bk1Json.data;

    // Booking 2 in Business 2
    const resBk2 = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
        'x-business-id': business2.id,
      },
      body: JSON.stringify({
        customer_id: customer2.id,
        total_amount_paise: 4000000,
        discount_paise: 0,
      }),
    });
    const bk2Json = await resBk2.json();
    booking2 = bk2Json.data;

    console.log(`✅ Setup Complete. Business 1: ${business1.id}, Booking 1: ${booking1.id}\n`);

    // -------------------------------------------------------------------------
    // Test 1: Record a Valid Manual Payment (₹30,000 Advance via UPI)
    // -------------------------------------------------------------------------
    console.log('Test 1: Record a valid manual payment (POST /api/payments)...');
    const resT1 = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        booking_id: booking1.id,
        amount_paise: 3000000, // ₹30,000
        method: 'UPI',
        reference_note: 'GPay Ref #123456789',
        notes: 'Initial booking deposit received',
      }),
    });
    const t1Json = await resT1.json();
    console.log(`Status: ${resT1.status}, Receipt #: "${t1Json.data?.receipt_number}", Amount: ₹${t1Json.data?.amount_paise / 100}`);
    if (resT1.status !== 201 || !t1Json.data?.id || t1Json.data?.amount_paise !== 3000000) {
      throw new Error(`Payment record failed: ${JSON.stringify(t1Json)}`);
    }
    payment1Id = t1Json.data.id;
    console.log('✅ Test 1 Passed: Valid payment recorded.\n');

    // -------------------------------------------------------------------------
    // Test 2: Reject Invalid Payment Amount (Negative or Zero)
    // -------------------------------------------------------------------------
    console.log('Test 2: Reject invalid payment amount (0 or negative)...');
    const resT2 = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        booking_id: booking1.id,
        amount_paise: -5000,
        method: 'CASH',
      }),
    });
    console.log(`Status: ${resT2.status}`);
    if (resT2.status !== 400) throw new Error(`Expected 400, got ${resT2.status}`);
    console.log('✅ Test 2 Passed: Invalid payment amount rejected with 400.\n');

    // -------------------------------------------------------------------------
    // Test 3: Reject Payment for Booking Belonging to Another Business (Cross-Tenant)
    // -------------------------------------------------------------------------
    console.log('Test 3: Reject payment for cross-business booking reference...');
    const resT3 = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        booking_id: booking2.id, // Booking belongs to business 2!
        amount_paise: 2000000,
        method: 'CASH',
      }),
    });
    const t3Json = await resT3.json();
    console.log(`Status: ${resT3.status}, Message: "${t3Json.message}"`);
    if (resT3.status !== 400) throw new Error(`Expected 400, got ${resT3.status}`);
    console.log('✅ Test 3 Passed: Cross-business booking reference rejected.\n');

    // -------------------------------------------------------------------------
    // Test 4: List Payments with Pagination and Filters
    // -------------------------------------------------------------------------
    console.log('Test 4: List payments with pagination & method filter...');
    const resT4 = await fetch(`${API_BASE}/payments?page=1&limit=10&method=UPI`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t4Json = await resT4.json();
    console.log(`Status: ${resT4.status}, Total Payments: ${t4Json.data?.pagination?.total}`);
    if (resT4.status !== 200 || t4Json.data?.payments?.length !== 1) {
      throw new Error(`List payments failed: ${JSON.stringify(t4Json)}`);
    }
    console.log('✅ Test 4 Passed: Payments listed with pagination and method filtering.\n');

    // -------------------------------------------------------------------------
    // Test 5: Booking Payment History & Reconciliation Calculation
    // -------------------------------------------------------------------------
    console.log('Test 5: Retrieve Booking Payment History & Reconciliation...');
    // Record second payment (₹20,000 via CASH)
    const resPay2 = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        booking_id: booking1.id,
        amount_paise: 2000000, // ₹20,000
        method: 'CASH',
        notes: 'Second installment paid at trial',
      }),
    });
    const pay2Json = await resPay2.json();
    payment2Id = pay2Json.data.id;

    const resT5 = await fetch(`${API_BASE}/payments/bookings/${booking1.id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    // Or via /api/bookings/:id/payments
    const resT5Alt = await fetch(`${API_BASE}/bookings/${booking1.id}/payments`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t5Json = await resT5Alt.json();
    console.log(`Status: ${resT5Alt.status}`);
    console.log(`Reconciliation Summary: Net Payable ₹${t5Json.data?.payment_summary?.net_payable_paise / 100}, Collected ₹${t5Json.data?.payment_summary?.total_collected_paise / 100}, Balance Due ₹${t5Json.data?.payment_summary?.balance_due_paise / 100}`);
    // Net Payable: 75,000 | Collected: 50,000 | Balance: 25,000
    if (t5Json.data?.payment_summary?.net_payable_paise !== 7500000 ||
        t5Json.data?.payment_summary?.total_collected_paise !== 5000000 ||
        t5Json.data?.payment_summary?.balance_due_paise !== 2500000) {
      throw new Error(`Reconciliation mismatch: ${JSON.stringify(t5Json.data?.payment_summary)}`);
    }
    console.log('✅ Test 5 Passed: Booking payment history accurately reconciled.\n');

    // -------------------------------------------------------------------------
    // Test 6: Retrieve Branded Payment Receipt
    // -------------------------------------------------------------------------
    console.log('Test 6: Retrieve payment receipt (GET /api/payments/:id/receipt)...');
    const resT6 = await fetch(`${API_BASE}/payments/${payment1Id}/receipt`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t6Json = await resT6.json();
    console.log(`Status: ${resT6.status}, Studio: "${t6Json.data?.business?.name}", Client: "${t6Json.data?.customer?.full_name}", Receipt: "${t6Json.data?.receipt?.receipt_number}", Amount: ${t6Json.data?.receipt?.amount_formatted}`);
    if (resT6.status !== 200 || !t6Json.data?.receipt?.receipt_number || t6Json.data?.customer?.full_name !== 'Nayanthara Kurian') {
      throw new Error(`Receipt retrieval failed: ${JSON.stringify(t6Json)}`);
    }
    console.log('✅ Test 6 Passed: Professional payment receipt generated.\n');

    // -------------------------------------------------------------------------
    // Test 7: Reject Refund Exceeding Payment Amount
    // -------------------------------------------------------------------------
    console.log('Test 7: Reject refund exceeding original payment amount...');
    const resT7 = await fetch(`${API_BASE}/payments/${payment2Id}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        refund_amount_paise: 2500000, // ₹25,000 > ₹20,000 original amount!
        reason: 'Client requested over-refund',
      }),
    });
    const t7Json = await resT7.json();
    console.log(`Status: ${resT7.status}, Message: "${t7Json.message}"`);
    if (resT7.status !== 400) throw new Error(`Expected 400, got ${resT7.status}`);
    console.log('✅ Test 7 Passed: Over-refund strictly blocked.\n');

    // -------------------------------------------------------------------------
    // Test 8: Record a Valid Refund (₹10,000 Partial Refund on Payment 2)
    // -------------------------------------------------------------------------
    console.log('Test 8: Record valid partial refund (₹10,000 on Payment 2)...');
    const resT8 = await fetch(`${API_BASE}/payments/${payment2Id}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        refund_amount_paise: 1000000, // ₹10,000
        reason: 'Bridal trial package downgrade discount adjustment',
      }),
    });
    const t8Json = await resT8.json();
    console.log(`Status: ${resT8.status}, Refunded: ₹${t8Json.data?.refunded_amount_paise / 100}`);
    if (resT8.status !== 200 || t8Json.data?.refunded_amount_paise !== 1000000) {
      throw new Error(`Refund failed: ${JSON.stringify(t8Json)}`);
    }
    console.log('✅ Test 8 Passed: Partial refund recorded without deleting financial history.\n');

    // -------------------------------------------------------------------------
    // Test 9: Create Studio Expenses
    // -------------------------------------------------------------------------
    console.log('Test 9: Create Studio Expense (POST /api/expenses)...');
    const todayStr = new Date().toISOString().split('T')[0];
    const resT9 = await fetch(`${API_BASE}/expenses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        category: 'COSMETICS_RESTOCK',
        description: 'Huda Beauty foundation and MAC lipsticks restocking',
        amount_paise: 1250000, // ₹12,500
        expense_date: todayStr,
        vendor_name: 'Nykaa Professional Studio Supplies',
        notes: 'Batch #NYK-9901 for wedding season',
      }),
    });
    const t9Json = await resT9.json();
    console.log(`Status: ${resT9.status}, Expense ID: ${t9Json.data?.id}, Amount: ₹${t9Json.data?.amount_paise / 100}`);
    if (resT9.status !== 201 || !t9Json.data?.id || t9Json.data?.amount_paise !== 1250000) {
      throw new Error(`Expense creation failed: ${JSON.stringify(t9Json)}`);
    }
    expense1Id = t9Json.data.id;
    console.log('✅ Test 9 Passed: Studio expense recorded successfully.\n');

    // -------------------------------------------------------------------------
    // Test 10: List Expenses with Category and Date Filtering
    // -------------------------------------------------------------------------
    console.log('Test 10: List expenses with category and date range filter...');
    const resT10 = await fetch(`${API_BASE}/expenses?category=COSMETICS_RESTOCK&startDate=${todayStr}&endDate=${todayStr}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t10Json = await resT10.json();
    console.log(`Status: ${resT10.status}, Expenses Count: ${t10Json.data?.expenses?.length}`);
    if (resT10.status !== 200 || t10Json.data?.expenses?.length !== 1) {
      throw new Error(`Expense listing failed: ${JSON.stringify(t10Json)}`);
    }
    console.log('✅ Test 10 Passed: Expenses filtered by category and date range.\n');

    // -------------------------------------------------------------------------
    // Test 11: Comprehensive Financial Report
    // -------------------------------------------------------------------------
    console.log('Test 11: Generate Comprehensive Financial Report (GET /api/reports/financial)...');
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];

    const resT11 = await fetch(`${API_BASE}/reports/financial?startDate=${firstDayOfMonth}&endDate=${lastDayOfMonth}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t11Json = await resT11.json();
    console.log(`Status: ${resT11.status}`);
    const summary = t11Json.data?.summary;
    console.log(`Report Summary:`);
    console.log(`  - Net Booking Value: ₹${summary?.total_net_booking_value_paise / 100}`);
    console.log(`  - Payments Collected: ₹${summary?.payments_collected_paise / 100}`);
    console.log(`  - Refunds Processed: ₹${summary?.refunds_processed_paise / 100}`);
    console.log(`  - Net Cash Collected: ₹${summary?.net_cash_collected_paise / 100}`);
    console.log(`  - Total Expenses: ₹${summary?.total_expenses_paise / 100}`);
    console.log(`  - Net Cash Movement: ₹${summary?.net_cash_movement_paise / 100}`);
    console.log(`  - Outstanding Balances: ₹${summary?.total_outstanding_balance_paise / 100}`);

    if (resT11.status !== 200 ||
        summary?.payments_collected_paise !== 4000000 || // 30,000 + 10,000 remaining on payment 2
        summary?.refunds_processed_paise !== 1000000 ||  // 10,000 refund record
        summary?.net_cash_collected_paise !== 3000000 || // 40,000 - 10,000
        summary?.total_expenses_paise !== 1250000) {     // 12,500
      throw new Error(`Financial report metrics mismatch: ${JSON.stringify(summary)}`);
    }
    console.log('✅ Test 11 Passed: Financial report accurately distinguishes booking value, cash collected, refunds, and operational expenses.\n');

    // -------------------------------------------------------------------------
    // Test 12: Cross-Tenant Isolation for Payments and Reports (403/404)
    // -------------------------------------------------------------------------
    console.log('Test 12: Cross-Tenant Isolation for Financial APIs...');
    // User 2 cannot access User 1's payment receipt
    const resT12Receipt = await fetch(`${API_BASE}/payments/${payment1Id}/receipt`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business2.id,
      },
    });
    console.log(`User 2 access to User 1 receipt: Status ${resT12Receipt.status}`);
    if (resT12Receipt.status !== 404) throw new Error(`Expected 404, got ${resT12Receipt.status}`);

    // User 2 header mismatch
    const resT12Header = await fetch(`${API_BASE}/payments/${payment1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business1.id,
      },
    });
    console.log(`User 2 unauthorized business header: Status ${resT12Header.status}`);
    if (resT12Header.status !== 403) throw new Error(`Expected 403, got ${resT12Header.status}`);
    console.log('✅ Test 12 Passed: Cross-tenant financial data isolation strictly enforced.\n');

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log('Cleaning up test data...');
    if (business1) {
      await prisma.expenses.deleteMany({ where: { business_id: business1.id } });
      await prisma.payment_records.deleteMany({ where: { business_id: business1.id } });
      await prisma.booking_events.deleteMany({ where: { business_id: business1.id } });
      await prisma.booking_status_history.deleteMany({ where: { business_id: business1.id } });
      await prisma.bookings.deleteMany({ where: { business_id: business1.id } });
      await prisma.customers.deleteMany({ where: { business_id: business1.id } });
      await prisma.business_websites.deleteMany({ where: { business_id: business1.id } });
      await prisma.business_entitlements.deleteMany({ where: { business_id: business1.id } });
      await prisma.business_members.deleteMany({ where: { business_id: business1.id } });
      await prisma.businesses.deleteMany({ where: { id: business1.id } });
    }
    if (business2) {
      await prisma.expenses.deleteMany({ where: { business_id: business2.id } });
      await prisma.payment_records.deleteMany({ where: { business_id: business2.id } });
      await prisma.booking_events.deleteMany({ where: { business_id: business2.id } });
      await prisma.booking_status_history.deleteMany({ where: { business_id: business2.id } });
      await prisma.bookings.deleteMany({ where: { business_id: business2.id } });
      await prisma.customers.deleteMany({ where: { business_id: business2.id } });
      await prisma.business_websites.deleteMany({ where: { business_id: business2.id } });
      await prisma.business_entitlements.deleteMany({ where: { business_id: business2.id } });
      await prisma.business_members.deleteMany({ where: { business_id: business2.id } });
      await prisma.businesses.deleteMany({ where: { id: business2.id } });
    }
    if (testUser1) await prisma.users.delete({ where: { id: testUser1.id } });
    if (testUser2) await prisma.users.delete({ where: { id: testUser2.id } });

    console.log('🎉 ALL 12 PHASE 6 TESTS COMPLETED AND VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
