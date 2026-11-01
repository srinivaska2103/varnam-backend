import fs from 'fs';
import prisma from '../src/config/prisma.js';

async function main() {
  const sql = fs.readFileSync('./prisma/migrations_additive/06_booking_cancellation_refunds.sql', 'utf8');
  // Run individual statements
  const statements = [
    `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS approved_refundable_paise BIGINT NOT NULL DEFAULT 0;`,
    `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_approval_notes TEXT;`,
    `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL;`,
    `ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS refund_approved_at TIMESTAMPTZ(6);`,
    `DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM pg_type t 
            JOIN pg_enum e ON t.oid = e.enumtypid 
            WHERE t.typname = 'payment_status' AND e.enumlabel = 'PENDING_REFUND'
        ) THEN
            ALTER TYPE public.payment_status ADD VALUE 'PENDING_REFUND';
        END IF;
    END $$;`
  ];

  for (const stmt of statements) {
    console.log('Executing:', stmt.trim().slice(0, 50));
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log('✅ Migration 06 executed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
