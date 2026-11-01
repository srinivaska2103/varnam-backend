import prisma from '../src/config/prisma.js';
import bcrypt from 'bcryptjs';
import { generateAccessToken } from '../src/utils/generate-token.js';

const API_BASE = 'http://localhost:5000/api';

async function testCustomerIntegration() {
  console.log('🧪 Starting Customer Management & Tenant Isolation Integration Tests...\n');
  const ts = Date.now();
  let user1, user2;
  let token1, token2;
  let biz1, biz2;

  try {
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // 1. Create two test users
    user1 = await prisma.users.create({
      data: {
        email: `cust_test1_${ts}@example.com`,
        password_hash: passwordHash,
        name: 'Artist Studio A',
        is_email_verified: true,
      },
    });
    token1 = generateAccessToken({ userId: user1.id, email: user1.email });

    user2 = await prisma.users.create({
      data: {
        email: `cust_test2_${ts}@example.com`,
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
        name: 'Studio A Bridal Makeup',
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
        name: 'Studio B Bridal Artistry',
        phone: `92000${ts.toString().slice(-5)}`,
        city: 'Madurai',
      }),
    });
    const b2Json = await resB2.json();
    biz2 = b2Json.data.business;

    console.log(`✅ Business 1 (${biz1.name}) & Business 2 (${biz2.name}) created.`);

    // 4. Test Create Customer under Business 1
    const createRes = await fetch(`${API_BASE}/customers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
      body: JSON.stringify({
        full_name: 'Ananya Sharma',
        phone: `98765${ts.toString().slice(-5)}`,
        email: 'ananya@example.com',
        city: 'Chennai',
        notes: 'Sensitive skin, requested HD bridal trial',
      }),
    });
    const createdJson = await createRes.json();
    if (!createdJson.success) throw new Error('Failed to create customer: ' + JSON.stringify(createdJson));
    const customer1 = createdJson.data;
    console.log(`✅ Customer created in Business 1: ${customer1.full_name} (${customer1.id})`);

    // 5. Test List Customers under Business 1
    const listRes1 = await fetch(`${API_BASE}/customers`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const list1Json = await listRes1.json();
    if (!list1Json.success || list1Json.data.customers.length !== 1) {
      throw new Error('List verification failed for Business 1: ' + JSON.stringify(list1Json));
    }
    console.log(`✅ Customer list retrieved for Business 1: ${list1Json.data.customers.length} customer(s).`);

    // 6. Test Tenant Isolation: Business 2 should see 0 customers
    const listRes2 = await fetch(`${API_BASE}/customers`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': biz2.id,
      },
    });
    const list2Json = await listRes2.json();
    if (!list2Json.success || list2Json.data.customers.length !== 0) {
      throw new Error('Tenant isolation breach! Business 2 saw customers: ' + JSON.stringify(list2Json));
    }
    console.log(`✅ Tenant isolation verified: Business 2 has 0 customers.`);

    // 7. Test Tenant Isolation on Get By ID: Business 2 cannot view Business 1's customer
    const crossGetRes = await fetch(`${API_BASE}/customers/${customer1.id}`, {
      headers: {
        Authorization: `Bearer ${token2}`,
        'x-business-id': biz2.id,
      },
    });
    const crossJson = await crossGetRes.json();
    if (crossGetRes.status !== 404 && crossGetRes.status !== 403) {
      throw new Error(`Tenant isolation failed on getCustomerById! Status: ${crossGetRes.status}, Body: ${JSON.stringify(crossJson)}`);
    }
    console.log(`✅ Tenant isolation verified: Cross-business customer access correctly rejected (404/403).`);

    // 8. Test Search Customers by Name & Phone
    const searchRes = await fetch(`${API_BASE}/customers?search=Ananya`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const searchJson = await searchRes.json();
    if (searchJson.data.customers.length !== 1) {
      throw new Error('Search by name failed: ' + JSON.stringify(searchJson));
    }
    console.log(`✅ Search by customer name verified.`);

    // 9. Test Edit / Update Customer
    const updateRes = await fetch(`${API_BASE}/customers/${customer1.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
      body: JSON.stringify({
        city: 'Coimbatore',
        notes: 'Updated: Preference for pastel peach saree',
      }),
    });
    const updateJson = await updateRes.json();
    if (!updateJson.success || updateJson.data.city !== 'Coimbatore') {
      throw new Error('Customer update failed: ' + JSON.stringify(updateJson));
    }
    console.log(`✅ Customer update verified: city updated to ${updateJson.data.city}.`);

    // 10. Test Get Customer Detail
    const detailRes = await fetch(`${API_BASE}/customers/${customer1.id}`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const detailJson = await detailRes.json();
    if (!detailJson.success || !detailJson.data.bookings || !detailJson.data.enquiries) {
      throw new Error('Customer detail response missing bookings/enquiries: ' + JSON.stringify(detailJson));
    }
    console.log(`✅ Customer detail with booking & enquiry relationships verified.`);

    // 11. Test Safe Deletion
    const deleteRes = await fetch(`${API_BASE}/customers/${customer1.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const deleteJson = await deleteRes.json();
    if (!deleteJson.success) {
      throw new Error('Safe delete failed: ' + JSON.stringify(deleteJson));
    }
    console.log(`✅ Safe deletion of unbooked client verified.`);

    // 12. Confirm deletion in database
    const postDeleteList = await fetch(`${API_BASE}/customers`, {
      headers: {
        Authorization: `Bearer ${token1}`,
        'x-business-id': biz1.id,
      },
    });
    const postDeleteJson = await postDeleteList.json();
    if (postDeleteJson.data.customers.length !== 0) {
      throw new Error('Customer still present after delete: ' + JSON.stringify(postDeleteJson));
    }
    console.log(`✅ Post-delete verification confirmed: 0 customers.`);

    console.log('\n🎉 ALL CUSTOMER INTEGRATION & TENANT ISOLATION TESTS PASSED!\n');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    // Cleanup test artifacts
    if (biz1?.id) {
      await prisma.customers.deleteMany({ where: { business_id: biz1.id } });
      await prisma.businesses.delete({ where: { id: biz1.id } }).catch(() => {});
    }
    if (biz2?.id) {
      await prisma.customers.deleteMany({ where: { business_id: biz2.id } });
      await prisma.businesses.delete({ where: { id: biz2.id } }).catch(() => {});
    }
    if (user1?.id) await prisma.users.delete({ where: { id: user1.id } }).catch(() => {});
    if (user2?.id) await prisma.users.delete({ where: { id: user2.id } }).catch(() => {});
    await prisma.$disconnect();
  }
}

testCustomerIntegration();
