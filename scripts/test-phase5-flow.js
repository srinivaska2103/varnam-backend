import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/utils/generate-token.js';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting Phase 5: Booking Management & Wedding Calendar Tests...\n');

  let testUser1, testUser2;
  let token1, token2;
  let business1, business2;
  let customer1, customer2;
  let booking1Id;
  let event1Id, event2Id;

  try {
    // -------------------------------------------------------------------------
    // Setup: Isolated Users, Businesses & Customers
    // -------------------------------------------------------------------------
    console.log('Setup: Preparing isolated test users, businesses & customers...');
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const ts = Date.now();

    testUser1 = await prisma.users.create({
      data: {
        email: `booking_owner1_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Booking Owner One',
        is_email_verified: true,
      },
    });
    token1 = generateAccessToken({ userId: testUser1.id, email: testUser1.email });

    testUser2 = await prisma.users.create({
      data: {
        email: `booking_owner2_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Booking Owner Two',
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
        name: 'Royal Bridal Studio Coimbatore',
        phone: `910000${ts.toString().slice(-4)}`,
        city: 'Coimbatore',
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
        name: 'Luxe Glamour Studio Chennai',
        phone: `920000${ts.toString().slice(-4)}`,
        city: 'Chennai',
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
        full_name: 'Deepika Padukone',
        phone: '9840123456',
        city: 'Coimbatore',
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
        full_name: 'Katrina Kaif',
        phone: '9840987654',
        city: 'Chennai',
      }),
    });
    const c2Json = await resC2.json();
    customer2 = c2Json.data;

    console.log(`✅ Setup Complete. Business 1: ${business1.id}, Customer 1: ${customer1.id}\n`);

    // -------------------------------------------------------------------------
    // Test 1: Reject unauthenticated booking creation (401)
    // -------------------------------------------------------------------------
    console.log('Test 1: Reject unauthenticated booking creation (401)...');
    const resT1 = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        customer_id: customer1.id,
        total_amount_paise: 5000000,
      }),
    });
    console.log(`Status: ${resT1.status}`);
    if (resT1.status !== 401) throw new Error(`Expected 401, got ${resT1.status}`);
    console.log('✅ Test 1 Passed: Unauthenticated request rejected with 401.\n');

    // -------------------------------------------------------------------------
    // Test 2: Reject booking for customer belonging to another business (Cross-business 400)
    // -------------------------------------------------------------------------
    console.log('Test 2: Reject cross-business customer booking (400)...');
    const resT2 = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        customer_id: customer2.id, // belongs to business 2!
        total_amount_paise: 5000000,
      }),
    });
    const t2Json = await resT2.json();
    console.log(`Status: ${resT2.status}, Message: "${t2Json.message}"`);
    if (resT2.status !== 400) throw new Error(`Expected 400, got ${resT2.status}`);
    console.log('✅ Test 2 Passed: Cross-business customer reference rejected.\n');

    // -------------------------------------------------------------------------
    // Test 3: Create Booking with Initial Wedding Event
    // -------------------------------------------------------------------------
    console.log('Test 3: Create Booking for authorized customer with initial Wedding Event...');
    const resT3 = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        customer_id: customer1.id,
        total_amount_paise: 6500000, // ₹65,000
        discount_paise: 500000,      // ₹5,000
        notes: 'Bridal HD muhurtham and reception package',
        event: {
          event_kind: 'WEDDING',
          title: 'Muhurtham Ceremony',
          event_date: '2026-12-15',
          start_time: '06:00:00',
          end_time: '10:00:00',
          venue: 'Sri Krishna Kalyana Mandapam',
          city: 'Coimbatore',
          instructions: 'Arrive 30 mins early for bridal saree draping.',
        },
      }),
    });
    const t3Json = await resT3.json();
    console.log(`Status: ${resT3.status}, Booking #: "${t3Json.data?.booking_number}", Events Count: ${t3Json.data?.events?.length}`);
    if (resT3.status !== 201 || !t3Json.data?.id || t3Json.data?.events?.length !== 1) {
      throw new Error(`Booking creation failed: ${JSON.stringify(t3Json)}`);
    }
    booking1Id = t3Json.data.id;
    event1Id = t3Json.data.events[0].id;
    console.log('✅ Test 3 Passed: Booking created with initial wedding event and status history.\n');

    // -------------------------------------------------------------------------
    // Test 4: List Bookings with Pagination and Date Filter
    // -------------------------------------------------------------------------
    console.log('Test 4: List bookings with pagination & status filter...');
    const resT4 = await fetch(`${API_BASE}/bookings?page=1&limit=10&status=CONFIRMED&startDate=2026-12-01&endDate=2026-12-31`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t4Json = await resT4.json();
    console.log(`Status: ${resT4.status}, Found Bookings: ${t4Json.data?.bookings?.length}, Total: ${t4Json.data?.pagination?.total}`);
    if (resT4.status !== 200 || t4Json.data?.bookings?.length !== 1) {
      throw new Error(`Booking listing failed: ${JSON.stringify(t4Json)}`);
    }
    console.log('✅ Test 4 Passed: Bookings listed and filtered by date range.\n');

    // -------------------------------------------------------------------------
    // Test 5: Get Booking Details with Payment Summary
    // -------------------------------------------------------------------------
    console.log('Test 5: Retrieve Booking Details...');
    const resT5 = await fetch(`${API_BASE}/bookings/${booking1Id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t5Json = await resT5.json();
    console.log(`Status: ${resT5.status}, Net Payable: ₹${t5Json.data?.payment_summary?.net_payable_paise / 100}, Balance: ₹${t5Json.data?.payment_summary?.balance_due_paise / 100}`);
    if (t5Json.data?.payment_summary?.net_payable_paise !== 6000000 || t5Json.data?.payment_summary?.balance_due_paise !== 6000000) {
      throw new Error(`Payment summary mismatch: ${JSON.stringify(t5Json.data?.payment_summary)}`);
    }
    console.log('✅ Test 5 Passed: Booking details retrieved with complete payment summary.\n');

    // -------------------------------------------------------------------------
    // Test 6: Cross-Tenant Isolation: User 2 attempts to get User 1's booking (403/404)
    // -------------------------------------------------------------------------
    console.log('Test 6: Cross-tenant isolation check...');
    const resT6A = await fetch(`${API_BASE}/bookings/${booking1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business1.id,
      },
    });
    console.log(`Case A (Header mismatch): Status ${resT6A.status}`);
    if (resT6A.status !== 403) throw new Error(`Expected 403, got ${resT6A.status}`);

    const resT6B = await fetch(`${API_BASE}/bookings/${booking1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business2.id,
      },
    });
    console.log(`Case B (Scoped to another business): Status ${resT6B.status}`);
    if (resT6B.status !== 404) throw new Error(`Expected 404, got ${resT6B.status}`);
    console.log('✅ Test 6 Passed: Cross-tenant booking isolation enforced.\n');

    // -------------------------------------------------------------------------
    // Test 7: Add Multiple Ceremony Events to Booking (e.g. Sangeet & Reception)
    // -------------------------------------------------------------------------
    console.log('Test 7: Add Reception Event to Booking 1...');
    const resT7 = await fetch(`${API_BASE}/bookings/${booking1Id}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        event_kind: 'RECEPTION',
        title: 'Grand Reception',
        event_date: '2026-12-15',
        start_time: '18:00:00', // Non-overlapping evening event on the same day!
        end_time: '22:00:00',
        venue: 'Le Meridien Ballroom, Coimbatore',
        city: 'Coimbatore',
      }),
    });
    const t7Json = await resT7.json();
    console.log(`Status: ${resT7.status}, Added Event: "${t7Json.data?.title}" (${t7Json.data?.start_time} - ${t7Json.data?.end_time})`);
    if (resT7.status !== 201 || !t7Json.data?.id) throw new Error(`Add event failed: ${JSON.stringify(t7Json)}`);
    event2Id = t7Json.data.id;
    console.log('✅ Test 7 Passed: Successfully added non-overlapping event on the same day.\n');

    // -------------------------------------------------------------------------
    // Test 8: Schedule Conflict Detection (Overlapping Time Conflict)
    // -------------------------------------------------------------------------
    console.log('Test 8: Schedule Conflict Detection (Attempt overlapping event)...');
    const resT8 = await fetch(`${API_BASE}/bookings/${booking1Id}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        event_kind: 'HALDI',
        title: 'Conflicting Haldi Ceremony',
        event_date: '2026-12-15',
        start_time: '08:00:00', // Overlaps with 06:00:00 - 10:00:00 Muhurtham!
        end_time: '11:00:00',
        venue: 'Same Mandapam',
      }),
    });
    const t8Json = await resT8.json();
    console.log(`Status: ${resT8.status}, Message: "${t8Json.message}"`);
    if (resT8.status !== 409) throw new Error(`Expected 409 Conflict, got ${resT8.status}`);
    console.log('✅ Test 8 Passed: Overlapping schedule conflict successfully detected and blocked with 409.\n');

    // -------------------------------------------------------------------------
    // Test 9: Calendar API (Day, Week, Month view)
    // -------------------------------------------------------------------------
    console.log('Test 9: Calendar API: Retrieve events for December 2026...');
    const resT9 = await fetch(`${API_BASE}/bookings/calendar?startDate=2026-12-01&endDate=2026-12-31&view=month`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t9Json = await resT9.json();
    console.log(`Status: ${resT9.status}, Total Calendar Events: ${t9Json.data?.totalEvents}`);
    if (resT9.status !== 200 || t9Json.data?.totalEvents !== 2) {
      throw new Error(`Calendar events mismatch: ${JSON.stringify(t9Json)}`);
    }
    console.log('✅ Test 9 Passed: Calendar endpoint returned all scheduled ceremony events.\n');

    // -------------------------------------------------------------------------
    // Test 10: Update Booking Profile (Amounts / Notes)
    // -------------------------------------------------------------------------
    console.log('Test 10: Update Booking Details...');
    const resT10 = await fetch(`${API_BASE}/bookings/${booking1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        total_amount_paise: 7000000, // ₹70,000
        notes: 'Added extra groom touchup service',
      }),
    });
    const t10Json = await resT10.json();
    console.log(`Status: ${resT10.status}, Updated Total: ₹${t10Json.data?.total_amount_paise / 100}`);
    if (t10Json.data?.total_amount_paise !== 7000000) throw new Error(`Update total failed: ${JSON.stringify(t10Json)}`);
    console.log('✅ Test 10 Passed: Booking details updated.\n');

    // -------------------------------------------------------------------------
    // Test 11: Validate Status Transition (e.g. CONFIRMED -> PLANNING -> READY)
    // -------------------------------------------------------------------------
    console.log('Test 11: Validate Booking Status Workflow Transitions...');
    // Valid transition: CONFIRMED -> PLANNING
    const resT11A = await fetch(`${API_BASE}/bookings/${booking1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        status: 'PLANNING',
        note: 'Moodboard and makeup trials completed with bride',
      }),
    });
    const t11AJson = await resT11A.json();
    console.log(`Valid transition to PLANNING: Status ${resT11A.status}, Status: "${t11AJson.data?.status}"`);
    if (t11AJson.data?.status !== 'PLANNING') throw new Error('Status transition to PLANNING failed');

    // Invalid transition: PLANNING -> COMPLETED (Must go through READY / IN_PROGRESS first)
    const resT11B = await fetch(`${API_BASE}/bookings/${booking1Id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        status: 'COMPLETED',
      }),
    });
    console.log(`Illegal transition PLANNING -> COMPLETED: Status ${resT11B.status}`);
    if (resT11B.status !== 400) throw new Error(`Expected 400, got ${resT11B.status}`);
    console.log('✅ Test 11 Passed: Booking status workflow transitions validated.\n');

    // -------------------------------------------------------------------------
    // Test 12: Record Manual Payment and Verify Payment Summary
    // -------------------------------------------------------------------------
    console.log('Test 12: Record Manual Advance Payment (₹25,000)...');
    await prisma.payment_records.create({
      data: {
        business_id: business1.id,
        booking_id: booking1Id,
        customer_id: customer1.id,
        amount_paise: BigInt(2500000), // ₹25,000
        method: 'UPI',
        status: 'RECORDED',
        receipt_number: `REC-${ts.toString().slice(-6)}`,
        reference_note: 'GooglePay UPI reference #9812739182',
        recorded_by: testUser1.id,
      },
    });

    const resT12 = await fetch(`${API_BASE}/bookings/${booking1Id}/payments`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t12Json = await resT12.json();
    console.log(`Status: ${resT12.status}, Payments recorded: ${t12Json.data?.payments?.length}`);
    console.log(`Payment Summary: Net Payable ₹${t12Json.data?.payment_summary?.net_payable_paise / 100}, Paid ₹${t12Json.data?.payment_summary?.total_paid_paise / 100}, Balance Due ₹${t12Json.data?.payment_summary?.balance_due_paise / 100}`);
    if (t12Json.data?.payment_summary?.total_paid_paise !== 2500000 || t12Json.data?.payment_summary?.balance_due_paise !== 4000000) {
      throw new Error(`Payment calculation error: ${JSON.stringify(t12Json)}`);
    }
    console.log('✅ Test 12 Passed: Payment summary accurately calculated without gateway integration.\n');

    // -------------------------------------------------------------------------
    // Test 13: Cancel Booking without Deleting History
    // -------------------------------------------------------------------------
    console.log('Test 13: Cancel Booking without deleting records...');
    const resT13 = await fetch(`${API_BASE}/bookings/${booking1Id}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        cancellation_reason: 'Wedding postponed to next year due to family emergency',
      }),
    });
    const t13Json = await resT13.json();
    console.log(`Status: ${resT13.status}, New Status: "${t13Json.data?.status}", Cancellation Reason: "${t13Json.data?.cancellation_reason}"`);
    if (resT13.status !== 200 || t13Json.data?.status !== 'CANCELLED') {
      throw new Error(`Cancellation failed: ${JSON.stringify(t13Json)}`);
    }

    // Verify booking still exists in DB
    const checkBooking = await prisma.bookings.findUnique({ where: { id: booking1Id } });
    if (!checkBooking) throw new Error('Booking must not be deleted upon cancellation!');

    // Verify calendar now excludes cancelled booking events by default
    const resT13Cal = await fetch(`${API_BASE}/bookings/calendar?startDate=2026-12-01&endDate=2026-12-31`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t13CalJson = await resT13Cal.json();
    console.log(`Active Calendar Events count after cancellation: ${t13CalJson.data?.totalEvents}`);
    if (t13CalJson.data?.totalEvents !== 0) throw new Error('Calendar must exclude events from cancelled bookings');
    console.log('✅ Test 13 Passed: Booking safely cancelled with reason preserved and calendar updated.\n');

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log('Cleaning up test data...');
    if (booking1Id) {
      await prisma.payment_records.deleteMany({ where: { booking_id: booking1Id } });
      await prisma.booking_status_history.deleteMany({ where: { booking_id: booking1Id } });
      await prisma.booking_events.deleteMany({ where: { booking_id: booking1Id } });
      await prisma.bookings.deleteMany({ where: { id: booking1Id } });
    }
    if (customer1) await prisma.customers.deleteMany({ where: { id: customer1.id } });
    if (customer2) await prisma.customers.deleteMany({ where: { id: customer2.id } });
    if (business1) {
      await prisma.business_websites.deleteMany({ where: { business_id: business1.id } });
      await prisma.business_entitlements.deleteMany({ where: { business_id: business1.id } });
      await prisma.business_members.deleteMany({ where: { business_id: business1.id } });
      await prisma.businesses.deleteMany({ where: { id: business1.id } });
    }
    if (business2) {
      await prisma.business_websites.deleteMany({ where: { business_id: business2.id } });
      await prisma.business_entitlements.deleteMany({ where: { business_id: business2.id } });
      await prisma.business_members.deleteMany({ where: { business_id: business2.id } });
      await prisma.businesses.deleteMany({ where: { id: business2.id } });
    }
    if (testUser1) await prisma.users.delete({ where: { id: testUser1.id } });
    if (testUser2) await prisma.users.delete({ where: { id: testUser2.id } });

    console.log('🎉 ALL 13 PHASE 5 TESTS COMPLETED AND VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
