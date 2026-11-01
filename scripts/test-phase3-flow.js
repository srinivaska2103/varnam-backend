import 'dotenv/config';
import prisma from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/generate-token.js';

const BASE_URL = 'http://localhost:5000/api';

async function runPhase3Tests() {
  console.log('🧪 Starting Phase 3: Business Management & Subscription Entitlement Tests...\n');

  let testUser1, testUser2, token1, token2;
  let testBusiness1, testBusiness2;

  try {
    // 0. Setup Clean Test Users
    console.log('Setup: Preparing isolated test users...');
    const email1 = 'phase3_owner1@example.com';
    const email2 = 'phase3_owner2@example.com';

    // Clean any prior runs
    await prisma.business_members.deleteMany({
      where: { users: { email: { in: [email1, email2] } } },
    });
    await prisma.businesses.deleteMany({
      where: { business_email: { in: [email1, email2] } },
    });
    await prisma.users.deleteMany({
      where: { email: { in: [email1, email2] } },
    });

    testUser1 = await prisma.users.create({
      data: {
        name: 'Bridal Owner 1',
        email: email1,
        password_hash: 'hashed_pw_dummy',
        is_email_verified: true,
        is_active: true,
      },
    });

    testUser2 = await prisma.users.create({
      data: {
        name: 'Bridal Owner 2',
        email: email2,
        password_hash: 'hashed_pw_dummy',
        is_email_verified: true,
        is_active: true,
      },
    });

    token1 = generateAccessToken({ userId: testUser1.id, email: testUser1.email });
    token2 = generateAccessToken({ userId: testUser2.id, email: testUser2.email });

    console.log('✅ Setup Complete.\n');

    // TEST 1: Reject unauthenticated business creation
    console.log('Test 1: Reject unauthenticated business creation (Should Fail 401)...');
    const res1 = await fetch(`${BASE_URL}/business`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthenticated Studio' }),
    });
    const data1 = await res1.json();
    console.log(`Status: ${res1.status}, Message: "${data1.message}"`);
    if (res1.status !== 401) throw new Error('Test 1 Failed: Unauthenticated creation permitted!');
    console.log('✅ Test 1 Passed: Unauthenticated request rejected with 401.\n');

    // TEST 2: Create business as authenticated user 1
    console.log('Test 2: Create business as authenticated user 1 (POST /api/business)...');
    const res2 = await fetch(`${BASE_URL}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: 'Royal Bridal Studio',
        phone: '9876543210',
        email: email1,
        address: 'Madurai, Tamil Nadu',
        city: 'Madurai',
        state: 'Tamil Nadu',
      }),
    });
    const data2 = await res2.json();
    console.log(`Status: ${res2.status}, Success: ${data2.success}`);
    if (res2.status !== 201 || !data2.data?.business?.id) {
      throw new Error(`Test 2 Failed: ${JSON.stringify(data2)}`);
    }
    testBusiness1 = data2.data.business;
    console.log(`Created Business: "${testBusiness1.name}" (ID: ${testBusiness1.id}, Slug: ${testBusiness1.slug})`);
    console.log(`Plan Assigned: ${data2.data.subscription.planName} (${data2.data.subscription.status})`);
    if (data2.data.subscription.planCode !== 'BASIC_MONTHLY') {
      throw new Error('Test 2 Failed: Default plan should be BASIC_MONTHLY!');
    }
    console.log('✅ Test 2 Passed: Business and trial entitlement created.\n');

    // TEST 3: Prevent duplicate business ownership for same user
    console.log('Test 3: Prevent duplicate business ownership (Should Fail 409 Conflict)...');
    const res3 = await fetch(`${BASE_URL}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: 'Another Studio By Owner 1',
        phone: '9876543210',
        email: email1,
      }),
    });
    const data3 = await res3.json();
    console.log(`Status: ${res3.status}, Message: "${data3.message}"`);
    if (res3.status !== 409) throw new Error('Test 3 Failed: Allowed duplicate business ownership!');
    console.log('✅ Test 3 Passed: Rejected duplicate studio ownership with 409 Conflict.\n');

    // TEST 4: Retrieve authorized businesses (GET /api/business)
    console.log('Test 4: Retrieve authorized businesses for Owner 1...');
    const res4 = await fetch(`${BASE_URL}/business`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data4 = await res4.json();
    console.log(`Status: ${res4.status}, Businesses Count: ${data4.data.length}`);
    if (res4.status !== 200 || data4.data.length !== 1 || data4.data[0].id !== testBusiness1.id) {
      throw new Error('Test 4 Failed: Expected 1 authorized business');
    }
    console.log('✅ Test 4 Passed: Returned only authorized business.\n');

    // TEST 5: Create Business for Owner 2
    console.log('Test 5: Create Business for Owner 2...');
    const res5 = await fetch(`${BASE_URL}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: 'Luxe Glamour Studio',
        phone: '9845123456',
        email: email2,
        city: 'Chennai',
      }),
    });
    const data5 = await res5.json();
    testBusiness2 = data5.data.business;
    console.log(`Created Business 2: "${testBusiness2.name}" (ID: ${testBusiness2.id})`);
    console.log('✅ Test 5 Passed.\n');

    // TEST 6: Tenant Isolation: Owner 1 attempts to access Owner 2's business (Should Fail 403)
    console.log("Test 6: Tenant Isolation: Owner 1 attempts to access Owner 2's business (Should Fail 403)...");
    const res6 = await fetch(`${BASE_URL}/business/${testBusiness2.id}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data6 = await res6.json();
    console.log(`Status: ${res6.status}, Message: "${data6.message}"`);
    if (res6.status !== 403) throw new Error('Test 6 Failed: Tenant isolation breached! Cross-tenant access allowed.');
    console.log('✅ Test 6 Passed: Cross-tenant access strictly forbidden (403).\n');

    // TEST 7: Update Business Profile (PATCH /api/business/:businessId)
    console.log('Test 7: Update Business Profile by authorized Owner 1...');
    const res7 = await fetch(`${BASE_URL}/business/${testBusiness1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        city: 'Madurai West',
        address_line1: '123 Temple Road',
      }),
    });
    const data7 = await res7.json();
    console.log(`Status: ${res7.status}, Updated City: "${data7.data.city}"`);
    if (res7.status !== 200 || data7.data.city !== 'Madurai West') {
      throw new Error('Test 7 Failed: Update profile failed');
    }
    console.log('✅ Test 7 Passed: Authorized update succeeded.\n');

    // TEST 8: List Available Plans (GET /api/subscriptions/plans)
    console.log('Test 8: List Available Plans (Public Endpoint)...');
    const res8 = await fetch(`${BASE_URL}/subscriptions/plans`);
    const data8 = await res8.json();
    console.log(`Status: ${res8.status}, Plans: ${data8.data.map((p) => `${p.name} (₹${p.priceRupees})`).join(', ')}`);
    if (res8.status !== 200 || data8.data.length < 2) {
      throw new Error('Test 8 Failed: Plans catalog not returned');
    }
    console.log('✅ Test 8 Passed: Plans catalog listed correctly.\n');

    // TEST 9: Get Business Feature Entitlements for Basic Plan
    console.log("Test 9: Verify Feature Entitlements for Business 1 (Basic Plan)...");
    const res9 = await fetch(`${BASE_URL}/subscriptions/${testBusiness1.id}/features`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data9 = await res9.json();
    console.log(`Status: ${res9.status}, Plan: ${data9.data.planName}`);
    console.log(`BRANDED_WEBSITE: ${data9.data.features.BRANDED_WEBSITE}`);
    console.log(`BOOKING_MANAGEMENT: ${data9.data.features.BOOKING_MANAGEMENT}`);
    if (data9.data.features.BRANDED_WEBSITE !== false || data9.data.features.BOOKING_MANAGEMENT !== true) {
      throw new Error('Test 9 Failed: Basic Plan feature entitlements incorrect!');
    }
    console.log('✅ Test 9 Passed: Core features enabled, Exclusive features disabled for Basic plan.\n');

    // TEST 10: Upgrade Business 2 to Exclusive Plan via Database/Admin and Verify Entitlements
    console.log('Test 10: Upgrade Business 2 to EXCLUSIVE_LIFETIME and Verify Entitlements...');
    const exclusivePlan = await prisma.plans.findUnique({
      where: { code: 'EXCLUSIVE_LIFETIME' },
    });

    await prisma.business_entitlements.update({
      where: { business_id: testBusiness2.id },
      data: {
        plan_id: exclusivePlan.id,
        status: 'ACTIVE',
        ends_at: null, // Lifetime
        notes: 'Upgraded to Exclusive Lifetime package',
      },
    });

    const res10 = await fetch(`${BASE_URL}/subscriptions/${testBusiness2.id}/features`, {
      headers: { Authorization: `Bearer ${token2}` },
    });
    const data10 = await res10.json();
    console.log(`Status: ${res10.status}, Plan: ${data10.data.planName}`);
    console.log(`BRANDED_WEBSITE: ${data10.data.features.BRANDED_WEBSITE}`);
    console.log(`PORTFOLIO_SHOWCASE: ${data10.data.features.PORTFOLIO_SHOWCASE}`);
    if (data10.data.features.BRANDED_WEBSITE !== true || data10.data.features.PORTFOLIO_SHOWCASE !== true) {
      throw new Error('Test 10 Failed: Exclusive Plan should have BRANDED_WEBSITE and PORTFOLIO enabled!');
    }
    console.log('✅ Test 10 Passed: Exclusive plan features unlocked.\n');

    // TEST 11: Business Summary Metrics (GET /api/business/:businessId/summary)
    console.log('Test 11: Business Summary Endpoint...');
    const res11 = await fetch(`${BASE_URL}/business/${testBusiness1.id}/summary`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data11 = await res11.json();
    console.log(`Status: ${res11.status}, Metrics:`, JSON.stringify(data11.data.metrics));
    if (res11.status !== 200 || typeof data11.data.metrics.customers !== 'number') {
      throw new Error('Test 11 Failed: Summary endpoint failed');
    }
    console.log('✅ Test 11 Passed: Summary with real database counts returned.\n');

    // Clean up test records
    console.log('Cleaning up test data...');
    await prisma.business_members.deleteMany({
      where: { users: { email: { in: [email1, email2] } } },
    });
    await prisma.businesses.deleteMany({
      where: { id: { in: [testBusiness1.id, testBusiness2.id] } },
    });
    await prisma.users.deleteMany({
      where: { email: { in: [email1, email2] } },
    });

    console.log('🎉 ALL 11 PHASE 3 TESTS COMPLETED AND VERIFIED SUCCESSFULLY!');
  } catch (error) {
    console.error('❌ Phase 3 test failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase3Tests();
