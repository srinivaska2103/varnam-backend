/**
 * Verification test suite for Phase 7: Services, Packages & Quotations API
 *
 * Covers:
 * 1. Creating, listing, updating, and archiving services.
 * 2. Creating packages and managing their included services (add/remove).
 * 3. Creating quotations with server-side calculation of totals.
 * 4. Quotation status transitions & invalid transitions rejection.
 * 5. Converting accepted quotation into a booking with event scheduling.
 * 6. Preventing duplicate quotation conversion (409 Conflict).
 * 7. Enforcing multi-tenant isolation across businesses.
 * 8. Validation checks (missing fields, unauthorized, bad status).
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

async function runPhase7Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 7 AUTOMATED VERIFICATION SUITE');
  console.log('   Services, Packages & Quotations API');
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
        name: `Studio One Owner ${timestamp}`,
        email: `owner1_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token1 = generateAuthToken(owner1);

    const biz1Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: {
        name: `Luxe Bridal Artistry ${timestamp}`,
        phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `luxe_${timestamp}@example.com`,
        description: 'Premium bridal and cinematic makeup',
      },
    });

    assert(biz1Res.status === 201, 'Tenant 1 business created successfully');
    const biz1Id = biz1Res.data.data.business?.id || biz1Res.data.data.id;

    // Tenant 2
    const owner2 = await prisma.users.create({
      data: {
        name: `Studio Two Owner ${timestamp}`,
        email: `owner2_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });

    const token2 = generateAuthToken(owner2);

    const biz2Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        name: `Royal Glam Makeup ${timestamp}`,
        phone: `92${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `royal_${timestamp}@example.com`,
      },
    });

    assert(biz2Res.status === 201, 'Tenant 2 business created successfully');
    const biz2Id = biz2Res.data.data.business?.id || biz2Res.data.data.id;

    // Create a Customer in Tenant 1
    const custRes = await request('/api/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        full_name: 'Priyanka Sharma',
        phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `priyanka_${timestamp}@example.com`,
        city: 'Madurai',
      },
    });
    assert(custRes.status === 201, 'Customer created in Tenant 1');
    const customer1Id = custRes.data.data.id;

    // -----------------------------------------------------------------
    // 1. SERVICES MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Services Management (CRUD + Archive) ---');

    // 1.1 Create Service
    const s1Res = await request('/api/services', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        name: 'Bridal HD Makeup',
        description: 'Complete high-definition waterproof bridal look with lashes',
        default_price_paise: 1500000, // ₹15,000
        duration_minutes: 180,
        is_active: true,
      },
    });
    assert(s1Res.status === 201, 'POST /api/services: Creates service successfully');
    assert(s1Res.data.data.default_price_paise === 1500000, 'Service default price matches 1500000 paise');
    const service1Id = s1Res.data.data.id;

    // 1.2 Create duplicate service in same business -> Conflict
    const s1DupRes = await request('/api/services', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        name: 'Bridal HD Makeup',
        default_price_paise: 1200000,
      },
    });
    assert(s1DupRes.status === 409, 'POST /api/services: Rejects duplicate service name with 409 Conflict');

    // 1.3 Create second service
    const s2Res = await request('/api/services', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        name: 'Hairstyling & Saree Draping',
        description: 'Floral hairdo and traditional box pleating',
        default_price_paise: 500000, // ₹5,000
        duration_minutes: 60,
      },
    });
    assert(s2Res.status === 201, 'POST /api/services: Second service created');
    const service2Id = s2Res.data.data.id;

    // 1.4 List services with search
    const listServicesRes = await request('/api/services?search=Bridal', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(listServicesRes.status === 200, 'GET /api/services: Lists services with search');
    assert(listServicesRes.data.data.services.length >= 1, 'Search returned matching service');

    // 1.5 Get service details
    const getServiceRes = await request(`/api/services/${service1Id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(getServiceRes.status === 200, 'GET /api/services/:id: Returns service details');
    assert(getServiceRes.data.data.name === 'Bridal HD Makeup', 'Service details match name');

    // 1.6 Update service
    const updateServiceRes = await request(`/api/services/${service1Id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        default_price_paise: 1600000, // Updated to ₹16,000
        description: 'Updated luxury HD makeup with premium airbrush touchup',
      },
    });
    assert(updateServiceRes.status === 200, 'PATCH /api/services/:id: Updates service fields');
    assert(updateServiceRes.data.data.default_price_paise === 1600000, 'Updated price reflects 1600000 paise');

    // 1.7 Archive service
    const archiveServiceRes = await request(`/api/services/${service2Id}/archive`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(archiveServiceRes.status === 200, 'PATCH /api/services/:id/archive: Soft-archives service');
    assert(archiveServiceRes.data.data.is_active === false, 'Archived service has is_active: false');

    // -----------------------------------------------------------------
    // 2. PACKAGES MANAGEMENT
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Packages Management & Inclusions ---');

    // 2.1 Create Package with initial service
    const pkg1Res = await request('/api/packages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        name: 'Royal Bridal & Reception Combo',
        description: 'Complete package including Muhurtham & Reception looks',
        price_paise: 2500000, // ₹25,000
        is_public: true,
        services: [
          {
            service_id: service1Id,
            quantity: 1,
            notes: 'Muhurtham ceremony',
          },
        ],
      },
    });
    assert(pkg1Res.status === 201, 'POST /api/packages: Creates package with initial services');
    assert(pkg1Res.data.data.price_paise === 2500000, 'Package price matches 2500000 paise');
    assert(pkg1Res.data.data.package_services.length === 1, 'Package has 1 included service');
    const package1Id = pkg1Res.data.data.id;

    // 2.2 Add Service to Package
    const addSvcRes = await request(`/api/packages/${package1Id}/services`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        service_id: service2Id,
        service_name_snapshot: 'Hairstyling & Saree Draping',
        quantity: 2,
        notes: 'Bridesmaids styling',
      },
    });
    assert(addSvcRes.status === 201, 'POST /api/packages/:id/services: Adds service to package');

    // 2.3 Verify package details include both services
    const getPkgRes = await request(`/api/packages/${package1Id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(getPkgRes.status === 200, 'GET /api/packages/:id: Retrieves package with included services');
    assert(getPkgRes.data.data.package_services.length === 2, 'Package now contains 2 included services');

    // 2.4 Remove service from package
    const removeSvcRes = await request(`/api/packages/${package1Id}/services/${service2Id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(removeSvcRes.status === 200, 'DELETE /api/packages/:id/services/:serviceId: Removes service');

    // 2.5 Cross-tenant check: Add Tenant 1's service to Tenant 2's package -> 400 Bad Request
    const pkg2Res = await request('/api/packages', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Business-ID': biz2Id,
      },
      body: {
        name: 'Tenant 2 Glam Package',
        price_paise: 1800000,
      },
    });
    const package2Id = pkg2Res.data.data.id;

    const crossTenantAddSvc = await request(`/api/packages/${package2Id}/services`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Business-ID': biz2Id,
      },
      body: {
        service_id: service1Id, // Belongs to Tenant 1
      },
    });
    assert(crossTenantAddSvc.status === 400, 'Tenant isolation: Cannot add another business’s service to a package');

    // -----------------------------------------------------------------
    // 3. QUOTATIONS MANAGEMENT & CALCULATIONS
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Quotations Management & Server-Side Calculations ---');

    // 3.1 Create Quotation with server-side calculation
    // Items:
    // Item 1: 1 x ₹16,000 = ₹16,000 (1600000 paise)
    // Item 2: 2 x ₹5,000 = ₹10,000 (1000000 paise)
    // Subtotal: 2600000 paise
    // Discount: 100000 paise (₹1,000)
    // Tax: 125000 paise (₹1,250)
    // Expected Total: 2600000 - 100000 + 125000 = 2625000 paise
    const createQuoteRes = await request('/api/quotations', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        customer_id: customer1Id,
        valid_until: '2026-12-31',
        terms: '50% advance to confirm the dates. Balance on event day.',
        discount_paise: 100000,
        tax_paise: 125000,
        items: [
          {
            service_id: service1Id,
            description: 'Bridal HD Muhurtham Look',
            quantity: 1,
            unit_price_paise: 1600000,
          },
          {
            service_id: service2Id,
            description: 'Saree Draping & Hairdos for Family',
            quantity: 2,
            unit_price_paise: 500000,
          },
        ],
      },
    });

    assert(createQuoteRes.status === 201, 'POST /api/quotations: Creates quotation successfully');
    const quote = createQuoteRes.data.data;
    assert(quote.status === 'DRAFT', 'New quotation initialized with status DRAFT');
    assert(quote.subtotal_paise === 2600000, 'Server-side subtotal calculated correctly: 2600000 paise');
    assert(quote.total_paise === 2625000, 'Server-side total calculated correctly: 2625000 paise (Subtotal - Discount + Tax)');
    assert(quote.quotation_items.length === 2, 'Quotation items properly linked');
    const quotation1Id = quote.id;

    // 3.2 List quotations
    const listQuotesRes = await request('/api/quotations?status=DRAFT', {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(listQuotesRes.status === 200, 'GET /api/quotations: Lists quotations with status filter');
    assert(listQuotesRes.data.data.quotations.length >= 1, 'Quotation list returned records');

    // 3.3 Get quotation details
    const getQuoteRes = await request(`/api/quotations/${quotation1Id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
    });
    assert(getQuoteRes.status === 200, 'GET /api/quotations/:id: Retrieves quotation details');
    assert(getQuoteRes.data.data.quotation_items[0].line_total_paise === 1600000, 'Line total correctly computed on item 1');
    assert(getQuoteRes.data.data.quotation_items[1].line_total_paise === 1000000, 'Line total correctly computed on item 2');

    // -----------------------------------------------------------------
    // 4. STATUS TRANSITIONS
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Quotation Status Transitions ---');

    // 4.1 Invalid transition: DRAFT -> ACCEPTED directly (must be SENT first)
    const invalidTransRes = await request(`/api/quotations/${quotation1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'ACCEPTED' },
    });
    assert(invalidTransRes.status === 400, 'PATCH /api/quotations/:id/status: Rejects invalid transition DRAFT -> ACCEPTED');

    // 4.2 Valid transition: DRAFT -> SENT
    const sendQuoteRes = await request(`/api/quotations/${quotation1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'SENT' },
    });
    assert(sendQuoteRes.status === 200, 'PATCH /api/quotations/:id/status: Transitions DRAFT -> SENT');
    assert(sendQuoteRes.data.data.status === 'SENT', 'Status is now SENT');
    assert(sendQuoteRes.data.data.sent_at !== null, 'sent_at timestamp populated');

    // 4.3 Valid transition: SENT -> ACCEPTED
    const acceptQuoteRes = await request(`/api/quotations/${quotation1Id}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: { status: 'ACCEPTED' },
    });
    assert(acceptQuoteRes.status === 200, 'PATCH /api/quotations/:id/status: Transitions SENT -> ACCEPTED');
    assert(acceptQuoteRes.data.data.status === 'ACCEPTED', 'Status is now ACCEPTED');
    assert(acceptQuoteRes.data.data.accepted_at !== null, 'accepted_at timestamp populated');

    // -----------------------------------------------------------------
    // 5. CONVERT QUOTATION TO BOOKING
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Convert Accepted Quotation into Confirmed Booking ---');

    // 5.1 Convert to booking
    const convertRes = await request(`/api/quotations/${quotation1Id}/convert-to-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        event_date: '2026-12-20',
        event_kind: 'WEDDING',
        start_time: '05:30:00',
        end_time: '11:00:00',
        venue: 'Grand Palace Mandapam, Madurai',
        city: 'Madurai',
        notes: 'Bride requested golden jewellery match',
      },
    });

    assert(convertRes.status === 201, 'POST /api/quotations/:id/convert-to-booking: Converted to booking');
    const booking = convertRes.data.data.booking;
    assert(booking.total_amount_paise === 2625000, 'Created booking has exact agreed quotation total: 2625000 paise');
    assert(booking.quotation_id === quotation1Id, 'Booking links to original quotation_id');
    assert(booking.booking_events.length === 1, 'Primary wedding event scheduled on 2026-12-20');

    // 5.2 Prevent duplicate conversion -> 409 Conflict
    const dupConvertRes = await request(`/api/quotations/${quotation1Id}/convert-to-booking`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token1}`,
        'X-Business-ID': biz1Id,
      },
      body: {
        event_date: '2026-12-20',
      },
    });
    assert(dupConvertRes.status === 409, 'Duplicate conversion prevented with 409 Conflict');

    // -----------------------------------------------------------------
    // 6. MULTI-TENANCY & UNAUTHORIZED CHECKS
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Multi-Tenant Isolation & Security Checks ---');

    // 6.1 Tenant 2 attempts to get Tenant 1's service -> 404/403
    const crossServiceRes = await request(`/api/services/${service1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Business-ID': biz2Id,
      },
    });
    assert(crossServiceRes.status === 404, 'Cross-tenant: Tenant 2 cannot access Tenant 1 service (404 Not Found)');

    // 6.2 Tenant 2 attempts to get Tenant 1's quotation -> 404/403
    const crossQuoteRes = await request(`/api/quotations/${quotation1Id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'X-Business-ID': biz2Id,
      },
    });
    assert(crossQuoteRes.status === 404, 'Cross-tenant: Tenant 2 cannot access Tenant 1 quotation (404 Not Found)');

    // 6.3 Missing authentication -> 401
    const unauthRes = await request('/api/services', {
      method: 'POST',
      body: { name: 'Unauthorized Service', default_price_paise: 1000 },
    });
    assert(unauthRes.status === 401, 'Unauthorized request rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 7 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase7Tests();
