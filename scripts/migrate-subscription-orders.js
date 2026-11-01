import prisma from '../src/config/prisma.js';

async function migrate() {
  console.log('Running subscription_orders migration...');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS subscription_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
      order_type VARCHAR(30) NOT NULL DEFAULT 'ONE_TIME',
      cf_order_id VARCHAR(120) UNIQUE,
      cf_subscription_id VARCHAR(120) UNIQUE,
      cf_session_id VARCHAR(255),
      amount_paise BIGINT NOT NULL,
      currency CHAR(3) NOT NULL DEFAULT 'INR',
      status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
      payment_method VARCHAR(60),
      paid_at TIMESTAMPTZ(6),
      cf_raw_response JSONB,
      error_message TEXT,
      created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
    )
  `);

  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_subs_orders_business ON subscription_orders(business_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_subs_orders_cf_order ON subscription_orders(cf_order_id)`);
  await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_subs_orders_cf_sub ON subscription_orders(cf_subscription_id)`);
  console.log('✅ subscription_orders table migrated successfully.');
}

migrate()
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
