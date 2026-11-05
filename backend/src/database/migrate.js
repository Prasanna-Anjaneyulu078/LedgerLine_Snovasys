import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

export async function runMigrations() {
  const connectionString = env.DIRECT_URL || env.DATABASE_URL;
  const isSslRequired = connectionString.includes('sslmode=require');

  const client = new Client({
    connectionString,
    ssl: isSslRequired ? { rejectUnauthorized: false } : false,
  });

  try {
    await client.connect();
    logger.info('Connected to PostgreSQL for migrations');

    // Create schema_migrations table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Acquire PostgreSQL transaction-level advisory lock to prevent concurrent migrations
    await client.query('SELECT pg_advisory_lock(987654321);');

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const { rows: appliedRows } = await client.query('SELECT migration_name FROM schema_migrations;');
    const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

    for (const file of files) {
      if (appliedSet.has(file)) {
        logger.info({ migration: file }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ migration: file }, 'Applying migration');
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN;');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (migration_name) VALUES ($1);', [file]);
        await client.query('COMMIT;');
        logger.info({ migration: file }, 'Migration applied successfully');
      } catch (migrationErr) {
        await client.query('ROLLBACK;');
        logger.error({ migration: file, err: migrationErr }, 'Migration failed, transaction rolled back');
        throw migrationErr;
      }
    }

    await client.query('SELECT pg_advisory_unlock(987654321);');
    logger.info('All migrations executed successfully');
  } catch (err) {
    logger.error({ err }, 'Error running database migrations');
    throw err;
  } finally {
    await client.end();
  }
}

// Allow direct execution: `node src/database/migrate.js`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

