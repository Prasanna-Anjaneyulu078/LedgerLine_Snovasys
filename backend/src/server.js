import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseConnection, closePool } from './config/database.js';

let server;

async function startServer() {
  let dbStatus = 'DISCONNECTED';
  try {
    // Verify database connection at startup
    await checkDatabaseConnection();
    dbStatus = 'CONNECTED';
  } catch (error) {
    logger.fatal({ error }, 'Failed to start LedgerLine server due to database connection error');
    process.exit(1);
  }

  server = app.listen(env.PORT, () => {
    const banner = [
      '==================================================',
      '                 LEDGERLINE API',
      '==================================================',
      `Environment       : ${env.NODE_ENV}`,
      'Server Status     : RUNNING',
      `Server URL        : http://localhost:${env.PORT}`,
      `Health Check      : http://localhost:${env.PORT}/health`,
      `API Base URL      : http://localhost:${env.PORT}/api/v1`,
      `API Documentation : http://localhost:${env.PORT}/api-docs`,
      `Database          : ${dbStatus}`,
      '--------------------------------------------------',
      'Demonstration Credentials (Local Development Only):',
      '1. Admin          : prasanna.admin@example.com / Prasanna@LL26#Admin',
      '2. Auditor        : sasank.auditor@example.com / Sasank@LL26#Audit',
      '3. Account Holder : kavi@example.com / Kavi@LL26#User01',
      '   (User 2 - Ravi): ravi@example.com / Ravi@LL26#User02',
      'WARNING: Demonstration credentials only. Never use in production.',
      '==================================================',
    ].join('\n');

    console.log(`\n${banner}\n`);
  });
}

// Graceful Shutdown Handler
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed successfully');
      try {
        await closePool();
        logger.info('All connections terminated cleanly. Exiting.');
        process.exit(0);
      } catch (poolErr) {
        logger.error({ poolErr }, 'Error closing database pool during shutdown');
        process.exit(1);
      }
    });
  } else {
    process.exit(0);
  }

  // Force exit if graceful shutdown hangs
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcing process exit.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ reason, promise }, 'Unhandled Rejection at Promise');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught Exception thrown');
  process.exit(1);
});

startServer();

