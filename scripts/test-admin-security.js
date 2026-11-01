import prisma from '../src/config/prisma.js';
import { generateAccessToken } from '../src/utils/generate-token.js';
import http from 'http';
import app from '../src/app.js';

async function testAdminSecurityE2E() {
  console.log('🔒 Testing Super Admin Security & Authorization Boundaries...');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/api`;

  try {
    // 1. Identify a Super Admin user and a Regular Studio Owner
    const superAdminUser = await prisma.users.findFirst({
      where: { is_super_admin: true, email: 'kingsrinivas66@gmail.com' },
    });

    const regularStudioUser = await prisma.users.findFirst({
      where: { is_super_admin: false },
    });

    if (!superAdminUser || !regularStudioUser) {
      throw new Error('Test preconditions not met: need both a super admin and a regular user in DB');
    }

    const superAdminToken = generateAccessToken({ userId: superAdminUser.id, email: superAdminUser.email });
    const regularUserToken = generateAccessToken({ userId: regularStudioUser.id, email: regularStudioUser.email });

    console.log(`- Super Admin identified: ${superAdminUser.email} (ID: ${superAdminUser.id})`);
    console.log(`- Regular Studio User identified: ${regularStudioUser.email} (ID: ${regularStudioUser.id})`);

    // Helper request
    const makeRequest = async (path, token = null) => {
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${baseUrl}${path}`, { headers });
      const data = await res.json().catch(() => null);
      return { status: res.status, data };
    };

    // Test A: Unauthenticated request to /api/admin/dashboard -> Must be 401
    const unauthRes = await makeRequest('/admin/dashboard');
    console.log(`A. Unauthenticated GET /api/admin/dashboard -> Status: ${unauthRes.status}`);
    if (unauthRes.status !== 401) throw new Error('Unauthenticated request was not blocked with 401!');

    // Test B: Regular Studio Owner attempting /api/admin/dashboard -> Must be 403 Forbidden
    const forbiddenRes = await makeRequest('/admin/dashboard', regularUserToken);
    console.log(`B. Regular Studio User GET /api/admin/dashboard -> Status: ${forbiddenRes.status}`);
    if (forbiddenRes.status !== 403) throw new Error('Regular studio user was not blocked with 403 Forbidden!');

    // Test C: Regular Studio Owner attempting to view all platform accounts -> Must be 403 Forbidden
    const forbiddenAccounts = await makeRequest('/admin/accounts', regularUserToken);
    console.log(`C. Regular Studio User GET /api/admin/accounts -> Status: ${forbiddenAccounts.status}`);
    if (forbiddenAccounts.status !== 403) throw new Error('Regular studio user was not blocked on /admin/accounts!');

    // Test D: Super Admin request to /api/admin/dashboard -> Must be 200 OK with real data
    const superAdminRes = await makeRequest('/admin/dashboard', superAdminToken);
    console.log(`D. Super Admin GET /api/admin/dashboard -> Status: ${superAdminRes.status}`);
    if (superAdminRes.status !== 200) throw new Error('Super Admin was denied access!');
    console.log('   Real KPI accounts count returned:', superAdminRes.data.data.kpiCards.totalAccounts.count);
    console.log('   Real verified revenue collected:', superAdminRes.data.data.kpiCards.totalRevenue.amountRupees);

    // Test E: Super Admin request to /api/admin/revenue -> Must be 200 OK
    const superAdminRev = await makeRequest('/admin/revenue', superAdminToken);
    console.log(`E. Super Admin GET /api/admin/revenue -> Status: ${superAdminRev.status}`);
    if (superAdminRev.status !== 200) throw new Error('Super Admin revenue query failed!');

    // Test F: Premium Plan does NOT allow Cashfree checkout session creation
    const membership = await prisma.business_members.findFirst({
      where: { user_id: superAdminUser.id },
    });
    const targetBusinessId = membership ? membership.business_id : '014e887f-febb-47d5-a73e-ce212efcffa2';

    const premiumCheckoutRes = await fetch(`${baseUrl}/subscriptions/${targetBusinessId}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${superAdminToken}`,
        'x-business-id': targetBusinessId,
      },
      body: JSON.stringify({
        planCode: 'EXCLUSIVE_LIFETIME',
        returnUrl: 'http://localhost:3000/subscription',
      }),
    });
    const premCheckData = await premiumCheckoutRes.json();
    console.log(`F. POST checkout for Premium (EXCLUSIVE_LIFETIME) -> Status: ${premiumCheckoutRes.status}`);
    console.log(`   Response Message: "${premCheckData.message}"`);
    if (premiumCheckoutRes.status !== 400 || !premCheckData.message.includes('Contact Sales')) {
      throw new Error('Premium plan checkout was not properly blocked with Contact Sales requirement!');
    }

    console.log('\n🎉 ALL Super Admin security and multi-tenant authorization boundaries verified successfully!');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

testAdminSecurityE2E().catch((err) => {
  console.error('❌ Security boundary test failed:', err);
  process.exit(1);
});
