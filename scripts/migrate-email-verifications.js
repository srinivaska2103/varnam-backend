import prisma from '../src/config/prisma.js';

async function migrate() {
  try {
    console.log('Ensuring email_verifications table exists...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(254) NOT NULL,
        otp_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMPTZ(6) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        max_attempts INT NOT NULL DEFAULT 5,
        is_consumed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now()
      );
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON email_verifications(expires_at);
    `);

    console.log('✅ email_verifications table is ready without modifying existing tables.');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

migrate();
