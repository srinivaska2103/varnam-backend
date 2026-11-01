import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function purgeTestData() {
  const keepBizIds = [
    '014e887f-febb-47d5-a73e-ce212efcffa2', // Dharshini Studio
    'bc13a984-dd2f-4c59-9ec1-874dff9d66a4', // Saritha Brindal Studio
    '0b8a0f72-ba63-4ae8-9485-83a24585eb5d', // Acchudhan's Bridal Studio
  ];

  const keepUserIds = [
    'd5c15f71-1552-461e-852c-1f5b05af7ca1', // Dharshini K A (kingsrinivas66@gmail.com)
    '26058324-042f-427f-8c95-b677cc31e65c', // srinivas K A (srinivaska2103@gmail.com)
    '6e974dfa-1239-42cb-8a78-d63bcd704ed8', // Acchudhan (testsrini276@gmail.com)
    '06a7444a-10e5-47c7-a1ce-6cf056145b93', // VEXA TECH Super Admin (vexatech.connect@gmail.com)
  ];

  console.log('Beginning transactional cleanup of test data...');

  await prisma.$transaction(async (tx) => {
    // 1. Delete associated business entities for test businesses
    await tx.customer_preferences.deleteMany({ where: { businesses: { id: { notIn: keepBizIds } } } });
    await tx.booking_status_history.deleteMany({ where: { bookings: { business_id: { notIn: keepBizIds } } } });
    await tx.booking_events.deleteMany({ where: { bookings: { business_id: { notIn: keepBizIds } } } });
    await tx.package_services.deleteMany({ where: { packages: { business_id: { notIn: keepBizIds } } } });
    await tx.stock_movements.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.inventory_items.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.payment_records.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.quotations.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.bookings.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.consultations.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.customers.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.services.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.packages.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.portfolio_items.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.expenses.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.enquiry_activities.deleteMany({ where: { enquiries: { business_id: { notIn: keepBizIds } } } });
    await tx.enquiries.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.enquiry_forms.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.attachments.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.notification_jobs.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.notification_preferences.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.audit_logs.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.business_websites.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.studio_about_sections.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.studio_business_hours.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.studio_footer_settings.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.subscription_orders.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.business_entitlements.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.campaigns.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.marketing_unsubscribes.deleteMany({ where: { business_id: { notIn: keepBizIds } } });
    await tx.premium_sales_enquiries.deleteMany({ where: { business_id: { notIn: keepBizIds } } });

    // 2. Remove business_members for test businesses and test users
    await tx.business_members.deleteMany({
      where: {
        OR: [
          { business_id: { notIn: keepBizIds } },
          { user_id: { notIn: keepUserIds } },
        ],
      },
    });

    // 3. Remove test businesses
    const delBiz = await tx.businesses.deleteMany({
      where: { id: { notIn: keepBizIds } },
    });
    console.log(`Deleted ${delBiz.count} test businesses.`);

    // 4. Remove user-level dependent records
    await tx.email_verifications.deleteMany({
      where: {
        email: {
          notIn: [
            'kingsrinivas66@gmail.com',
            'srinivaska2103@gmail.com',
            'testsrini276@gmail.com',
            'vexatech.connect@gmail.com',
          ],
        },
      },
    });

    // 5. Remove test users
    const delUsers = await tx.users.deleteMany({
      where: { id: { notIn: keepUserIds } },
    });
    console.log(`Deleted ${delUsers.count} test users.`);
  });

  console.log('Database cleanup completed successfully.');
}

purgeTestData()
  .catch((err) => {
    console.error('Error during purge:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
