import prisma from '../src/config/prisma.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('Running additive migration for business hours and about section...');
  const sqlFile = path.join(__dirname, '../prisma/migrations_additive/02_business_hours_and_about_section.sql');
  const sql = fs.readFileSync(sqlFile, 'utf8');

  // Execute raw SQL commands
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

  console.log('Migration completed successfully!');
  await prisma.$disconnect();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
