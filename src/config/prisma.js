import { PrismaClient } from '@prisma/client';

/**
 * Resilient PrismaClient instance with automated retry logic
 * Handles transient remote host connection drops (Os error 10054 / ConnectionReset)
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  datasourceUrl: process.env.DATABASE_URL,
});

/**
 * Handle unexpected pool errors or connection resets smoothly
 */
export async function ensureDbConnection(retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      await prisma.$connect();
      return true;
    } catch (err) {
      console.warn(`[Prisma] Connection attempt ${i + 1}/${retries} notice:`, err.message);
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  return false;
}

export default prisma;

