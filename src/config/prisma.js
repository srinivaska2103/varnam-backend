import { PrismaClient } from '@prisma/client';

/**
 * Singleton instance of PrismaClient
 * Ensures a single connection pool across the application lifecycle.
 */
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

export default prisma;
