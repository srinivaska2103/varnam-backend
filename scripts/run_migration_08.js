import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('--- RUNNING ADDITIVE MIGRATION 08: RAZORPAY SUBSCRIPTION FIELDS ---');
  const sqlPath = path.join(__dirname, '../prisma/migrations_additive/08_razorpay_subscription_fields.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  // Split commands safely
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    console.log(`Executing:\n${statement.substring(0, 80)}...`);
    await prisma.$executeRawUnsafe(statement);
  }

  console.log('✅ Migration 08 executed successfully!');
}

runMigration()
  .catch(err => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

