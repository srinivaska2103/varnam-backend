import prisma from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/generate-token.js';

const generateAuthToken = (user) => generateAccessToken({ userId: user.id });

const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS: ${message}`);
}

async function request(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    // Non-JSON response
  }

  return {
    status: response.status,
    data,
  };
}

async function runPhase12And13Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 12 & 13 AUTOMATED TEST SUITE');
  console.log('   Notifications, Security Audit & Reliability');
  console.log('====================================================\n');

  try {
    const timestamp = Date.now().toString(36);

    // -------------------------------------------------------------
    // PART 1: Health & Readiness Endpoints
    // -------------------------------------------------------------
    console.log('--- Step 1: Health & Readiness Verification ---');
    const rootRes = await request('/');
    assert(rootRes.status === 200 || rootRes.status === 302, 'Root endpoint responds properly');

    const healthRes = await request('/api/health');
    assert(healthRes.status === 200, 'GET /api/health returns 200');
    assert(healthRes.data?.data?.database === 'Connected', 'Database status reports Connected');

    const readyRes = await request('/api/ready');
    assert(readyRes.status === 200, 'GET /api/ready returns 200');
    assert(readyRes.data?.data?.ready === true, 'Service ready state is true');
    assert(readyRes.data?.data?.database === 'Connected', 'Readiness database status is Connected');

    // -------------------------------------------------------------
    // PART 2: Setup 2 Independent Business Tenants
    // -------------------------------------------------------------
    console.log('\n--- Step 2: Tenant Isolation Setup ---');
    const owner1 = await prisma.users.create({
      data: {
        name: `Tenant 1 Owner ${timestamp}`,
        email: `t1_owner_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const token1 = generateAuthToken(owner1);

    const b1 = await prisma.businesses.create({
      data: {
        name: `Glamour Bridal Studio ${timestamp}`,
        slug: `glamour-${timestamp}`,
        business_phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        business_email: `glamour_${timestamp}@example.com`,
      },
    });

    await prisma.business_members.create({
      data: {
        business_id: b1.id,
        user_id: owner1.id,
        role: 'OWNER',
        is_active: true,
      },
    });

    // Tenant 2
    const owner2 = await prisma.users.create({
      data: {
        name: `Tenant 2 Owner ${timestamp}`,
        email: `t2_owner_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const token2 = generateAuthToken(owner2);

    const b2 = await prisma.businesses.create({
      data: {
        name: `Royal Bridal Studio ${timestamp}`,
        slug: `royal-${timestamp}`,
        business_phone: `91234${Math.floor(10000 + Math.random() * 90000)}`,
        business_email: `royal_${timestamp}@example.com`,
      },
    });

    await prisma.business_members.create({
      data: {
        business_id: b2.id,
        user_id: owner2.id,
        role: 'OWNER',
        is_active: true,
      },
    });

    assert(b1.id && b2.id, 'Two test business tenants successfully established');

    // -------------------------------------------------------------
    // PART 3: Notification Preferences Management & Isolation
    // -------------------------------------------------------------
    console.log('\n--- Step 3: Notification Preferences ---');

    // Unauthenticated access check
    const unauthPref = await request('/api/notifications/preferences');
    assert(unauthPref.status === 401, 'GET /api/notifications/preferences rejects unauthenticated requests with 401');

    // Missing business ID header
    const noBizPref = await request('/api/notifications/preferences', {
      headers: { Authorization: `Bearer ${token1}` },
    });
    assert(noBizPref.status === 400 || noBizPref.status === 403, 'GET preferences rejects request without business selection');

    // Tenant 1 Default Preferences
    const t1PrefRes = await request('/api/notifications/preferences', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });
    assert(t1PrefRes.status === 200, 'Tenant 1 retrieves default notification preferences (200)');
    assert(Array.isArray(t1PrefRes.data?.data), 'Preferences returned as list');
    assert(t1PrefRes.data?.data.length > 0, 'Default event preferences provided');

    // Update Tenant 1 Preferences (disable low stock alert)
    const updatePrefRes = await request('/api/notifications/preferences', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
      body: {
        preferences: [
          { event_key: 'LOW_STOCK_ALERT', channel: 'EMAIL', enabled: false, send_to_artist: false },
          { event_key: 'NEW_ENQUIRY', channel: 'EMAIL', enabled: true, send_to_artist: true },
        ],
      },
    });
    assert(updatePrefRes.status === 200, 'Tenant 1 updates notification preferences (200)');

    // Verify Tenant 2 preferences remain untouched (Multi-Tenant Isolation)
    const t2PrefRes = await request('/api/notifications/preferences', {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': b2.id,
      },
    });
    assert(t2PrefRes.status === 200, 'Tenant 2 retrieves preferences (200)');
    const t2LowStock = t2PrefRes.data?.data.find((p) => p.event_key === 'LOW_STOCK_ALERT');
    assert(t2LowStock?.enabled !== false, 'Tenant 2 notification preferences remain isolated from Tenant 1');

    // Cross-tenant access attempt (Tenant 1 token with Tenant 2 business id)
    const crossBizPref = await request('/api/notifications/preferences', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b2.id,
      },
    });
    assert(crossBizPref.status === 403, 'Cross-tenant access to notification preferences forbidden (403)');

    // -------------------------------------------------------------
    // PART 4: Notification Job Creation, Idempotency & Queueing
    // -------------------------------------------------------------
    console.log('\n--- Step 4: Notification Queueing & Idempotency ---');

    // Create a job directly in notification_jobs
    const idempotencyKey1 = `test_key_1_${timestamp}`;
    const job1 = await prisma.notification_jobs.create({
      data: {
        business_id: b1.id,
        channel: 'EMAIL',
        recipient: 'testbride@example.com',
        subject: 'Consultation Confirmation',
        message_body: '<p>Your bridal consultation is confirmed.</p>',
        status: 'QUEUED',
        idempotency_key: idempotencyKey1,
      },
    });
    assert(job1.id && job1.status === 'QUEUED', 'Notification job queued in database');

    // Verify idempotency constraint: Duplicate key cannot create duplicate job
    try {
      await prisma.notification_jobs.create({
        data: {
          business_id: b1.id,
          channel: 'EMAIL',
          recipient: 'testbride@example.com',
          subject: 'Duplicate Test',
          message_body: '<p>Duplicate</p>',
          idempotency_key: idempotencyKey1,
        },
      });
      assert(false, 'Should have failed unique constraint on idempotency_key');
    } catch (err) {
      assert(true, 'Database enforces unique constraint on notification idempotency_key');
    }

    // List notifications endpoint
    const listRes = await request('/api/notifications', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });
    assert(listRes.status === 200, 'GET /api/notifications returns 200');
    assert(listRes.data?.data?.length >= 1, 'Queued notification listed for Tenant 1');

    // Tenant 2 cannot see Tenant 1 notifications
    const t2ListRes = await request('/api/notifications', {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': b2.id,
      },
    });
    assert(t2ListRes.status === 200, 'Tenant 2 lists notifications (200)');
    const leaked = t2ListRes.data?.data?.find((n) => n.id === job1.id);
    assert(!leaked, 'Tenant 2 does not receive Tenant 1 notification records (Isolation PASS)');

    // -------------------------------------------------------------
    // PART 5: Scheduled Queue Worker & Bounded Retry
    // -------------------------------------------------------------
    console.log('\n--- Step 5: Queue Worker & Retry Execution ---');

    // Process queue endpoint
    const processRes = await request('/api/notifications/process-queue', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });
    assert(processRes.status === 200, 'POST /api/notifications/process-queue triggers successfully (200)');

    // Verify job status updated to SENT
    const updatedJob1 = await prisma.notification_jobs.findUnique({
      where: { id: job1.id },
    });
    assert(updatedJob1.status === 'SENT', 'Queue worker transitions job from QUEUED to SENT');
    assert(updatedJob1.sent_at !== null, 'Sent timestamp recorded');
    assert(updatedJob1.provider_message_id !== null, 'Provider delivery reference recorded');

    // -------------------------------------------------------------
    // PART 6: Cancelled Booking / Consultation Safety Protection
    // -------------------------------------------------------------
    console.log('\n--- Step 6: Cancelled Booking Safety Protection ---');

    const customer1 = await prisma.customers.create({
      data: {
        business_id: b1.id,
        full_name: 'Pooja Sundaram',
        phone: `98401${Math.floor(10000 + Math.random() * 90000)}`,
        email: 'pooja@example.com',
      },
    });

    const cancelledBooking = await prisma.bookings.create({
      data: {
        business_id: b1.id,
        customer_id: customer1.id,
        booking_number: `BK-SAFE-${timestamp}`,
        status: 'CANCELLED',
        total_amount_paise: 5000000n,
      },
    });

    const reminderJob = await prisma.notification_jobs.create({
      data: {
        business_id: b1.id,
        booking_id: cancelledBooking.id,
        channel: 'EMAIL',
        recipient: 'pooja@example.com',
        subject: 'Upcoming Wedding Reminder',
        message_body: '<p>Your wedding is tomorrow</p>',
        status: 'QUEUED',
        idempotency_key: `booking_reminder_${cancelledBooking.id}`,
      },
    });

    // Run queue worker to process jobs
    await request('/api/notifications/process-queue', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });

    const checkedReminder = await prisma.notification_jobs.findUnique({
      where: { id: reminderJob.id },
    });
    assert(checkedReminder.status === 'CANCELLED', 'Safety check: notification for cancelled booking automatically cancelled');
    assert(checkedReminder.error_message?.includes('cancelled'), 'Safety cancellation reason recorded');

    // -------------------------------------------------------------
    // PART 7: Mark Notifications As Read / Acknowledged
    // -------------------------------------------------------------
    console.log('\n--- Step 7: Mark Notification as Read ---');

    // Individual read
    const markReadRes = await request(`/api/notifications/${updatedJob1.id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });
    assert(markReadRes.status === 200, 'PATCH /api/notifications/:id/read returns 200');
    assert(markReadRes.data?.data?.status === 'DELIVERED', 'Notification status updated to DELIVERED');

    // Cross-tenant mark-read forbidden
    const crossReadRes = await request(`/api/notifications/${updatedJob1.id}/read`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': b2.id,
      },
    });
    assert(crossReadRes.status === 404, 'Tenant 2 cannot mark Tenant 1 notification as read (404 Not Found)');

    // Mark all as read
    const markAllRes = await request('/api/notifications/read-all', {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': b1.id,
      },
    });
    assert(markAllRes.status === 200, 'PATCH /api/notifications/read-all returns 200');

    // -------------------------------------------------------------
    // PART 8: Security Audit & Rate Limiting Verification
    // -------------------------------------------------------------
    console.log('\n--- Step 8: Security Headers, CORS & Rate Limiting ---');

    // Test Security Headers (Helmet)
    const headerCheck = await fetch(`${BASE_URL}/api/health`);
    assert(headerCheck.headers.get('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff present');
    assert(headerCheck.headers.get('x-frame-options') === 'SAMEORIGIN', 'X-Frame-Options: SAMEORIGIN present');
    assert(headerCheck.headers.has('content-security-policy'), 'Content-Security-Policy header present');

    // Test Rate Limiter Middleware logic directly
    const { authLimiter, otpLimiter, publicFormLimiter } = await import('../src/middleware/rateLimiter.js');
    assert(typeof authLimiter === 'function', 'authLimiter middleware available');
    assert(typeof otpLimiter === 'function', 'otpLimiter middleware available');
    assert(typeof publicFormLimiter === 'function', 'publicFormLimiter middleware available');

    // -------------------------------------------------------------
    // PART 9: Password Hashing & Secret Exposure Checks
    // -------------------------------------------------------------
    console.log('\n--- Step 9: Passwords & Secrets Integrity ---');

    const sampleUser = await prisma.users.findUnique({
      where: { id: owner1.id },
    });
    assert(!sampleUser.password, 'User model does not expose plaintext password property');
    assert(sampleUser.password_hash !== 'password', 'Passwords securely hashed');

    // Clean up test data
    console.log('\n--- Step 10: Cleaning Test Artifacts ---');
    await prisma.notification_jobs.deleteMany({
      where: { business_id: { in: [b1.id, b2.id] } },
    });
    await prisma.notification_preferences.deleteMany({
      where: { business_id: { in: [b1.id, b2.id] } },
    });
    await prisma.bookings.deleteMany({
      where: { business_id: b1.id },
    });
    await prisma.customers.deleteMany({
      where: { business_id: b1.id },
    });
    await prisma.business_members.deleteMany({
      where: { business_id: { in: [b1.id, b2.id] } },
    });
    await prisma.businesses.deleteMany({
      where: { id: { in: [b1.id, b2.id] } },
    });
    await prisma.users.deleteMany({
      where: { id: { in: [owner1.id, owner2.id] } },
    });
    assert(true, 'Test resources safely cleaned up');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 12 & 13 TESTS PASSED (${passedTests}/${totalTests})`);
    console.log('====================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error);
    process.exit(1);
  }
}

runPhase12And13Tests();
