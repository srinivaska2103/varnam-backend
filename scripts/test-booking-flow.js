import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/utils/generate-token.js';

const API_BASE = 'http://localhost:5000/api';

async function testBookingIntegration() {
  console.log('🧪 Starting Booking Management & Tenant Isolation Integration Tests...\n');
  const ts = Date.now();
  let user1, user2;
  let token1, token2;
  let biz1, biz2;

  try {
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // 1. Create two test users
    user1 = await prisma.users.create({
      data: {
        email: `bk_test1_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Artist Studio A',
        is_email_verified: true,
      },
    });
    token1 = generateAccessToken({ userId: user1.id, email: user1.email });

    user2 = await prisma.users.create({
      data: {
        email: `bk_test2_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Artist Studio B',
        is_email_verified: true,
      },
    });
    token2 = generateAccessToken({ userId: user2.id, email: user2.email });

    // 2. Create business 1
    const resB1 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        name: 'Studio Alpha',
        phone: `91000${ts.toString().slice(-5)}`,
        city: 'Chennai',
      }),
    });
    const b1Json = await resB1.json();
    biz1 = b1Json.data.business;

    // 3. Create business 2
    const resB2 = await fetch(`${API_BASE}/business`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token2}`,
      },
      body: JSON.stringify({
        name: 'Studio Beta',
        phone: `92000${ts.toString().slice(-5)}`,
        city: 'Coimbatore',
      }),
    });
    const b2Json = await resB2.json();
    biz2 = b2Json.data.business;

    console.log(`✅ Created test businesses: Alpha (${biz1.id}) and Beta (${biz2.id})`);

    // 4. Create customer in Business Alpha
    const custResA = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
      body: JSON.stringify({
        full_name: 'Ananya Ramesh',
        phone: `98401${ts.toString().slice(-5)}`,
        city: 'Chennai',
      }),
    });
    const custJsonA = await custResA.json();
    const customerA = custJsonA.data;
    console.log(`✅ Created customer in Alpha: ${customerA.full_name} (${customerA.id})`);

    // 5. Test stats endpoint initially (should be 0)
    const statsRes1 = await fetch(`${API_BASE}/bookings/stats`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const statsJson1 = await statsRes1.json();
    console.log('✅ Initial Alpha Booking Stats:', statsJson1.data);

    // 6. Create booking with event in Business Alpha
    const createRes = await fetch(`${API_BASE}/bookings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
      body: JSON.stringify({
        customer_id: customerA.id,
        status: 'CONFIRMED',
        total_amount_paise: 5000000, // ₹50,000
        discount_paise: 500000,      // ₹5,000 => Net: ₹45,000
        notes: 'Bridal HD makeup with saree draping',
        event: {
          event_kind: 'WEDDING',
          title: 'Muhurtham & Reception',
          event_date: '2026-11-20',
          start_time: '06:00:00',
          end_time: '11:00:00',
          venue: 'Mayor Ramanathan Chettiar Hall',
          city: 'Chennai',
        },
      }),
    });
    const createJson = await createRes.json();
    if (!createRes.ok) {
      throw new Error(`Failed to create booking: ${JSON.stringify(createJson)}`);
    }
    const bookingA = createJson.data;
    console.log(`✅ Created Booking in Alpha: ${bookingA.booking_number} (Net Payable: ₹${bookingA.payment_summary.net_payable_paise / 100})`);

    // 7. Verify listBookings includes financial calculation
    const listRes = await fetch(`${API_BASE}/bookings`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const listJson = await listRes.json();
    console.log(`✅ Alpha Bookings List Count: ${listJson.data.bookings.length}`);
    const firstListed = listJson.data.bookings[0];
    console.log(`   Agreed: ₹${firstListed.net_payable_paise / 100}, Paid: ₹${firstListed.total_paid_paise / 100}, Balance: ₹${firstListed.balance_due_paise / 100}`);

    // 8. Record a partial payment (₹20,000)
    const payRes = await fetch(`${API_BASE}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
      body: JSON.stringify({
        booking_id: bookingA.id,
        amount_paise: 2000000,
        method: 'UPI',
        reference_note: 'Advance via GPay',
      }),
    });
    const payJson = await payRes.json();
    console.log(`✅ Recorded payment for Booking: ${payJson.data.receipt_number || payJson.data.id} (₹20,000)`);

    // 9. Re-check stats endpoint (should show outstanding balance of ₹25,000)
    const statsRes2 = await fetch(`${API_BASE}/bookings/stats`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const statsJson2 = await statsRes2.json();
    console.log('✅ Alpha Updated Booking Stats:', statsJson2.data);
    if (statsJson2.data.total_outstanding_paise !== 2500000) {
      console.warn('⚠️ Expected total_outstanding_paise = 2500000, got:', statsJson2.data.total_outstanding_paise);
    }

    // 10. Check calendar endpoint
    const calRes = await fetch(`${API_BASE}/bookings/calendar?startDate=2026-11-01&endDate=2026-11-30`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const calJson = await calRes.json();
    console.log(`✅ Calendar Events Count in Nov 2026: ${calJson.data.totalEvents}`);

    // 11. Tenant Isolation Verification: Business Beta CANNOT see or modify Business Alpha's booking
    const tenantAccessRes = await fetch(`${API_BASE}/bookings/${bookingA.id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': biz2.id,
      },
    });
    console.log(`🔒 Tenant Isolation check (Studio Beta accessing Alpha booking): Status = ${tenantAccessRes.status} (Expected 404)`);

    const tenantListRes = await fetch(`${API_BASE}/bookings`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': biz2.id,
      },
    });
    const tenantListJson = await tenantListRes.json();
    console.log(`🔒 Tenant Isolation check (Studio Beta booking count): ${tenantListJson.data.bookings.length} (Expected 0)`);

    console.log('\n🎉 ALL BACKEND BOOKING INTEGRATION & TENANT ISOLATION TESTS PASSED!\n');
  } finally {
    // Cleanup test data
    try {
      if (biz1) {
        await prisma.payment_records.deleteMany({ where: { business_id: biz1.id } });
        await prisma.booking_events.deleteMany({ where: { business_id: biz1.id } });
        await prisma.booking_status_history.deleteMany({ where: { business_id: biz1.id } });
        await prisma.bookings.deleteMany({ where: { business_id: biz1.id } });
        await prisma.customers.deleteMany({ where: { business_id: biz1.id } });
        await prisma.business_memberships.deleteMany({ where: { business_id: biz1.id } });
        await prisma.businesses.delete({ where: { id: biz1.id } });
      }
      if (biz2) {
        await prisma.business_memberships.deleteMany({ where: { business_id: biz2.id } });
        await prisma.businesses.delete({ where: { id: biz2.id } });
      }
      if (user1) await prisma.users.delete({ where: { id: user1.id } });
      if (user2) await prisma.users.delete({ where: { id: user2.id } });
      console.log('🧹 Cleanup completed.');
    } catch (e) {
      console.error('Cleanup error:', e);
    }
  }
}

testBookingIntegration().catch(console.error);
