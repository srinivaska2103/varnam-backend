import prisma from '../src/config/prisma.js';

export async function seedPlans() {
  try {
    console.log('Seeding commercial plans and feature matrices...');

    // 1. Starter Monthly Plan (₹599 / month)
    const starterPlan = await prisma.plans.upsert({
      where: { code: 'BASIC_MONTHLY' },
      update: {
        name: 'Starter Monthly',
        billing_type: 'RECURRING',
        billing_interval: 'MONTHLY',
        price_paise: BigInt(59900), // ₹599.00 in paise
        currency: 'INR',
        description: 'Core business management suite for bridal and makeup studios.',
        is_active: true,
      },
      create: {
        code: 'BASIC_MONTHLY',
        name: 'Starter Monthly',
        billing_type: 'RECURRING',
        billing_interval: 'MONTHLY',
        price_paise: BigInt(59900),
        currency: 'INR',
        description: 'Core business management suite for bridal and makeup studios.',
        is_active: true,
      },
    });

    // 2. Growth Monthly Plan (₹999 / month)
    const growthPlan = await prisma.plans.upsert({
      where: { code: 'GROWTH_MONTHLY' },
      update: {
        name: 'Growth Monthly',
        billing_type: 'RECURRING',
        billing_interval: 'MONTHLY',
        price_paise: BigInt(99900), // ₹999.00 in paise
        currency: 'INR',
        description: 'Complete studio management with branded public website, catalogues, portfolio showcase, and website enquiry handling.',
        is_active: true,
      },
      create: {
        code: 'GROWTH_MONTHLY',
        name: 'Growth Monthly',
        billing_type: 'RECURRING',
        billing_interval: 'MONTHLY',
        price_paise: BigInt(99900),
        currency: 'INR',
        description: 'Complete studio management with branded public website, catalogues, portfolio showcase, and website enquiry handling.',
        is_active: true,
      },
    });

    // 3. Premium One-Time Plan (₹29,999 one-time)
    const premiumPlan = await prisma.plans.upsert({
      where: { code: 'EXCLUSIVE_LIFETIME' },
      update: {
        name: 'Premium One-Time',
        billing_type: 'ONE_TIME',
        billing_interval: null,
        price_paise: BigInt(2999900), // ₹29,999.00 in paise
        currency: 'INR',
        description: 'All Growth features plus custom domain name, dedicated hosting, and 1 year included domain/hosting.',
        is_active: true,
      },
      create: {
        code: 'EXCLUSIVE_LIFETIME',
        name: 'Premium One-Time',
        billing_type: 'ONE_TIME',
        billing_interval: null,
        price_paise: BigInt(2999900),
        currency: 'INR',
        description: 'All Growth features plus custom domain name, dedicated hosting, and 1 year included domain/hosting.',
        is_active: true,
      },
    });

    // Core features included in all plans (Starter, Growth, Premium)
    const starterCoreFeatures = [
      'BUSINESS_MANAGEMENT',
      'CUSTOMER_MANAGEMENT',
      'ENQUIRY_MANAGEMENT',
      'BOOKING_MANAGEMENT',
      'CONSULTATIONS',
      'PAYMENT_TRACKING',
      'SERVICES_AND_PACKAGES',
      'QUOTATIONS',
      'EXPENSES',
      'INVENTORY_MANAGEMENT',
      'DASHBOARD_ANALYTICS',
      'NOTIFICATIONS',
      'EMAIL_NOTIFICATIONS',
      'CUSTOM_ENQUIRY_FORM',
    ];

    // Growth features (includes website, public catalogues, portfolio, consultation requests, location sharing)
    const growthFeatures = [
      ...starterCoreFeatures,
      'BRANDED_WEBSITE',
      'PUBLIC_SERVICE_CATALOGUE',
      'PORTFOLIO_SHOWCASE',
      'WEBSITE_ENQUIRY_FORM',
      'CONSULTATION_REQUESTS',
      'LOCATION_SHARING',
    ];

    // Premium features (all Growth features + Custom domain and dedicated hosting)
    const premiumFeatures = [
      ...growthFeatures,
      'CUSTOM_DOMAIN_SUPPORT',
      'DEDICATED_HOSTING',
    ];

    const allKnownFeatures = [
      ...new Set([...starterCoreFeatures, ...growthFeatures, ...premiumFeatures, 'CUSTOM_DOMAIN_SUPPORT', 'DEDICATED_HOSTING']),
    ];

    // 1. Seed Starter Plan Features
    for (const feat of allKnownFeatures) {
      const isEnabled = starterCoreFeatures.includes(feat);
      await prisma.plan_features.upsert({
        where: {
          plan_id_feature_key: {
            plan_id: starterPlan.id,
            feature_key: feat,
          },
        },
        update: { enabled: isEnabled },
        create: {
          plan_id: starterPlan.id,
          feature_key: feat,
          enabled: isEnabled,
        },
      });
    }

    // 2. Seed Growth Plan Features
    for (const feat of allKnownFeatures) {
      const isEnabled = growthFeatures.includes(feat);
      await prisma.plan_features.upsert({
        where: {
          plan_id_feature_key: {
            plan_id: growthPlan.id,
            feature_key: feat,
          },
        },
        update: { enabled: isEnabled },
        create: {
          plan_id: growthPlan.id,
          feature_key: feat,
          enabled: isEnabled,
        },
      });
    }

    // 3. Seed Premium Plan Features
    for (const feat of allKnownFeatures) {
      const isEnabled = premiumFeatures.includes(feat);
      await prisma.plan_features.upsert({
        where: {
          plan_id_feature_key: {
            plan_id: premiumPlan.id,
            feature_key: feat,
          },
        },
        update: { enabled: isEnabled },
        create: {
          plan_id: premiumPlan.id,
          feature_key: feat,
          enabled: isEnabled,
        },
      });
    }

    console.log('✅ Commercial plans and feature matrices seeded successfully.');
    return { starterPlan, growthPlan, premiumPlan };
  } catch (err) {
    console.error('Error seeding plans:', err);
    throw err;
  }
}

// Allow direct execution
if (process.argv[1]?.includes('seed-plans.js')) {
  seedPlans().finally(() => prisma.$disconnect());
}
