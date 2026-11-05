import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env.js';
import { pool, closePool } from '../../src/config/database.js';
import { runMigrations } from '../../src/database/migrate.js';

// Unified connection pool for test assertions, fixtures, and app operations
export const testPool = pool;

/**
 * Truncate tables for a clean test run with strict safety checks
 */
export async function cleanDatabase() {
  const client = await testPool.connect();
  try {
    // 1. Strict safety check: Never truncate non-test databases
    const dbRes = await client.query('SELECT current_database() as db;');
    const dbName = dbRes.rows[0]?.db;
    if (!dbName || !dbName.toLowerCase().includes('test')) {
      throw new Error(
        `SAFETY CHECK ABORTED: Refusing to truncate database '${dbName}'. Test database name must contain 'test'.`
      );
    }

    // 2. Schema check: Verify required tables exist; if missing, auto-run test migrations
    const tableCheckRes = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('users', 'accounts', 'transactions', 'ledger_entries', 'idempotency_keys', 'audit_events');
    `);
    const existingTables = new Set(tableCheckRes.rows.map((r) => r.table_name));
    const requiredTables = ['users', 'accounts', 'transactions', 'ledger_entries', 'idempotency_keys', 'audit_events'];
    const missingTables = requiredTables.filter((t) => !existingTables.has(t));

    if (missingTables.length > 0) {
      client.release();
      await runMigrations({ isTest: true });
      return cleanDatabase();
    }

    // 3. Truncate in safe dependency order without outer transaction block to prevent deadlocks
    await client.query(
      'TRUNCATE TABLE idempotency_keys, audit_events, ledger_entries, transactions, accounts, users CASCADE;'
    );
  } finally {
    client.release();
  }
}

/**
 * Cleanly shuts down the shared database connection pool
 * to eliminate open handles and lingering TLS sockets
 */
export async function teardownTestDb() {
  try {
    await closePool();
    // Allow brief grace period for TLS close notify handshake to finish
    await new Promise((resolve) => setTimeout(resolve, 300));
  } catch {
    // ignore already ended pool
  }
}

/**
 * Seeds fixture users and accounts for test suites
 */
export async function seedTestFixtures() {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN;');

    const hash = await bcrypt.hash('Test@123456', 10);

    // 1. Create Users
    const adminRes = await client.query(`
      INSERT INTO users (full_name, email, password_hash, role, is_active)
      VALUES ('Admin User', 'admin@test.com', $1, 'ADMIN', true)
      RETURNING id, email, role;
    `, [hash]);

    const user1Res = await client.query(`
      INSERT INTO users (full_name, email, password_hash, role, is_active)
      VALUES ('Alice Tester', 'alice@test.com', $1, 'ACCOUNT_HOLDER', true)
      RETURNING id, email, role;
    `, [hash]);

    const user2Res = await client.query(`
      INSERT INTO users (full_name, email, password_hash, role, is_active)
      VALUES ('Bob Tester', 'bob@test.com', $1, 'ACCOUNT_HOLDER', true)
      RETURNING id, email, role;
    `, [hash]);

    const auditorRes = await client.query(`
      INSERT INTO users (full_name, email, password_hash, role, is_active)
      VALUES ('Auditor User', 'auditor@test.com', $1, 'AUDITOR', true)
      RETURNING id, email, role;
    `, [hash]);

    const admin = adminRes.rows[0];
    const alice = user1Res.rows[0];
    const bob = user2Res.rows[0];
    const auditor = auditorRes.rows[0];

    // 2. Create Accounts
    // Alice's Account: 10,000 paise (₹100.00)
    const aliceAccRes = await client.query(`
      INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
      VALUES ('TEST-ACC-ALICE-1', $1, 'SAVINGS', 'INR', 10000, 'ACTIVE')
      RETURNING id, account_number, balance;
    `, [alice.id]);

    // Bob's Account: 5,000 paise (₹50.00)
    const bobAccRes = await client.query(`
      INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
      VALUES ('TEST-ACC-BOB-1', $1, 'SAVINGS', 'INR', 5000, 'ACTIVE')
      RETURNING id, account_number, balance;
    `, [bob.id]);

    const aliceAccount = aliceAccRes.rows[0];
    const bobAccount = bobAccRes.rows[0];

    // Create initial ledger entries for accounts
    const txnAlice = await client.query(`
      INSERT INTO transactions (transaction_reference, transaction_type, destination_account_id, amount, status, initiated_by)
      VALUES ('INIT-ALICE', 'DEPOSIT', $1, 10000, 'SUCCESS', $2)
      RETURNING id;
    `, [aliceAccount.id, alice.id]);

    await client.query(`
      INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, balance_after)
      VALUES ($1, $2, 'CREDIT', 10000, 10000);
    `, [txnAlice.rows[0].id, aliceAccount.id]);

    const txnBob = await client.query(`
      INSERT INTO transactions (transaction_reference, transaction_type, destination_account_id, amount, status, initiated_by)
      VALUES ('INIT-BOB', 'DEPOSIT', $1, 5000, 'SUCCESS', $2)
      RETURNING id;
    `, [bobAccount.id, bob.id]);

    await client.query(`
      INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, balance_after)
      VALUES ($1, $2, 'CREDIT', 5000, 5000);
    `, [txnBob.rows[0].id, bobAccount.id]);

    await client.query('COMMIT;');

    return {
      admin,
      alice,
      bob,
      auditor,
      aliceAccount,
      bobAccount,
      tokens: {
        admin: jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, env.JWT_SECRET),
        alice: jwt.sign({ id: alice.id, email: alice.email, role: alice.role }, env.JWT_SECRET),
        bob: jwt.sign({ id: bob.id, email: bob.email, role: bob.role }, env.JWT_SECRET),
        auditor: jwt.sign({ id: auditor.id, email: auditor.email, role: auditor.role }, env.JWT_SECRET),
      },
    };
  } catch (err) {
    await client.query('ROLLBACK;');
    throw err;
  } finally {
    client.release();
  }
}

