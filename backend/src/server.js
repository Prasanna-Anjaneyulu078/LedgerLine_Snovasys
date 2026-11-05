import app from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { checkDatabaseConnection, closePool } from './config/database.js';

let server;

async function startServer() {
  try {
    // Verify database connection at startup
    await checkDatabaseConnection();
    logger.info('Database connection verified successfully on startup');

    server = app.listen(env.PORT, () => {
      logger.info(`LedgerLine Core Server running on port ${env.PORT} in [${env.NODE_ENV}] mode`);
      logger.info(`Interactive API Documentation: http://localhost:${env.PORT}/api-docs`);
      logger.info(`Health check endpoint: http://localhost:${env.PORT}/health`);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start LedgerLine server due to initialization error');
    process.exit(1);
  }
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

