import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import prisma from '../src/config/prisma.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  console.log('🔄 Running Additive Migration 07: WhatsApp Templates & Tracking...');
  const sqlFile = path.join(__dirname, '../prisma/migrations_additive/07_whatsapp_templates_and_tracking.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    console.log('Executing:', stmt.slice(0, 60).replace(/\n/g, ' '));
    await prisma.$executeRawUnsafe(stmt);
  }

  console.log('✅ Migration 07 applied successfully!');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌ Migration 07 failed:', err);
  process.exit(1);
});

