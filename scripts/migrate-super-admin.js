import prisma from '../src/config/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('Running additive migration for super admin and premium enquiries...');
  const sqlFile = path.join(__dirname, '../prisma/migrations_additive/05_super_admin_and_enquiries.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (err) {
      console.error('Error executing statement:', statement, err.message);
      throw err;
    }
  }

  // Backfill existing audit log enquiry into premium_sales_enquiries if empty
  const count = await prisma.$queryRawUnsafe('SELECT COUNT(*)::int as count FROM public.premium_sales_enquiries;');
  if (count[0]?.count === 0) {
    console.log('Backfilling genuine contact sales enquiries from audit_logs...');
    const auditLogs = await prisma.audit_logs.findMany({
      where: { action: 'PREMIUM_CONTACT_SALES_SUBMITTED' },
      include: { businesses: true }
    });

    for (const log of auditLogs) {
      const details = log.details || {};
      await prisma.$executeRawUnsafe(`
        INSERT INTO public.premium_sales_enquiries 
        (business_id, studio_name, contact_person, email, phone, requested_plan, status, requirements, created_at, updated_at)
        VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz)
      `, 
        log.business_id,
        details.businessName || log.businesses?.name || 'Bridal Studio',
        details.contactName || 'Valued Studio Owner',
        details.email || 'studio@example.com',
        details.phone || '9999999999',
        details.interestedPlan || 'Premium — ₹29,999 (EXCLUSIVE_LIFETIME)',
        'NEW',
        details.requirements || 'Interested in Premium plan',
        log.created_at.toISOString()
      );
    }
  }

  console.log('Migration 05 completed successfully!');
  await prisma.$disconnect();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
