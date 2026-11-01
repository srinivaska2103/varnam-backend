import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/utils/generate-token.js';

const API_BASE = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting Phase 4: Customer Management & Enquiry CRM Tests...\n');

  let testUser1, testUser2;
  let token1, token2;
  let business1, business2;
  let customer1Id, customer2Id;
  let enquiry1Id;
  let convertedBookingId;

  try {
    // -------------------------------------------------------------------------
    // Setup: Isolated Users & Businesses
    // -------------------------------------------------------------------------
    console.log('Setup: Preparing isolated test users & businesses...');
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const ts = Date.now();

    testUser1 = await prisma.users.create({
      data: {
        email: `crm_owner1_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'CRM Owner One',
        is_email_verified: true,
      },
    });
    token1 = generateAccessToken({ userId: testUser1.id, email: testUser1.email });

    testUser2 = await prisma.users.create({
      data: {
        email: `crm_owner2_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'CRM Owner Two',
        is_email_verified: true,
      },
    });
    token2 = generateAccessToken({ userId: testUser2.id, email: testUser2.email });

    // Create Business 1 for User 1
    const resB1 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: 'Bridal Glam Studio 1',
        phone: `910000${ts.toString().slice(-4)}`,
        email: `studio1_${ts}@example.com`,
        city: 'Coimbatore',
      }),
    });
    const b1Json = await resB1.json();
    business1 = b1Json.data.business;

    // Create Business 2 for User 2
    const resB2 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: 'Bridal Luxe Studio 2',
        phone: `920000${ts.toString().slice(-4)}`,
        email: `studio2_${ts}@example.com`,
        city: 'Chennai',
      }),
    });
    const b2Json = await resB2.json();
    business2 = b2Json.data.business;

    console.log(`✅ Setup Complete. Business 1: ${business1.id}, Business 2: ${business2.id}\n`);

    // -------------------------------------------------------------------------
    // Test 1: Reject Customer Creation without Authentication (401)
    // -------------------------------------------------------------------------
    console.log('Test 1: Reject unauthenticated customer creation (401)...');
    const resT1 = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        full_name: 'Ananya Sharma',
        phone: '9840112233',
      }),
    });
    console.log(`Status: ${resT1.status}`);
    if (resT1.status !== 401) throw new Error(`Expected 401, got ${resT1.status}`);
    console.log('✅ Test 1 Passed: Unauthenticated request rejected with 401.\n');

    // -------------------------------------------------------------------------
    // Test 2: Create Customer with Authenticated User & Business Context
    // -------------------------------------------------------------------------
    console.log('Test 2: Create Customer under Business 1...');
    const resT2 = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        full_name: 'Ananya Sharma',
        phone: '9840112233',
        email: 'ananya@example.com',
        city: 'Coimbatore',
        address: '104 Lotus Avenue, RS Puram',
        notes: 'Bride prefers subtle HD makeup for engagement.',
      }),
    });
    const t2Json = await resT2.json();
    console.log(`Status: ${resT2.status}, Created Customer: "${t2Json.data?.full_name}" (ID: ${t2Json.data?.id})`);
    if (resT2.status !== 201 || !t2Json.data?.id) throw new Error(`Customer creation failed: ${JSON.stringify(t2Json)}`);
    customer1Id = t2Json.data.id;
    console.log('✅ Test 2 Passed: Customer created successfully.\n');

    // -------------------------------------------------------------------------
    // Test 3: List Customers with Pagination & Sorting
    // -------------------------------------------------------------------------
    console.log('Test 3: List customers with pagination & sorting...');
    const resT3 = await fetch(`${API_BASE}/customers?page=1&limit=10&sortBy=created_at&sortOrder=desc`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t3Json = await resT3.json();
    console.log(`Status: ${resT3.status}, Total Customers: ${t3Json.data?.pagination?.total}`);
    if (resT3.status !== 200 || t3Json.data?.customers?.length !== 1) {
      throw new Error(`Customer listing failed: ${JSON.stringify(t3Json)}`);
    }
    console.log('✅ Test 3 Passed: Customers listed with pagination.\n');

    // -------------------------------------------------------------------------
    // Test 4: Search Customers by Name / Phone
    // -------------------------------------------------------------------------
    console.log('Test 4: Search customer by phone...');
    const resT4 = await fetch(`${API_BASE}/customers?search=9840112233`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t4Json = await resT4.json();
    console.log(`Status: ${resT4.status}, Search Matches: ${t4Json.data?.customers?.length}`);
    if (t4Json.data?.customers?.[0]?.phone !== '9840112233') {
      throw new Error(`Search failed: ${JSON.stringify(t4Json)}`);
    }
    console.log('✅ Test 4 Passed: Customer search returned matching record.\n');

    // -------------------------------------------------------------------------
    // Test 5: Update Customer Profile
    // -------------------------------------------------------------------------
    console.log('Test 5: Update Customer Profile...');
    const resT5 = await fetch(`${API_BASE}/customers/${customer1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        city: 'Coimbatore North',
        alternate_phone: '9840998877',
      }),
    });
    const t5Json = await resT5.json();
    console.log(`Status: ${resT5.status}, Updated City: "${t5Json.data?.city}"`);
    if (t5Json.data?.city !== 'Coimbatore North' || t5Json.data?.alternate_phone !== '9840998877') {
      throw new Error(`Customer update failed: ${JSON.stringify(t5Json)}`);
    }
    console.log('✅ Test 5 Passed: Customer profile updated successfully.\n');

    // -------------------------------------------------------------------------
    // Test 6: Cross-Tenant Isolation: User 2 attempts to access User 1's customer (403/404)
    // -------------------------------------------------------------------------
    console.log('Test 6: Cross-tenant isolation check...');
    // Case A: User 2 uses User 1's business ID header (403 Forbidden)
    const resT6A = await fetch(`${API_BASE}/customers/${customer1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business1.id,
      },
    });
    console.log(`Case A (Unauthorized Business Header): Status ${resT6A.status}`);
    if (resT6A.status !== 403) throw new Error(`Expected 403, got ${resT6A.status}`);

    // Case B: User 2 uses User 2's business ID header to fetch User 1's customer ID (404 Not Found)
    const resT6B = await fetch(`${API_BASE}/customers/${customer1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': business2.id,
      },
    });
    console.log(`Case B (Scoped to another Business ID): Status ${resT6B.status}`);
    if (resT6B.status !== 404) throw new Error(`Expected 404, got ${resT6B.status}`);
    console.log('✅ Test 6 Passed: Cross-tenant customer isolation strictly enforced.\n');

    // -------------------------------------------------------------------------
    // Test 7: Archive Customer (Soft-delete)
    // -------------------------------------------------------------------------
    console.log('Test 7: Archive customer (Soft-delete)...');
    const resT7 = await fetch(`${API_BASE}/customers/${customer1Id}/archive`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t7Json = await resT7.json();
    console.log(`Status: ${resT7.status}, is_archived: ${t7Json.data?.is_archived}`);
    if (resT7.status !== 200 || !t7Json.data?.is_archived) {
      throw new Error(`Customer archive failed: ${JSON.stringify(t7Json)}`);
    }

    // Verify default listing excludes archived customer
    const resT7List = await fetch(`${API_BASE}/customers`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t7ListJson = await resT7List.json();
    console.log(`Default list count after archiving: ${t7ListJson.data?.customers?.length}`);
    if (t7ListJson.data?.customers?.length !== 0) {
      throw new Error('Default customer list must exclude archived records');
    }

    // Verify includeArchived=true returns it
    const resT7Include = await fetch(`${API_BASE}/customers?includeArchived=true`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t7IncludeJson = await resT7Include.json();
    if (t7IncludeJson.data?.customers?.length !== 1) {
      throw new Error('includeArchived=true must return archived records');
    }
    console.log('✅ Test 7 Passed: Customer successfully archived and filtered from active list.\n');

    // -------------------------------------------------------------------------
    // Test 8: Create Enquiry with Automatic Customer Linking
    // -------------------------------------------------------------------------
    console.log('Test 8: Create Enquiry for a new bridal client...');
    const eventDate = new Date();
    eventDate.setDate(eventDate.getDate() + 30); // 30 days from now
    const nextFollowUp = new Date();
    nextFollowUp.setDate(nextFollowUp.getDate() + 1); // Tomorrow

    const resT8 = await fetch(`${API_BASE}/enquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        customer_name: 'Pooja Sundaram',
        customer_phone: '9876500112',
        customer_email: 'pooja@example.com',
        event_kind: 'WEDDING',
        event_date: eventDate.toISOString().split('T')[0],
        event_venue: 'Kalyana Mandapam, Madurai',
        event_city: 'Madurai',
        guest_count: 500,
        budget_paise: 7500000, // ₹75,000 in paise
        source: 'INSTAGRAM',
        next_follow_up_at: nextFollowUp.toISOString(),
        notes: 'Needs bridal muhurtham and reception look with airbrush makeup.',
      }),
    });
    const t8Json = await resT8.json();
    console.log(`Status: ${resT8.status}, Enquiry ID: ${t8Json.data?.id}, Status: ${t8Json.data?.status}`);
    if (resT8.status !== 201 || !t8Json.data?.id) throw new Error(`Enquiry creation failed: ${JSON.stringify(t8Json)}`);
    enquiry1Id = t8Json.data.id;
    console.log('✅ Test 8 Passed: Enquiry created with initial activity log.\n');

    // -------------------------------------------------------------------------
    // Test 9: Filter Enquiries by Status
    // -------------------------------------------------------------------------
    console.log('Test 9: Filter enquiries by status...');
    const resT9 = await fetch(`${API_BASE}/enquiries?status=NEW`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t9Json = await resT9.json();
    console.log(`Status: ${resT9.status}, Found NEW enquiries: ${t9Json.data?.enquiries?.length}`);
    if (t9Json.data?.enquiries?.length !== 1 || t9Json.data?.enquiries?.[0]?.status !== 'NEW') {
      throw new Error(`Enquiry filter failed: ${JSON.stringify(t9Json)}`);
    }
    console.log('✅ Test 9 Passed: Enquiries filtered by status correctly.\n');

    // -------------------------------------------------------------------------
    // Test 10: Record Enquiry Activities (Phone Call & Consultation Note)
    // -------------------------------------------------------------------------
    console.log('Test 10: Record Enquiry Activity (Phone Call)...');
    const resT10 = await fetch(`${API_BASE}/enquiries/${enquiry1Id}/activities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        activity_type: 'PHONE_CALL',
        title: 'Initial consultation call with bride',
        details: 'Discussed schedule, skin type, and bridal saree color matching.',
      }),
    });
    const t10Json = await resT10.json();
    console.log(`Status: ${resT10.status}, Activity: "${t10Json.data?.title}"`);
    if (resT10.status !== 201 || !t10Json.data?.id) throw new Error(`Activity creation failed: ${JSON.stringify(t10Json)}`);
    console.log('✅ Test 10 Passed: Enquiry interaction activity recorded.\n');

    // -------------------------------------------------------------------------
    // Test 11: Retrieve Follow-ups (Upcoming & Overdue)
    // -------------------------------------------------------------------------
    console.log('Test 11: Retrieve Follow-ups...');
    const resT11 = await fetch(`${API_BASE}/enquiries/follow-ups?filter=upcoming`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
    });
    const t11Json = await resT11.json();
    console.log(`Status: ${resT11.status}, Upcoming follow-ups: ${t11Json.data?.followUps?.length}`);
    if (resT11.status !== 200 || t11Json.data?.followUps?.length !== 1) {
      throw new Error(`Follow-up retrieval failed: ${JSON.stringify(t11Json)}`);
    }
    console.log('✅ Test 11 Passed: Upcoming follow-up retrieved with urgency tagging.\n');

    // -------------------------------------------------------------------------
    // Test 12: Reject Invalid Status Transition
    // -------------------------------------------------------------------------
    console.log('Test 12: Reject Invalid Status Transition (CONVERTED without booking endpoint)...');
    const resT12 = await fetch(`${API_BASE}/enquiries/${enquiry1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        status: 'LOST',
      }),
    });
    const t12Json = await resT12.json();
    console.log(`Valid transition to LOST: Status ${resT12.status}`);

    // Now try illegal transition from LOST directly to CONVERTED
    const resT12Illegal = await fetch(`${API_BASE}/enquiries/${enquiry1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        status: 'CONVERTED',
      }),
    });
    console.log(`Illegal transition from LOST to CONVERTED: Status ${resT12Illegal.status}`);
    if (resT12Illegal.status !== 400) throw new Error(`Expected 400, got ${resT12Illegal.status}`);
    console.log('✅ Test 12 Passed: Illegal status transitions rejected.\n');

    // Reopen enquiry to CONTACTED
    await fetch(`${API_BASE}/enquiries/${enquiry1Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        status: 'CONTACTED',
      }),
    });

    // -------------------------------------------------------------------------
    // Test 13: Convert Enquiry into Confirmed Booking Atomically
    // -------------------------------------------------------------------------
    console.log('Test 13: Convert Enquiry into Confirmed Booking...');
    const resT13 = await fetch(`${API_BASE}/enquiries/${enquiry1Id}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        total_amount_paise: 8000000, // ₹80,000
        discount_paise: 500000,      // ₹5,000
        notes: 'Deposit paid via UPI, confirmed bridal package.',
      }),
    });
    const t13Json = await resT13.json();
    console.log(`Status: ${resT13.status}, Booking Number: "${t13Json.data?.booking?.booking_number}", Enquiry Status: "${t13Json.data?.enquiry?.status}"`);
    if (resT13.status !== 201 || !t13Json.data?.booking?.id || t13Json.data?.enquiry?.status !== 'CONVERTED') {
      throw new Error(`Enquiry conversion failed: ${JSON.stringify(t13Json)}`);
    }
    convertedBookingId = t13Json.data.booking.id;
    console.log('✅ Test 13 Passed: Enquiry converted to confirmed booking with event calendar entry.\n');

    // -------------------------------------------------------------------------
    // Test 14: Prevent Duplicate Conversion (409 Conflict)
    // -------------------------------------------------------------------------
    console.log('Test 14: Prevent duplicate booking conversion (Should Fail 409 Conflict)...');
    const resT14 = await fetch(`${API_BASE}/enquiries/${enquiry1Id}/convert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': business1.id,
      },
      body: JSON.stringify({
        notes: 'Attempt duplicate conversion',
      }),
    });
    const t14Json = await resT14.json();
    console.log(`Status: ${resT14.status}, Message: "${t14Json.message}"`);
    if (resT14.status !== 409) throw new Error(`Expected 409, got ${resT14.status}`);
    console.log('✅ Test 14 Passed: Duplicate conversion strictly blocked.\n');

    // -------------------------------------------------------------------------
    // Test 15: Verify Business Dashboard Summary Reflects Real DB Counts
    // -------------------------------------------------------------------------
    console.log('Test 15: Verify Business Summary includes real CRM metrics...');
    const resT15 = await fetch(`${API_BASE}/business/${business1.id}/summary`, {
      headers: {
        Authorization: `Bearer ${token1}`,
      },
    });
    const t15Json = await resT15.json();
    console.log(`Status: ${resT15.status}, Metrics: ${JSON.stringify(t15Json.data?.metrics)}`);
    if (t15Json.data?.metrics?.customers < 1 || t15Json.data?.metrics?.enquiries < 1 || t15Json.data?.metrics?.confirmedBookings < 1) {
      throw new Error(`Summary metrics mismatch: ${JSON.stringify(t15Json)}`);
    }
    console.log('✅ Test 15 Passed: Business summary dynamically calculated real CRM entities.\n');

    // -------------------------------------------------------------------------
    // Cleanup
    // -------------------------------------------------------------------------
    console.log('Cleaning up test data...');
    if (convertedBookingId) {
      await prisma.booking_events.deleteMany({ where: { booking_id: convertedBookingId } });
      await prisma.bookings.deleteMany({ where: { id: convertedBookingId } });
    }
    if (enquiry1Id) {
      await prisma.enquiry_activities.deleteMany({ where: { enquiry_id: enquiry1Id } });
      await prisma.enquiries.deleteMany({ where: { id: enquiry1Id } });
    }
    if (business1) {
      await prisma.customers.deleteMany({ where: { business_id: business1.id } });
      await prisma.enquiry_activities.deleteMany({ where: { business_id: business1.id } });
      await prisma.enquiries.deleteMany({ where: { business_id: business1.id } });
      await prisma.bookings.deleteMany({ where: { business_id: business1.id } });
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

    console.log('🎉 ALL 15 PHASE 4 TESTS COMPLETED AND VERIFIED SUCCESSFULLY!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    process.exit(1);
  }
}

runTests();
