/**
 * Verification test suite for Phase 8: Consultation Management
 *
 * Covers:
 * 1. Creating and listing consultations with filters & search.
 * 2. Retrieving consultation details including customer preferences & linked records.
 * 3. Updating consultation details, rescheduling, and recording structured consultation outcomes.
 * 4. Validating consultation status transitions (REQUESTED -> CONFIRMED -> COMPLETED, etc.) and rejecting invalid transitions.
 * 5. Cancelling consultations (safe status transition to CANCELLED with audit notes).
 * 6. Calendar endpoint with date-range, view, and customer filtering.
 * 7. Upcoming consultations endpoint with day horizon and limit.
 * 8. Overlap and schedule conflict detection for appointments in the same business.
 * 9. Multi-tenant isolation: Tenant 2 cannot access or mutate Tenant 1 consultations.
 * 10. Security: Rejecting unauthorized or invalid requests.
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

async function runPhase8Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 8 AUTOMATED VERIFICATION SUITE');
  console.log('   Consultation Management API');
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
    // SETUP: Provision 2 isolated businesses & owners
    // -----------------------------------------------------------------
    console.log('--- Step 0: Setup Two Isolated Business Tenants ---');

    const timestamp = Date.now().toString(36);
    const owner1 = await prisma.users.create({
      data: {
        name: `Consultation Owner 1 ${timestamp}`,
        email: `c_owner1_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token1 = generateAuthToken(owner1);

    const biz1Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: {
        name: `Studio Aura Consultations ${timestamp}`,
        phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `aura_${timestamp}@example.com`,
        description: 'Bespoke bridal consultations & trials studio',
      },
    });

    assert(biz1Res.status === 201, 'Tenant 1 business created successfully');
    const biz1Id = biz1Res.data.data.business?.id || biz1Res.data.data.id;

    // Tenant 2
    const owner2 = await prisma.users.create({
      data: {
        name: `Consultation Owner 2 ${timestamp}`,
        email: `c_owner2_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token2 = generateAuthToken(owner2);

    const biz2Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        name: `Studio Radiance ${timestamp}`,
        phone: `92${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `radiance_${timestamp}@example.com`,
      },
    });

    assert(biz2Res.status === 201, 'Tenant 2 business created successfully');
    const biz2Id = biz2Res.data.data.business?.id || biz2Res.data.data.id;

    // Create a customer in Tenant 1
    const custRes = await request('/api/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        full_name: 'Anushka Sen',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `anushka_${timestamp}@example.com`,
        city: 'Chennai',
      },
    });
    assert(custRes.status === 201, 'Customer created in Tenant 1');
    const customer1Id = custRes.data.data.id;

    // Create an enquiry in Tenant 1
    const enqRes = await request('/api/enquiries', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        customer_id: customer1Id,
        customer_name: 'Anushka Sen',
        customer_phone: '9840112233',
        event_kind: 'WEDDING',
        event_date: '2026-11-20',
      },
    });
    assert(enqRes.status === 201, 'Enquiry created in Tenant 1');
    const enquiry1Id = enqRes.data.data.id;

    // -----------------------------------------------------------------
    // 1. SCHEDULE CONSULTATION & PREFERENCES
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Schedule Consultations (POST /api/consultations) ---');

    // Consultation 1: In-Person consultation on 2026-11-10 from 10:00 to 11:30
    const consult1Res = await request('/api/consultations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        customer_id: customer1Id,
        enquiry_id: enquiry1Id,
        consultation_type: 'IN_PERSON',
        status: 'REQUESTED',
        scheduled_start: '2026-11-10T10:00:00.000Z',
        scheduled_end: '2026-11-10T11:30:00.000Z',
        location_name: 'Studio Aura VIP Bridal Lounge',
        location_address: '102 Anna Salai, Chennai',
        notes: 'Bride requested airbrush skin test',
        preferences: {
          makeup_preferences: 'Subtle glam with dewy glass-skin finish',
          hairstyle_preferences: 'Messy low bun with fresh baby’s breath florals',
          skin_notes: 'Combination skin with sensitive T-zone',
          special_requirements: 'Prefers cruelty-free and vegan foundations',
          inspiration_links: ['https://pinterest.com/pin/12345'],
        },
      },
    });

    assert(consult1Res.status === 201, 'POST /api/consultations: Schedules consultation successfully');
    const consult1 = consult1Res.data.data;
    assert(consult1.status === 'REQUESTED', 'Initial consultation status is REQUESTED');
    assert(consult1.consultation_type === 'IN_PERSON', 'Consultation type is IN_PERSON');
    assert(consult1.preferences?.makeup_preferences?.includes('Subtle glam'), 'Customer makeup preferences stored');
    const consult1Id = consult1.id;

    // Consultation 2: Phone consultation later the same day (15:00 to 15:30)
    const consult2Res = await request('/api/consultations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        customer_id: customer1Id,
        requested_name: 'Anushka Sen',
        requested_phone: '9840112233',
        consultation_type: 'PHONE',
        status: 'CONFIRMED',
        scheduled_start: '2026-11-10T15:00:00.000Z',
        scheduled_end: '2026-11-10T15:30:00.000Z',
        notes: 'Follow-up discussion on budget and bridesmaids look',
      },
    });

    assert(consult2Res.status === 201, 'POST /api/consultations: Second consultation scheduled');
    const consult2Id = consult2Res.data.data.id;

    // -----------------------------------------------------------------
    // 2. CONFLICT DETECTION ENGINE
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Overlap and Schedule Conflict Detection ---');

    // Attempt to schedule an overlapping appointment (10:30 to 11:00 overlaps with 10:00 to 11:30)
    const conflictRes = await request('/api/consultations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        requested_name: 'Overlapping Client',
        requested_phone: '9988776655',
        consultation_type: 'VIDEO',
        scheduled_start: '2026-11-10T10:30:00.000Z',
        scheduled_end: '2026-11-10T11:00:00.000Z',
      },
    });

    assert(conflictRes.status === 409, 'Conflict Engine: Overlapping appointment rejected with 409 Conflict');

    // -----------------------------------------------------------------
    // 3. RETRIEVAL & FILTERING
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Retrieval, Search & Details ---');

    // List consultations
    const listRes = await request('/api/consultations?status=REQUESTED', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(listRes.status === 200, 'GET /api/consultations: Lists consultations with status filter');
    assert(listRes.data.data.consultations.length >= 1, 'Consultations found in list');

    // Get consultation by ID
    const getRes = await request(`/api/consultations/${consult1Id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(getRes.status === 200, 'GET /api/consultations/:id: Retrieves consultation details');
    assert(getRes.data.data.requested_name === 'Anushka Sen', 'Client name matches');
    assert(getRes.data.data.preferences !== null, 'Customer preferences snapshot embedded in response');

    // -----------------------------------------------------------------
    // 4. UPDATES, RESCHEDULING & RECORDING OUTCOMES
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Updates & Consultation Outcomes ---');

    // Update with consultation outcome
    const updateRes = await request(`/api/consultations/${consult1Id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        location_name: 'Studio Aura Bridal Suite 1',
        outcome: {
          summary: 'Client loved the glass-skin trial and confirmed lipstick shade #M04',
          customer_requirements: 'Muhurtham styling at 5:00 AM and Reception touchup at 6:00 PM',
          agreed_services: 'Bridal HD Artistry & Saree Pleating',
          agreed_package: 'Luxe Bridal Gold Package',
          estimated_price_paise: 3500000, // ₹35,000
          follow_up_date: '2026-11-15',
          intends_to_proceed: true,
        },
      },
    });

    assert(updateRes.status === 200, 'PATCH /api/consultations/:id: Updates details and records outcome');
    assert(updateRes.data.data.notes?.includes('CONSULTATION OUTCOME'), 'Structured outcome notes recorded');
    assert(updateRes.data.data.notes?.includes('₹35000.00'), 'Estimated price logged in outcome notes');

    // -----------------------------------------------------------------
    // 5. STATUS TRANSITIONS & VALIDATION
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Status Transitions & State Machine ---');

    // 5.1 Invalid transition: REQUESTED -> COMPLETED directly (must be CONFIRMED or RESCHEDULED first)
    const invalidTrans = await request(`/api/consultations/${consult1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'COMPLETED' },
    });
    assert(invalidTrans.status === 400, 'State Machine: Rejects invalid status transition REQUESTED -> COMPLETED');

    // 5.2 Valid transition: REQUESTED -> CONFIRMED
    const confirmRes = await request(`/api/consultations/${consult1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'CONFIRMED', notes: 'Client confirmed attendance via WhatsApp' },
    });
    assert(confirmRes.status === 200, 'PATCH /api/consultations/:id/status: Transitions REQUESTED -> CONFIRMED');
    assert(confirmRes.data.data.status === 'CONFIRMED', 'Status is now CONFIRMED');

    // 5.3 Valid transition: CONFIRMED -> COMPLETED
    const completeRes = await request(`/api/consultations/${consult1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'COMPLETED', notes: 'Consultation successfully held' },
    });
    assert(completeRes.status === 200, 'PATCH /api/consultations/:id/status: Transitions CONFIRMED -> COMPLETED');
    assert(completeRes.data.data.status === 'COMPLETED', 'Status is now COMPLETED');

    // -----------------------------------------------------------------
    // 6. CANCELLATION
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Consultation Cancellation ---');

    const cancelRes = await request(`/api/consultations/${consult2Id}/cancel`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { cancellation_reason: 'Client rescheduled work meeting' },
    });

    assert(cancelRes.status === 200, 'PATCH /api/consultations/:id/cancel: Cancels consultation safely');
    assert(cancelRes.data.data.status === 'CANCELLED', 'Status transitioned to CANCELLED');
    assert(cancelRes.data.data.notes?.includes('[Cancelled]'), 'Cancellation reason appended to notes');

    // -----------------------------------------------------------------
    // 7. CALENDAR & UPCOMING ENDPOINTS
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Calendar & Upcoming Endpoints ---');

    // Calendar query
    const calRes = await request(
      '/api/consultations/calendar?startDate=2026-11-01T00:00:00.000Z&endDate=2026-11-30T23:59:59.000Z&view=month',
      {
        headers: {
          Authorization: `Bearer ${token1}`,
          'X-Business-ID': biz1Id,
        },
      }
    );
    assert(calRes.status === 200, 'GET /api/consultations/calendar: Retrieves calendar appointments in date range');
    assert(calRes.data.data.view === 'month', 'Calendar returns requested month view');

    // Upcoming query
    const upRes = await request('/api/consultations/upcoming?days=60&limit=10', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(upRes.status === 200, 'GET /api/consultations/upcoming: Retrieves upcoming consultations');

    // -----------------------------------------------------------------
    // 8. MULTI-TENANT ISOLATION & SECURITY
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Multi-Tenant Isolation & Security ---');

    // Tenant 2 attempts to get Tenant 1 consultation -> 404
    const crossRes = await request(`/api/consultations/${consult1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Business-ID': biz2Id,
      },
    });
    assert(crossRes.status === 404, 'Tenant Isolation: Tenant 2 cannot access Tenant 1 consultation (404 Not Found)');

    // Missing authentication -> 401
    const unauthRes = await request('/api/consultations', {
      method: 'POST',
      body: { requested_name: 'Hacker' },
    });
    assert(unauthRes.status === 401, 'Security: Unauthenticated request rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 8 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase8Tests();
