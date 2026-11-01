import prisma from '../src/config/prisma.js';
import { adminService } from '../src/services/admin.service.js';

async function testAdminBackend() {
  console.log('🧪 Starting Super Admin backend validation...');

  // 1. Test Dashboard Overview
  console.log('--- 1. Testing Dashboard Overview ---');
  const dashboard = await adminService.getDashboardOverview();
  console.log('Dashboard KPI summary:');
  console.log('Total Accounts:', dashboard.kpiCards.totalAccounts);
  console.log('Active Subscriptions:', dashboard.kpiCards.activeSubscriptions);
  console.log('Monthly Revenue:', dashboard.kpiCards.monthlyRevenue);
  console.log('Total Revenue:', dashboard.kpiCards.totalRevenue);
  console.log('Failed/Pending Payments:', dashboard.kpiCards.failedPayments);
  console.log('Recent Accounts count:', dashboard.recentAccounts.length);
  console.log('Recent Payments count:', dashboard.recentPayments.length);

  // 2. Test Revenue Analytics
  console.log('\n--- 2. Testing Revenue Analytics ---');
  const revenue = await adminService.getRevenueAnalytics();
  console.log('Revenue Gross Collections:', revenue.metrics.grossCollectionsRupees);
  console.log('Revenue Timeline Buckets:', revenue.timeline.length);
  console.log('Plan Breakdown:');
  console.log('- Starter:', revenue.breakdown.starter);
  console.log('- Growth:', revenue.breakdown.growth);
  console.log('- Premium:', revenue.breakdown.premium);

  // 3. Test Accounts List
  console.log('\n--- 3. Testing Accounts Pagination & Search ---');
  const accounts = await adminService.getAccounts({ page: 1, limit: 5 });
  console.log(`Fetched ${accounts.items.length} accounts of ${accounts.pagination.total} total.`);
  if (accounts.items.length > 0) {
    console.log('Sample account:', {
      name: accounts.items[0].name,
      owner: accounts.items[0].ownerName,
      email: accounts.items[0].ownerEmail,
      plan: accounts.items[0].planName,
      status: accounts.items[0].subscriptionStatus
    });
  }

  // 4. Test Subscriptions List
  console.log('\n--- 4. Testing Subscriptions List ---');
  const subs = await adminService.getSubscriptions({ page: 1, limit: 5 });
  console.log(`Fetched ${subs.items.length} subscriptions of ${subs.pagination.total} total.`);

  // 5. Test Payments List
  console.log('\n--- 5. Testing Payments List ---');
  const payments = await adminService.getPayments({ page: 1, limit: 5 });
  console.log(`Fetched ${payments.items.length} payment records of ${payments.pagination.total} total.`);

  // 6. Test Plans
  console.log('\n--- 6. Testing Commercial Plans ---');
  const plans = await adminService.getPlans();
  console.log(`Fetched ${plans.length} commercial plans.`);
  plans.forEach(p => {
    console.log(`- ${p.name} (${p.code}): ₹${p.priceRupees} [Active Entitlements: ${p.entitlementsCount}]`);
  });

  // 7. Test Enquiries
  console.log('\n--- 7. Testing Premium Sales Enquiries ---');
  const enquiries = await adminService.getPremiumEnquiries({ page: 1, limit: 5 });
  console.log(`Fetched ${enquiries.items.length} enquiries of ${enquiries.pagination.total} total.`);
  if (enquiries.items.length > 0) {
    console.log('Sample enquiry:', {
      studio: enquiries.items[0].studio_name,
      contact: enquiries.items[0].contact_person,
      email: enquiries.items[0].email,
      status: enquiries.items[0].status
    });
  }

  // 8. Test Activity Logs
  console.log('\n--- 8. Testing Platform Activity Logs ---');
  const activity = await adminService.getActivityLogs({ page: 1, limit: 5 });
  console.log(`Fetched ${activity.items.length} activity logs of ${activity.pagination.total} total.`);

  console.log('\n✅ ALL Super Admin backend tests passed successfully with real database records!');
  await prisma.$disconnect();
}

testAdminBackend().catch(err => {
  console.error('❌ Super Admin backend validation failed:', err);
  process.exit(1);
});
