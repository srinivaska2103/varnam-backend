import 'dotenv/config';
import app from './app.js';
import prisma from './config/prisma.js';
import { env } from './config/env.js';
import { notificationService } from './services/notification.service.js';

let server;

/**
 * Connect to PostgreSQL before accepting requests
 */
async function startServer() {
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    // Verify PostgreSQL connection using a direct lightweight query
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ PostgreSQL database connected successfully.');

    // Start Express server
    const PORT = env.PORT;
    server = app.listen(PORT, () => {
      console.log(`🚀 Bridal & Makeup Business Management API is running in ${env.NODE_ENV} mode on port ${PORT}`);
      console.log(`📍 Health Check: http://localhost:${PORT}/api/health`);
    });

    // Run an immediate worker cycle on server startup to drain any queued jobs
    notificationService.runBackgroundWorkerCycle().catch((e) => {
      console.error('[NotificationWorker] Startup cycle error:', e.message);
    });

    // Run background worker for notifications & reminders every 15 seconds
    const workerInterval = setInterval(() => {
      notificationService.runBackgroundWorkerCycle().catch((e) => {
        console.error('[NotificationWorker] Interval error:', e.message);
      });
    }, 15000);
    // Unref so worker does not prevent shutdown
    workerInterval.unref();

  } catch (error) {
    console.error('❌ Failed to start server due to database connection error:');
    console.error(error.message || error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handlers
 */
async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      console.log('🔌 HTTP server closed.');
      try {
        await prisma.$disconnect();
        console.log('📦 PostgreSQL connection pool closed gracefully.');
        process.exit(0);
      } catch (err) {
        console.error('❌ Error during database disconnection:', err);
        process.exit(1);
      }
    });
  } else {
    await prisma.$disconnect();
    process.exit(0);
  }
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

startServer();
