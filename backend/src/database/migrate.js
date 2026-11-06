import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

// Map expected core tables created by each migration file
const MIGRATION_TABLE_MAP = {
  '001_create_users.sql': 'users',
  '002_create_accounts.sql': 'accounts',
  '003_create_ledger_entries.sql': 'ledger_entries',
  '004_create_transactions.sql': 'transactions',
  '005_create_idempotency_keys.sql': 'idempotency_keys',
  '006_create_audit_events.sql': 'audit_events',
  '007_prevent_ledger_modification.sql': 'ledger_entries',
};

/**
 * Execute migrations against specified environment
 * @param {Object} options
 * @param {boolean} options.isTest - whether migrating the test database
 */
export async function runMigrations({ isTest = false } = {}) {
  const connectionString = isTest
    ? env.TEST_DIRECT_URL || env.TEST_DATABASE_URL
    : env.DIRECT_URL || env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      isTest
        ? 'No test database URL configured (TEST_DIRECT_URL or TEST_DATABASE_URL is required)'
        : 'No database URL configured (DIRECT_URL or DATABASE_URL is required)'
    );
  }

  const isSslRequired =
    connectionString.includes('sslmode=require') ||
    connectionString.includes('sslmode=verify-full') ||
    connectionString.includes('ssl=true');

  const client = new Client({
    connectionString,
    ssl: isSslRequired ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();

    // Verify database identity
    const dbIdentityRes = await client.query('SELECT current_database(), current_schema(), current_user;');
    const currentDb = dbIdentityRes.rows[0].current_database;
    const currentUser = dbIdentityRes.rows[0].current_user;

    logger.info(
      { database: currentDb, user: currentUser, isTest },
      `Connected to PostgreSQL for ${isTest ? 'TEST' : 'DEVELOPMENT'} migrations`
    );

    // Safeguard: Ensure test migrations do not run against production/development database
    if (isTest && !currentDb.toLowerCase().includes('test')) {
      throw new Error(
        `Safety violation: Test migrations must run against a database containing "test" (e.g., ledgerline_test). Current database is "${currentDb}". Aborting to prevent data corruption.`
      );
    }

    if (!isTest && currentDb.toLowerCase().includes('test')) {
      logger.warn(
        { database: currentDb },
        'Warning: Running development migrations against a test database name.'
      );
    }

    // 1. Ensure schema_migrations table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        migration_name VARCHAR(255) UNIQUE NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 2. Acquire transaction-level advisory lock (unique per DB) to prevent race conditions
    const lockKey = isTest ? 987654322 : 987654321;
    await client.query('SELECT pg_advisory_lock($1);', [lockKey]);

    // 3. Inspect existing tables in public schema
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    const existingTables = new Set(tablesRes.rows.map((r) => r.table_name));

    // 4. Fetch applied migration records
    const { rows: appliedRows } = await client.query('SELECT migration_name FROM schema_migrations;');
    const appliedSet = new Set(appliedRows.map((r) => r.migration_name));

    // 5. Read migration files in strictly sorted order
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const expectedTable = MIGRATION_TABLE_MAP[file];
      const isRecordedApplied = appliedSet.has(file);
      const tableExists = expectedTable ? existingTables.has(expectedTable) : true;

      // Schema verification check: Detect discrepancy if marked applied but table is missing
      if (isRecordedApplied && !tableExists) {
        logger.warn(
          { migration: file, expectedTable },
          'Schema Discrepancy Detected: Migration history claims file was applied, but table is missing. Repairing history...'
        );
        // Remove phantom record so migration can re-run safely
        await client.query('DELETE FROM schema_migrations WHERE migration_name = $1;', [file]);
        appliedSet.delete(file);
      } else if (isRecordedApplied && tableExists) {
        logger.info({ migration: file }, 'Migration verified and already applied, skipping');
        continue;
      }

      logger.info({ migration: file, targetDb: currentDb }, 'Applying migration');
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      await client.query('BEGIN;');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (migration_name) VALUES ($1) ON CONFLICT (migration_name) DO UPDATE SET applied_at = NOW();',
          [file]
        );
        await client.query('COMMIT;');
        logger.info({ migration: file }, 'Migration applied successfully');

        if (expectedTable) {
          existingTables.add(expectedTable);
        }
      } catch (migrationErr) {
        await client.query('ROLLBACK;');
        logger.error({ migration: file, err: migrationErr }, 'Migration failed, transaction rolled back');
        throw migrationErr;
      }
    }

    // Release advisory lock
    await client.query('SELECT pg_advisory_unlock($1);', [lockKey]);

    // Final schema integrity verification
    const finalTablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN (
        'users', 'accounts', 'transactions', 'ledger_entries', 'idempotency_keys', 'audit_events'
      );
    `);
    const verifiedTables = finalTablesRes.rows.map((r) => r.table_name);
    logger.info(
      { database: currentDb, verifiedTablesCount: verifiedTables.length, tables: verifiedTables },
      'All migrations verified successfully'
    );

    return {
      database: currentDb,
      appliedCount: files.length,
      verifiedTables,
    };
  } catch (err) {
    logger.error({ err }, 'Error during database migrations');
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

// Allow CLI execution: `node src/database/migrate.js` or `node src/database/migrate.js --test`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isTest = process.argv.includes('--test') || process.env.NODE_ENV === 'test';
  runMigrations({ isTest })
    .then((result) => {
      console.log(`Migrations completed successfully on database [${result.database}]. Verified tables: ${result.verifiedTables.join(', ')}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}
