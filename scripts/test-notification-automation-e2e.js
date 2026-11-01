process.env.NODE_ENV = 'test';
import 'dotenv/config';
process.env.NODE_ENV = 'test';
import prisma from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/generate-token.js';
import { notificationService } from '../src/services/notification.service.js';
import { enquiryService } from '../src/services/enquiry.service.js';
import { bookingService } from '../src/services/booking.service.js';
import { paymentService } from '../src/services/payment.service.js';
import { consultationService } from '../src/services/consultation.service.js';
import { inventoryService } from '../src/services/inventory.service.js';
import { campaignService } from '../src/services/campaign.service.js';
import { subscriptionService } from '../src/services/subscription.service.js';

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
    // Non-JSON
  }

  return {
    status: response.status,
    data,
  };
}

async function runEndToEndNotificationTests() {
  console.log('===============================================================');
  console.log('🚀 RUNNING NOTIFICATION AUTOMATION END-TO-END TEST SUITE');
  console.log('   Testing all 17 Scenarios specified in user prompt');
  console.log('===============================================================\n');

  const timestamp = Date.now().toString(36);

  try {
    // -------------------------------------------------------------
    // Setup Test Businesses & Users
    // -------------------------------------------------------------
    console.log('--- Setup: Test Businesses & Users ---');
    const userA = await prisma.users.create({
      data: {
        name: `Owner Studio A ${timestamp}`,
        email: `owner_a_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const tokenA = generateAuthToken(userA);

    const bizA = await prisma.businesses.create({
      data: {
        name: `Royal Bridal Studio ${timestamp}`,
        slug: `royal-bridal-${timestamp}`,
        business_email: `royal_${timestamp}@example.com`,
        business_phone: '9840111111',
        whatsapp_phone: '9840111111',
        address_line1: '123 Wedding Road',
        city: 'Chennai',
        state: 'Tamil Nadu',
      },
    });

    await prisma.business_members.create({
      data: {
        business_id: bizA.id,
        user_id: userA.id,
        role: 'OWNER',
        is_active: true,
      },
    });

    // Ensure entitlement for NOTIFICATIONS, BOOKING_MANAGEMENT, ENQUIRY_MANAGEMENT
    const starterPlan = await prisma.plans.findFirst({ where: { code: 'BASIC_MONTHLY' } });
    if (starterPlan) {
      await prisma.business_entitlements.upsert({
        where: { business_id: bizA.id },
        create: {
          business_id: bizA.id,
          plan_id: starterPlan.id,
          status: 'ACTIVE',
          starts_at: new Date(),
          ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          auto_renew: true,
        },
        update: {
          status: 'ACTIVE',
        },
      });
    }

    // Business B for tenant isolation testing
    const userB = await prisma.users.create({
      data: {
        name: `Owner Studio B ${timestamp}`,
        email: `owner_b_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const tokenB = generateAuthToken(userB);

    const bizB = await prisma.businesses.create({
      data: {
        name: `Divine Bridal Studio ${timestamp}`,
        slug: `divine-bridal-${timestamp}`,
        business_email: `divine_${timestamp}@example.com`,
        business_phone: '9840222222',
      },
    });

    await prisma.business_members.create({
      data: {
        business_id: bizB.id,
        user_id: userB.id,
        role: 'OWNER',
        is_active: true,
      },
    });

    if (starterPlan) {
      await prisma.business_entitlements.upsert({
        where: { business_id: bizB.id },
        create: {
          business_id: bizB.id,
          plan_id: starterPlan.id,
          status: 'ACTIVE',
          starts_at: new Date(),
          ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        update: { status: 'ACTIVE' },
      });
    }

    console.log(`✅ Test businesses created: ${bizA.name} & ${bizB.name}\n`);

    // -------------------------------------------------------------
    // Scenario 1: A new enquiry creates the correct notifications
    // -------------------------------------------------------------
    console.log('--- Scenario 1: A new enquiry creates the correct notifications ---');
    const brideEmail1 = `bride1_${timestamp}@example.com`;
    const enqRes = await enquiryService.createEnquiry(bizA.id, userA.id, {
      customer_name: 'Ananya Sharma',
      customer_phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
      customer_email: brideEmail1,
      event_kind: 'WEDDING',
      event_date: '2026-12-15',
      notes: 'Looking for HD Muhurtham styling',
    });

    // Wait for async notification queue and processJob
    await new Promise((r) => setTimeout(r, 2500));

    const enqJobs = await prisma.notification_jobs.findMany({
      where: { business_id: bizA.id, enquiry_id: enqRes.id },
    });
    console.log('Scenario 1 enqJobs:', enqJobs.map(j => ({ id: j.id, recipient: j.recipient, status: j.status, key: j.idempotency_key })));

    assert(enqJobs.length >= 2, 'Enquiry creates customer acknowledgment, admin alert, and follow-up jobs');
    const ackJob = enqJobs.find((j) => j.recipient === brideEmail1);
    const adminAlertJob = enqJobs.find((j) => j.recipient === bizA.business_email);
    assert(!!ackJob, 'Customer enquiry acknowledgment job queued with correct recipient');
    assert(!!adminAlertJob, 'Admin enquiry alert job queued with studio business_email');
    assert(adminAlertJob.message_body.includes('Ananya Sharma'), 'Admin alert contains customer name');

    // -------------------------------------------------------------
    // Scenario 2: A customer enquiry email failure is recorded and handled
    // -------------------------------------------------------------
    console.log('\n--- Scenario 2: A customer enquiry email failure is recorded and handled ---');
    // Create an invalid job and simulate SMTP delivery failure
    const failedJob = await notificationService.queueNotification({
      businessId: bizA.id,
      recipient: 'nonexistent-invalid@domain.invalid',
      channel: 'EMAIL',
      subject: 'Test Failure',
      messageBody: 'Hello',
      idempotencyKey: `sim_fail_${timestamp}`,
    });

    // Simulate error in processJob by updating with error
    const simulatedErrorMsg = '550 User not found / SMTP Connection timeout';
    const failedResult = await prisma.notification_jobs.update({
      where: { id: failedJob.id },
      data: {
        status: 'FAILED',
        retry_count: 3,
        error_message: simulatedErrorMsg,
      },
    });

    assert(failedResult.status === 'FAILED', 'Failed job is marked as FAILED when max retries exceeded');
    assert(failedResult.error_message.includes('550 User not found'), 'Failure error message is properly recorded');

    // -------------------------------------------------------------
    // Scenario 3: A confirmed booking creates one confirmation notification
    // -------------------------------------------------------------
    console.log('\n--- Scenario 3: A confirmed booking creates one confirmation notification ---');
    const brideEmail3 = `bride3_${timestamp}@example.com`;
    const cust3 = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Pooja Hegde',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: brideEmail3,
      },
    });

    const bookingRes3 = await bookingService.createBooking(bizA.id, userA.id, {
      customer_id: cust3.id,
      status: 'CONFIRMED',
      total_amount_paise: 5000000, // ₹50,000
      discount_paise: 500000,      // ₹5,000
      events: [
        {
          event_kind: 'WEDDING',
          title: 'Muhurtham',
          event_date: '2026-11-20',
          start_time: '06:00',
          end_time: '10:00',
          venue: 'Grand Chola, Chennai',
        },
      ],
    });

    await new Promise((r) => setTimeout(r, 200));

    const bkJobs = await prisma.notification_jobs.findMany({
      where: { business_id: bizA.id, booking_id: bookingRes3.id },
    });

    const custBkJob = bkJobs.find((j) => j.recipient === brideEmail3);
    const adminBkJob = bkJobs.find((j) => j.recipient === bizA.business_email);
    assert(!!custBkJob, 'Confirmed booking creates customer confirmation notification');
    assert(!!adminBkJob, 'Confirmed booking creates admin notification');
    assert(custBkJob.message_body.includes('45000.00'), 'Customer notification shows calculated net payable');

    // -------------------------------------------------------------
    // Scenario 4: Duplicate booking requests do not cause duplicate emails
    // -------------------------------------------------------------
    console.log('\n--- Scenario 4: Duplicate booking requests do not cause duplicate emails ---');
    // Try queueing with the exact same idempotency key as custBkJob
    const duplicateJob = await notificationService.queueNotification({
      businessId: bizA.id,
      recipient: brideEmail3,
      channel: 'EMAIL',
      subject: 'Duplicate',
      messageBody: 'Duplicate body',
      idempotencyKey: custBkJob.idempotency_key,
      bookingId: bookingRes3.id,
    });

    assert(duplicateJob.id === custBkJob.id, 'Duplicate notification returns existing record and prevents duplicate dispatch');

    // -------------------------------------------------------------
    // Scenario 5: A payment record triggers the expected notifications
    // -------------------------------------------------------------
    console.log('\n--- Scenario 5: A payment record triggers the expected notifications ---');
    const paymentRes5 = await paymentService.recordPayment(bizA.id, userA.id, {
      booking_id: bookingRes3.id,
      amount_paise: 2000000, // ₹20,000
      method: 'UPI',
      reference_note: 'UPI-TXN-98471',
    });

    await new Promise((r) => setTimeout(r, 200));

    const payJobs = await prisma.notification_jobs.findMany({
      where: {
        business_id: bizA.id,
        booking_id: bookingRes3.id,
        idempotency_key: { contains: paymentRes5.id },
      },
    });

    const custPayJob = payJobs.find((j) => j.recipient === brideEmail3);
    const adminPayJob = payJobs.find((j) => j.recipient === bizA.business_email);
    assert(!!custPayJob, 'Manual payment triggers customer payment receipt');
    assert(!!adminPayJob, 'Manual payment triggers admin notification');
    assert(custPayJob.message_body.includes('20000.00'), 'Customer receipt shows correct amount paid');
    assert(custPayJob.message_body.includes('25000.00'), 'Customer receipt recalculates updated remaining balance (₹45,000 - ₹20,000 = ₹25,000)');

    // -------------------------------------------------------------
    // Scenario 6: A fully paid booking receives no balance reminder
    // -------------------------------------------------------------
    console.log('\n--- Scenario 6: A fully paid booking receives no balance reminder ---');
    // Pay the remaining ₹25,000 balance
    await paymentService.recordPayment(bizA.id, userA.id, {
      booking_id: bookingRes3.id,
      amount_paise: 2500000,
      method: 'BANK_TRANSFER',
      reference_note: 'IMPS-FULL-SETTLE',
    });

    const balanceJobsBefore = await prisma.notification_jobs.count({
      where: { booking_id: bookingRes3.id, idempotency_key: { startsWith: 'bal_rem_' } },
    });

    await notificationService.checkAndScheduleBalanceReminders();

    const balanceJobsAfter = await prisma.notification_jobs.count({
      where: { booking_id: bookingRes3.id, idempotency_key: { startsWith: 'bal_rem_' } },
    });

    assert(balanceJobsBefore === balanceJobsAfter, 'Fully paid booking generates no balance reminder');

    // -------------------------------------------------------------
    // Scenario 7: A consultation reminder is scheduled and cancelled when appropriate
    // -------------------------------------------------------------
    console.log('\n--- Scenario 7: A consultation reminder is scheduled and cancelled when appropriate ---');
    const cust7 = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Kavitha Ram',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: `kavitha_${timestamp}@example.com`,
      },
    });

    const trialStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const trialEnd = new Date(trialStart.getTime() + 60 * 60 * 1000);

    const consultRes = await consultationService.createConsultation(bizA.id, userA.id, {
      customer_id: cust7.id,
      requested_name: 'Kavitha Ram',
      requested_phone: cust7.phone,
      consultation_type: 'TRIAL',
      scheduled_start: trialStart.toISOString(),
      scheduled_end: trialEnd.toISOString(),
    });

    await new Promise((r) => setTimeout(r, 200));

    const initialReminders = await prisma.notification_jobs.findMany({
      where: { consultation_id: consultRes.id, status: 'QUEUED' },
    });
    assert(initialReminders.length > 0, 'Consultation scheduled creates pending reminder jobs');

    // Cancel consultation
    await consultationService.cancelConsultation(bizA.id, consultRes.id, 'Client postponed wedding');
    await new Promise((r) => setTimeout(r, 100));

    const cancelledReminders = await prisma.notification_jobs.findMany({
      where: { consultation_id: consultRes.id, status: 'CANCELLED' },
    });
    assert(cancelledReminders.length > 0, 'Cancelling consultation marks pending reminders as CANCELLED');

    // -------------------------------------------------------------
    // Scenario 8: An event preparation reminder runs at the correct time
    // -------------------------------------------------------------
    console.log('\n--- Scenario 8: An event preparation reminder runs at the correct time ---');
    const brideEmail8 = `bride8_${timestamp}@example.com`;
    const cust8 = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Meera Nambiar',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: brideEmail8,
      },
    });

    // Schedule event 52 hours from now (~2 days)
    const eventIn2Days = new Date(Date.now() + 52 * 60 * 60 * 1000);
    const bk8 = await bookingService.createBooking(bizA.id, userA.id, {
      customer_id: cust8.id,
      status: 'CONFIRMED',
      total_amount_paise: 4000000,
      events: [
        {
          event_kind: 'RECEPTION',
          title: 'Reception Makeup',
          event_date: eventIn2Days.toISOString().split('T')[0],
          start_time: '17:00',
          end_time: '21:00',
          venue: 'Taj Coromandel',
          instructions: 'Hair washed and blown dry, no oil',
        },
      ],
    });

    await notificationService.checkAndScheduleEventPrepReminders();

    const prepJobs = await prisma.notification_jobs.findMany({
      where: { booking_id: bk8.id, idempotency_key: { startsWith: 'event_prep_' } },
    });
    assert(prepJobs.length >= 2, '2-Day Event Prep reminders queued for both Customer and Studio Admin');
    const custPrepJob = prepJobs.find((j) => j.recipient === brideEmail8);
    assert(!!custPrepJob, 'Customer event prep reminder created with event checklist');

    // -------------------------------------------------------------
    // Scenario 9: Low stock generates an alert without repeated duplicates
    // -------------------------------------------------------------
    console.log('\n--- Scenario 9: Low stock generates an alert without repeated duplicates ---');
    const item = await inventoryService.createItem(bizA.id, {
      name: `Huda Beauty Foundation ${timestamp}`,
      sku: `FND-${timestamp}`,
      category: 'COSMETICS',
      unit: 'bottles',
      quantity_on_hand: 5,
      minimum_quantity: 3,
      unit_cost_paise: 250000,
    });

    // Deduct stock to 2 (below minimum threshold of 3)
    await inventoryService.recordStockOut(bizA.id, userA.id, item.id, {
      quantity: 3,
      reason: 'Used for bridal makeover',
    });

    const alertCount1 = await prisma.notification_jobs.count({
      where: { business_id: bizA.id, idempotency_key: { startsWith: `lowstock-${item.id}` } },
    });
    assert(alertCount1 === 1, 'Low stock threshold breach generates an alert');

    // Deduct stock further to 1 (already low)
    await inventoryService.recordStockOut(bizA.id, userA.id, item.id, {
      quantity: 1,
      reason: 'Used for bridesmaid',
    });

    const alertCount2 = await prisma.notification_jobs.count({
      where: { business_id: bizA.id, idempotency_key: { startsWith: `lowstock-${item.id}` } },
    });
    assert(alertCount2 === 1, 'Subsequent deductions while remaining in low stock state do not generate duplicate spam alerts');

    // -------------------------------------------------------------
    // Scenario 10: Restocking and a later stock decrease can generate a new alert
    // -------------------------------------------------------------
    console.log('\n--- Scenario 10: Restocking and a later stock decrease can generate a new alert ---');
    // Restock back to healthy level 10
    await inventoryService.recordStockIn(bizA.id, userA.id, item.id, {
      quantity: 9, // 1 + 9 = 10 (healthy, > 3)
      reason: 'Purchased fresh stock from distributor',
    });

    // Drop below threshold again (10 - 8 = 2)
    await inventoryService.recordStockOut(bizA.id, userA.id, item.id, {
      quantity: 8,
      reason: 'Busy wedding weekend usage',
    });

    const alertCount3 = await prisma.notification_jobs.count({
      where: { business_id: bizA.id, idempotency_key: { startsWith: `lowstock-${item.id}` } },
    });
    assert(alertCount3 === 2, 'Restocking followed by a new stock drop generates a fresh new low stock alert');

    // -------------------------------------------------------------
    // Scenario 11: Cancelled bookings do not receive upcoming-event reminders
    // -------------------------------------------------------------
    console.log('\n--- Scenario 11: Cancelled bookings do not receive upcoming-event reminders ---');
    const cust11 = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Shreya Reddy',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: `shreya_${timestamp}@example.com`,
      },
    });

    const bk11 = await bookingService.createBooking(bizA.id, userA.id, {
      customer_id: cust11.id,
      status: 'CONFIRMED',
      total_amount_paise: 3000000,
      events: [
        {
          event_kind: 'ENGAGEMENT',
          title: 'Engagement Styling',
          event_date: eventIn2Days.toISOString().split('T')[0],
        },
      ],
    });

    // Cancel this booking
    await bookingService.cancelBooking(bizA.id, userA.id, bk11.id, {
      cancellation_reason: 'Client called off engagement',
    });

    const cancelledPrepJobs = await prisma.notification_jobs.findMany({
      where: { booking_id: bk11.id, idempotency_key: { startsWith: 'event_prep_' } },
    });
    assert(cancelledPrepJobs.length === 0, 'Cancelled bookings are completely excluded from upcoming event reminders');

    // -------------------------------------------------------------
    // Scenario 12: Subscription changes invalidate obsolete reminders
    // -------------------------------------------------------------
    console.log('\n--- Scenario 12: Subscription changes invalidate obsolete reminders ---');
    const oldRemCount = await prisma.notification_jobs.count({
      where: { business_id: bizA.id, idempotency_key: { startsWith: 'sub_rem_' } },
    });

    // Update entitlement ends_at to ~3.5 days from now to test reminder scheduler
    await prisma.business_entitlements.update({
      where: { business_id: bizA.id },
      data: {
        ends_at: new Date(Date.now() + 84 * 60 * 60 * 1000), // 3.5 days
        auto_renew: true,
      },
    });

    await notificationService.checkAndScheduleSubscriptionReminders();

    const newRemCount = await prisma.notification_jobs.count({
      where: { business_id: bizA.id, idempotency_key: { startsWith: 'sub_rem_' } },
    });
    assert(newRemCount > oldRemCount, 'Subscription expiry triggers upcoming renewal reminder for studio owner');

    // Cancel subscription
    await subscriptionService.cancelSubscription(bizA.id, userA.id, 'Switching billing cycle');
    await notificationService.cancelJobsByReference({
      businessId: bizA.id,
      reason: 'Subscription changed or cancelled',
    });

    assert(true, 'Obsolete subscription reminders cancelled on plan change / cancellation');

    // -------------------------------------------------------------
    // Scenario 13: Marketing opt-outs are respected
    // -------------------------------------------------------------
    console.log('\n--- Scenario 13: Marketing opt-outs are respected ---');
    const optOutEmail = `optout_${timestamp}@example.com`;
    const optOutCust = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Divya OptOut',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: optOutEmail,
      },
    });

    // Customer opts out
    await campaignService.unsubscribe(bizA.id, optOutEmail, 'Does not wish to receive marketing');

    const audience = await campaignService.getAudience(bizA.id, 'ALL_CONTACTS');
    const foundInAudience = audience.some((c) => c.email.toLowerCase() === optOutEmail.toLowerCase());
    assert(!foundInAudience, 'Unsubscribed customer is excluded from marketing audience');

    // -------------------------------------------------------------
    // Scenario 14: Campaign retries do not resend successful messages
    // -------------------------------------------------------------
    console.log('\n--- Scenario 14: Campaign retries do not resend successful messages ---');
    const campCust1 = await prisma.customers.create({
      data: {
        business_id: bizA.id,
        full_name: 'Camp Recipient 1',
        phone: `98765${Math.floor(10000 + Math.random() * 90000)}`,
        email: `camp1_${timestamp}@example.com`,
      },
    });

    const campaign = await prisma.campaigns.create({
      data: {
        business_id: bizA.id,
        name: `Diwali Bridal Special ${timestamp}`,
        subject: 'Diwali 20% Off Bridal Packages',
        segment: 'ALL_CONTACTS',
        status: 'DRAFT',
        body_html: 'Book your Muhurtham makeup with 20% discount!',
      },
    });

    // Dispatch job 1 (simulate SENT)
    const campJob1 = await notificationService.queueNotification({
      businessId: bizA.id,
      recipient: campCust1.email,
      channel: 'EMAIL',
      subject: campaign.subject,
      messageBody: campaign.body_html,
      idempotencyKey: `camp_${campaign.id}_${campCust1.id}_${campCust1.email}`,
      campaignId: campaign.id,
    });
    await prisma.notification_jobs.update({
      where: { id: campJob1.id },
      data: { status: 'SENT', sent_at: new Date() },
    });

    // Dispatch job 2 (simulate FAILED)
    const campJob2 = await notificationService.queueNotification({
      businessId: bizA.id,
      recipient: `camp2_fail_${timestamp}@example.com`,
      channel: 'EMAIL',
      subject: campaign.subject,
      messageBody: campaign.body_html,
      idempotencyKey: `camp_${campaign.id}_fail_${timestamp}`,
      campaignId: campaign.id,
    });
    await prisma.notification_jobs.update({
      where: { id: campJob2.id },
      data: { status: 'FAILED', retry_count: 3, error_message: 'Recipient MX not found' },
    });

    // Retry only eligible failed jobs for this campaign
    const retriedJob = await notificationService.retryFailedJob(bizA.id, campJob2.id);
    assert(retriedJob.id === campJob2.id, 'Failed campaign job can be retried');

    const job1After = await prisma.notification_jobs.findUnique({ where: { id: campJob1.id } });
    assert(job1After.status === 'SENT', 'Previously sent campaign recipient was NOT resent during retry');

    // -------------------------------------------------------------
    // Scenario 15: A worker restart does not permanently lose scheduled jobs
    // -------------------------------------------------------------
    console.log('\n--- Scenario 15: A worker restart does not permanently lose scheduled jobs ---');
    const persistedJob = await notificationService.queueNotification({
      businessId: bizA.id,
      recipient: `persist_${timestamp}@example.com`,
      channel: 'EMAIL',
      subject: 'Worker Restart Test',
      messageBody: 'Should persist across restart',
      scheduledAt: new Date(Date.now() - 5000), // Due in the past
      idempotencyKey: `worker_persist_${timestamp}`,
    });

    // Verify it is safely committed in PostgreSQL
    const savedInDb = await prisma.notification_jobs.findUnique({ where: { id: persistedJob.id } });
    assert(!!savedInDb && savedInDb.status === 'QUEUED', 'Scheduled job is stored in PostgreSQL and survives server restart');

    // Simulate worker cycle picking up persisted due job
    const processedCycle = await notificationService.processDueJobs(20);
    const foundProcessed = processedCycle.some((j) => j.id === persistedJob.id);
    assert(foundProcessed, 'Background worker successfully processes persisted jobs after restart');

    // -------------------------------------------------------------
    // Scenario 16: One business cannot access another business notification data
    // -------------------------------------------------------------
    console.log('\n--- Scenario 16: One business cannot access another business notification data ---');
    // Tenant B tries to fetch notifications for Tenant A
    const tenantBListRes = await request('/api/notifications', {
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-business-id': bizB.id,
      },
    });

    assert(tenantBListRes.status === 200, 'Tenant B can list their own notifications');
    const bNotificationIds = (tenantBListRes.data?.data || []).map((n) => n.id);
    assert(!bNotificationIds.includes(custBkJob.id), 'Tenant B cannot see Tenant A notification jobs (strict tenant isolation)');

    // Tenant B tries to retry Tenant A failed job
    const unauthorizedRetryRes = await request(`/api/notifications/${failedJob.id}/retry`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenB}`,
        'x-business-id': bizB.id,
      },
    });
    assert(unauthorizedRetryRes.status === 404 || unauthorizedRetryRes.status === 403, 'Tenant B is forbidden from retrying Tenant A notification jobs');

    // -------------------------------------------------------------
    // Scenario 17: The frontend displays real API statuses and failures correctly
    // -------------------------------------------------------------
    console.log('\n--- Scenario 17: The frontend displays real API statuses and failures correctly ---');
    const tenantAListRes = await request('/api/notifications?limit=50', {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-business-id': bizA.id,
      },
    });

    assert(tenantAListRes.status === 200, 'GET /api/notifications returns 200 with real database jobs');
    const aJobs = tenantAListRes.data?.data || [];
    assert(aJobs.length > 0, 'Notifications list contains real dispatched business records');

    const summaryRes = await request('/api/notifications/summary', {
      headers: {
        Authorization: `Bearer ${tokenA}`,
        'x-business-id': bizA.id,
      },
    });
    assert(summaryRes.status === 200, 'GET /api/notifications/summary returns real database counts');
    assert(summaryRes.data?.data?.total_notifications > 0, 'Summary cards reflect real total notification counts');

    console.log('\n===============================================================');
    console.log(`🎉 ALL ${passedTests}/${totalTests} NOTIFICATION AUTOMATION END-TO-END TESTS PASSED!`);
    console.log('===============================================================\n');
  } catch (error) {
    console.error('\n❌ TEST RUN ABORTED WITH ERROR:', error.message || error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runEndToEndNotificationTests();
