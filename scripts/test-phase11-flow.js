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

async function runPhase11Tests() {
  console.log('====================================================');
  console.log('🚀 STARTING PHASE 11 AUTOMATED VERIFICATION SUITE');
  console.log('   Exclusive Plan — Branded Website & Portfolio');
  console.log('====================================================\n');

  try {
    // -----------------------------------------------------------------
    // SETUP: Create 2 Businesses
    // Business 1: Basic Plan (Will test 403 Forbidden for Exclusive features)
    // Business 2: Exclusive Lifetime Plan (Will test full website & portfolio suite)
    // -----------------------------------------------------------------
    console.log('--- Step 0: Setup Basic and Exclusive Plan Tenants ---');

    const timestamp = Date.now().toString(36);

    // Tenant 1 (Basic Plan Owner)
    const owner1 = await prisma.users.create({
      data: {
        name: `Basic Owner ${timestamp}`,
        email: `basic_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const token1 = generateAuthToken(owner1);

    const biz1Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
      body: {
        name: `Basic Bridal Studio ${timestamp}`,
        phone: `91${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `basicbiz_${timestamp}@example.com`,
      },
    });
    assert(biz1Res.status === 201, 'Tenant 1 (Basic) business created successfully');
    const biz1Id = biz1Res.data.data.business?.id || biz1Res.data.data.id;

    // Tenant 2 (Exclusive Plan Owner)
    const owner2 = await prisma.users.create({
      data: {
        name: `Exclusive Owner ${timestamp}`,
        email: `excl_${timestamp}@example.com`,
        password_hash: 'hashedpassword',
        is_email_verified: true,
      },
    });
    const token2 = generateAuthToken(owner2);

    const biz2Res = await request('/api/business', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}` },
      body: {
        name: `Royal Couture Studio ${timestamp}`,
        phone: `92${Math.floor(10000000 + Math.random() * 90000000)}`,
        email: `exclbiz_${timestamp}@example.com`,
      },
    });
    assert(biz2Res.status === 201, 'Tenant 2 (Exclusive) business created successfully');
    const biz2Id = biz2Res.data.data.business?.id || biz2Res.data.data.id;

    // Upgrade Tenant 2 to EXCLUSIVE_LIFETIME
    const exclusivePlan = await prisma.plans.findUnique({
      where: { code: 'EXCLUSIVE_LIFETIME' },
    });
    assert(exclusivePlan !== null, 'Found EXCLUSIVE_LIFETIME plan in database');

    await prisma.business_entitlements.update({
      where: { business_id: biz2Id },
      data: {
        plan_id: exclusivePlan.id,
        status: 'ACTIVE',
        ends_at: null,
      },
    });
    console.log('✅ PASS: Tenant 2 successfully upgraded to EXCLUSIVE_LIFETIME');

    // -----------------------------------------------------------------
    // 1. EXCLUSIVE PLAN ACCESS CONTROL & ENTITLEMENT ENFORCEMENT
    // -----------------------------------------------------------------
    console.log('\n--- Step 1: Exclusive Plan Access Control ---');

    // Tenant 1 (Basic Plan) tries to create website -> 403 Forbidden
    const basicWebsiteRes = await request(`/api/websites/${biz1Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        site_title: 'Unauthorized Basic Studio',
      },
    });
    assert(basicWebsiteRes.status === 403, 'Basic Plan blocked from website management (403 Forbidden)');

    // Tenant 1 (Basic Plan) tries to create portfolio -> 403 Forbidden
    const basicPortfolioRes = await request('/api/portfolio', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz1Id },
      body: {
        title: 'Unauthorized Portfolio Image',
        image_url: 'https://images.unsplash.com/photo-1',
      },
    });
    assert(basicPortfolioRes.status === 403, 'Basic Plan blocked from portfolio management (403 Forbidden)');

    // -----------------------------------------------------------------
    // 2. WEBSITE MANAGEMENT APIS (Tenant 2 / Exclusive Plan)
    // -----------------------------------------------------------------
    console.log('\n--- Step 2: Website Configuration & Management ---');

    const testSlug = `royal-couture-${timestamp}`;

    // POST /api/websites
    const createWebRes = await request('/api/websites', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        subdomain: testSlug,
        site_title: 'Royal Couture Bridal Artistry',
        tagline: 'Elegance for your most memorable day',
        about_text: 'Award-winning bridal makeup and luxury styling based in Udaipur.',
        contact_email: 'contact@royalcouture.com',
        contact_phone: '+91 9876543210',
        whatsapp_phone: '+91 9876543210',
        public_address: 'Palace Road, Udaipur, Rajasthan',
        primary_color: '#D4AF37',
        logo_url: 'https://example.com/logo.png',
        seo_title: 'Royal Couture Bridal Makeup Udaipur',
        seo_description: 'Best bridal makeup artist in Udaipur',
        custom_domain: `royalcouture-${timestamp}.com`,
      },
    });
    if (createWebRes.status !== 200 && createWebRes.status !== 201) {
      console.error('DEBUG createWebRes:', createWebRes.status, createWebRes.data);
    }
    console.log('DEBUG createWebRes.data:', JSON.stringify(createWebRes.data));
    assert(createWebRes.status === 200 || createWebRes.status === 201, 'POST /api/websites: Configured website successfully');
    const webData = createWebRes.data?.data || createWebRes.data;
    assert(webData.status === 'DRAFT', 'Initial website status is DRAFT');
    assert(webData.subdomain === testSlug, 'Subdomain correctly stored');

    // Duplicate slug rejection check (Attempting to set same slug in another request)
    const dupSlugRes = await request(`/api/websites/${biz2Id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        subdomain: testSlug, // Same slug for same business is allowed, let's test if someone else takes it
      },
    });
    assert(dupSlugRes.status === 200, 'PATCH /api/websites/:id: Allows re-saving own slug');

    // GET /api/websites/:businessId
    const getWebRes = await request(`/api/websites/${biz2Id}`, {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(getWebRes.status === 200, 'GET /api/websites/:businessId: Retrieves website configuration');
    assert(getWebRes.data.data.site_title === 'Royal Couture Bridal Artistry', 'Site title matches');

    // GET /api/websites/:businessId/preview (Draft preview for authorized user)
    const previewRes = await request(`/api/websites/${biz2Id}/preview`, {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(previewRes.status === 200, 'GET /api/websites/:businessId/preview: Generates preview data');
    assert(previewRes.data.data.preview_mode === true, 'Preview mode flag is true');
    assert(previewRes.data.data.status === 'DRAFT', 'Preview shows DRAFT status');

    // -----------------------------------------------------------------
    // 3. PUBLIC ACCESS RULES FOR UNPUBLISHED WEBSITES
    // -----------------------------------------------------------------
    console.log('\n--- Step 3: Public Access Rules for Unpublished Website ---');

    // Public website endpoint must return 404 for unpublished website
    const unpubPublicRes = await request(`/api/public/websites/${testSlug}`);
    assert(unpubPublicRes.status === 404, 'Public API: Unpublished website returns 404 Not Found');

    // Public services must return 404
    const unpubServicesRes = await request(`/api/public/websites/${testSlug}/services`);
    assert(unpubServicesRes.status === 404, 'Public API: Services for unpublished website return 404');

    // -----------------------------------------------------------------
    // 4. PUBLISHING & UNPUBLISHING WEBSITE
    // -----------------------------------------------------------------
    console.log('\n--- Step 4: Publish & Unpublish Website ---');

    // Publish
    const pubRes = await request(`/api/websites/${biz2Id}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(pubRes.status === 200, 'PATCH /api/websites/:id/publish: Publishes website');
    assert(pubRes.data.data.status === 'PUBLISHED', 'Status transitioned to PUBLISHED');

    // -----------------------------------------------------------------
    // 5. PUBLIC WEBSITE APIS (Published Website)
    // -----------------------------------------------------------------
    console.log('\n--- Step 5: Public Website APIs ---');

    // Add 1 active service via API
    const srvRes = await request('/api/services', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        name: 'Royal Bridal Signature Look',
        description: 'Complete HD Airbrush with luxury lashes and draping',
        default_price_paise: 2500000,
        duration_minutes: 180,
      },
    });
    const srv1 = srvRes.data.data;

    // Add 1 inactive service via API and archive it
    const srvInactiveRes = await request('/api/services', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        name: 'Discontinued Basic Touchup',
        description: 'Old touchup package',
        default_price_paise: 500000,
        duration_minutes: 60,
      },
    });
    await request(`/api/services/${srvInactiveRes.data.data.id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });

    // Add 1 active package via API with included service
    const pkgRes = await request('/api/packages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        name: 'The Empress 3-Event Package',
        description: 'Mehendi, Sangeet & Wedding Artistry',
        price_paise: 6500000,
        services: [{ service_id: srv1.id, quantity: 1 }],
      },
    });
    const pkg1 = pkgRes.data.data;

    // Public GET /api/public/websites/:slug
    const pubWebRes = await request(`/api/public/websites/${testSlug}`);
    assert(pubWebRes.status === 200, 'GET /api/public/websites/:slug: Public website accessible (200 OK)');
    assert(pubWebRes.data.data.site_title === 'Royal Couture Bridal Artistry', 'Public site title matches');
    assert(pubWebRes.data.data.primary_color === '#D4AF37', 'Public theme color matches');
    assert(pubWebRes.data.data.internal_notes === undefined, 'No sensitive internal notes exposed');

    // Public GET /api/public/websites/:slug/services (Only active services returned)
    const pubSrvRes = await request(`/api/public/websites/${testSlug}/services`);
    if (pubSrvRes.status !== 200) {
      console.error('DEBUG pubSrvRes:', pubSrvRes.status, pubSrvRes.data);
    }
    assert(pubSrvRes.status === 200, 'GET /api/public/websites/:slug/services: Retrieves public services');
    assert(pubSrvRes.data.data.length === 1, 'Only active service returned (inactive filtered out)');
    assert(pubSrvRes.data.data[0].name === 'Royal Bridal Signature Look', 'Active service name matches');

    // Public GET /api/public/websites/:slug/packages
    const pubPkgRes = await request(`/api/public/websites/${testSlug}/packages`);
    assert(pubPkgRes.status === 200, 'GET /api/public/websites/:slug/packages: Retrieves public packages');
    assert(pubPkgRes.data.data.length === 1, 'Public packages returned');
    assert(pubPkgRes.data.data[0].included_services.length === 1, 'Included services returned');

    // -----------------------------------------------------------------
    // 6. PORTFOLIO MANAGEMENT APIS
    // -----------------------------------------------------------------
    console.log('\n--- Step 6: Portfolio Management ---');

    // Create Portfolio item 1 (Public)
    const port1Res = await request('/api/portfolio', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        title: 'Deepika Royal Muhurtham Transformation',
        description: 'Traditional South Indian bridal look with floral jadai',
        image_url: 'https://images.unsplash.com/photo-bridal-look-1',
        category: 'BRIDAL_TRADITIONAL',
        display_order: 1,
        is_public: true,
      },
    });
    assert(port1Res.status === 201, 'POST /api/portfolio: Creates portfolio item (201 Created)');
    const port1Id = port1Res.data.data.id;

    // Create Portfolio item 2 (Private/Draft)
    const port2Res = await request('/api/portfolio', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
      body: {
        title: 'Unreleased Celebrity Look (NDA Pending)',
        description: 'Private lookbook entry',
        image_url: 'https://images.unsplash.com/photo-celebrity-draft',
        category: 'CELEBRITY',
        display_order: 2,
        is_public: false, // Private
      },
    });
    assert(port2Res.status === 201, 'POST /api/portfolio: Creates draft/private portfolio item');
    const port2Id = port2Res.data.data.id;

    // List portfolio items (Authenticated business sees both public & private)
    const portListRes = await request('/api/portfolio', {
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(portListRes.status === 200, 'GET /api/portfolio: Authenticated business lists all portfolio items');
    assert(portListRes.data.data.length === 2, 'Owner sees both published and private items');

    // Public GET /api/public/websites/:slug/portfolio (Only public items returned)
    const pubPortRes = await request(`/api/public/websites/${testSlug}/portfolio`);
    assert(pubPortRes.status === 200, 'GET /api/public/websites/:slug/portfolio: Returns public portfolio');
    assert(pubPortRes.data.data.length === 1, 'Only public portfolio item visible to the public (Private item hidden)');
    assert(pubPortRes.data.data[0].title === 'Deepika Royal Muhurtham Transformation', 'Correct public item visible');

    // Archive / hide portfolio item 1
    const archivePortRes = await request(`/api/portfolio/${port1Id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(archivePortRes.status === 200, 'PATCH /api/portfolio/:id/archive: Successfully archived portfolio item');

    // Re-publish portfolio item 1
    const repubPortRes = await request(`/api/portfolio/${port1Id}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(repubPortRes.status === 200, 'PATCH /api/portfolio/:id/publish: Successfully re-published portfolio item');

    // -----------------------------------------------------------------
    // 7. WEBSITE PUBLIC ENQUIRY FORM
    // -----------------------------------------------------------------
    console.log('\n--- Step 7: Website Public Enquiry Form ---');

    const enqPayload = {
      customer_name: 'Ananya Panday',
      customer_phone: `98${Math.floor(10000000 + Math.random() * 90000000)}`,
      customer_email: 'ananya@example.com',
      event_kind: 'WEDDING',
      event_date: '2026-12-15',
      location: 'Udaivilas, Udaipur',
      selected_service_id: srv1.id,
      selected_package_id: pkg1.id,
      message: 'Looking for luxury bridal styling for a 3-day royal destination wedding.',
    };

    const pubEnqRes = await request(`/api/public/websites/${testSlug}/enquiries`, {
      method: 'POST',
      body: enqPayload,
    });
    if (pubEnqRes.status !== 201) {
      console.error('DEBUG pubEnqRes:', pubEnqRes.status, pubEnqRes.data);
    }
    assert(pubEnqRes.status === 201, 'POST /api/public/websites/:slug/enquiries: Enquiry submitted successfully');
    assert(pubEnqRes.data.data.enquiry_id !== undefined, 'Returns confirmed enquiry ID');

    // Verify enquiry was created in DB under Tenant 2 with source = BRANDED_WEBSITE
    const createdEnq = await prisma.enquiries.findUnique({
      where: { id: pubEnqRes.data.data.enquiry_id },
    });
    assert(createdEnq.business_id === biz2Id, 'Enquiry correctly assigned to Tenant 2 business');
    assert(createdEnq.status === 'NEW', 'Enquiry status initialized to NEW');
    assert(createdEnq.source === 'BRANDED_WEBSITE', 'Enquiry lead source marked as BRANDED_WEBSITE');

    // -----------------------------------------------------------------
    // 8. PUBLIC CONSULTATION REQUEST
    // -----------------------------------------------------------------
    console.log('\n--- Step 8: Website Public Consultation Request ---');

    const consultPayload = {
      requested_name: 'Kiara Advani',
      requested_phone: `99${Math.floor(10000000 + Math.random() * 90000000)}`,
      requested_email: 'kiara@example.com',
      consultation_type: 'IN_PERSON',
      preferred_date: '2026-11-20',
      preferred_time: '14:30:00',
      notes: 'Interested in bridal HD trial and bespoke veil draping discussion.',
    };

    const pubConsultRes = await request(`/api/public/websites/${testSlug}/consultation-requests`, {
      method: 'POST',
      body: consultPayload,
    });
    assert(pubConsultRes.status === 201, 'POST /api/public/websites/:slug/consultation-requests: Consultation requested (201)');
    assert(pubConsultRes.data.data.status === 'REQUESTED', 'Initial consultation status is REQUESTED');

    // Verify consultation in DB
    const createdConsult = await prisma.consultations.findUnique({
      where: { id: pubConsultRes.data.data.consultation_id },
    });
    assert(createdConsult.business_id === biz2Id, 'Consultation request associated with Tenant 2');
    assert(createdConsult.status === 'REQUESTED', 'Consultation status verified as REQUESTED');

    // -----------------------------------------------------------------
    // 9. UNPUBLISH & RETEST
    // -----------------------------------------------------------------
    console.log('\n--- Step 9: Unpublish Website & Verify Public Gate ---');

    const unpubRes = await request(`/api/websites/${biz2Id}/unpublish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token2}`, 'X-Business-ID': biz2Id },
    });
    assert(unpubRes.status === 200, 'Website successfully unpublished');

    const afterUnpubRes = await request(`/api/public/websites/${testSlug}`);
    assert(afterUnpubRes.status === 404, 'Public endpoint returns 404 once unpublished');

    // -----------------------------------------------------------------
    // 10. MULTI-TENANT ISOLATION & SECURITY CHECKS
    // -----------------------------------------------------------------
    console.log('\n--- Step 10: Multi-Tenant Isolation & Cross-Access ---');

    // Tenant 1 (Basic) tries to preview Tenant 2's website -> 403
    const crossPreviewRes = await request(`/api/websites/${biz2Id}/preview`, {
      headers: { Authorization: `Bearer ${token1}`, 'X-Business-ID': biz2Id },
    });
    assert(crossPreviewRes.status === 403, 'Cross-tenant preview blocked with 403 Forbidden');

    // Unauthenticated request to protected endpoints -> 401
    const unauthRes = await request(`/api/websites/${biz2Id}`);
    assert(unauthRes.status === 401, 'Unauthenticated website access rejected with 401');

    console.log('\n====================================================');
    console.log(`🎉 ALL PHASE 11 TESTS PASSED SUCCESSFULLY! (${passedTests}/${totalTests})`);
    console.log('====================================================\n');
  } catch (error) {
    console.error('\n❌ TEST SUITE FAILED:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase11Tests();
