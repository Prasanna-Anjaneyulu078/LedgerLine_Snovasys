import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { jest, describe, test, expect, beforeAll, beforeEach, afterEach, afterAll } from '@jest/globals';
import { cleanDatabase, teardownTestDb, testPool } from '../helpers/testDb.js';
import { seedDatabase } from '../../src/database/seed.js';
import { logger } from '../../src/config/logger.js';

const SEED_ENV_KEYS = [
  'SEED_ADMIN_PASSWORD',
  'SEED_AUDITOR_PASSWORD',
  'SEED_KAVI_PASSWORD',
  'SEED_RAVI_PASSWORD',
  'ALLOW_DEMO_SEED',
  'SEED_MIGRATE_LEGACY_USERS',
  'NODE_ENV',
];

function createGeneratedSeedPasswords() {
  return {
    SEED_ADMIN_PASSWORD: `AdminSeed!${crypto.randomBytes(10).toString('hex')}1A`,
    SEED_AUDITOR_PASSWORD: `AuditSeed!${crypto.randomBytes(10).toString('hex')}2B`,
    SEED_KAVI_PASSWORD: `KaviSeed!${crypto.randomBytes(10).toString('hex')}3C`,
    SEED_RAVI_PASSWORD: `RaviSeed!${crypto.randomBytes(10).toString('hex')}4D`,
  };
}

describe('Database Seeder Security & Idempotency Tests', () => {
  let originalEnvSnapshot;

  beforeAll(async () => {
    await cleanDatabase();
  });

  beforeEach(async () => {
    originalEnvSnapshot = Object.fromEntries(
      SEED_ENV_KEYS.map((key) => [key, process.env[key]])
    );
    await cleanDatabase();
    const generated = createGeneratedSeedPasswords();
    Object.assign(process.env, generated);
    delete process.env.ALLOW_DEMO_SEED;
    delete process.env.SEED_MIGRATE_LEGACY_USERS;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const key of SEED_ENV_KEYS) {
      if (originalEnvSnapshot[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnvSnapshot[key];
      }
    }
  });

  afterAll(async () => {
    await cleanDatabase();
    await teardownTestDb();
  });

  test('Fresh seeding creates all 4 demo identities with bcrypt hashes, 3 accounts, transactions, ledger entries, and audit events without logging secrets', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await seedDatabase();

    const usersRes = await testPool.query(
      'SELECT id, full_name, email, password_hash, role, is_active FROM users ORDER BY email ASC'
    );
    expect(usersRes.rows).toHaveLength(4);

    const byEmail = Object.fromEntries(usersRes.rows.map((u) => [u.email, u]));
    expect(byEmail['prasanna.admin@example.com']).toMatchObject({
      full_name: 'Prasanna Anjaneyulu',
      role: 'ADMIN',
      is_active: true,
    });
    expect(byEmail['sasank.auditor@example.com']).toMatchObject({
      full_name: 'Sasank',
      role: 'AUDITOR',
      is_active: true,
    });
    expect(byEmail['kavi@example.com']).toMatchObject({
      full_name: 'Kavi',
      role: 'ACCOUNT_HOLDER',
      is_active: true,
    });
    expect(byEmail['ravi@example.com']).toMatchObject({
      full_name: 'Ravi',
      role: 'ACCOUNT_HOLDER',
      is_active: true,
    });

    // Verify bcrypt hashes were created from environment variables and never stored in plaintext
    expect(byEmail['prasanna.admin@example.com'].password_hash).not.toBe(process.env.SEED_ADMIN_PASSWORD);
    expect(await bcrypt.compare(process.env.SEED_ADMIN_PASSWORD, byEmail['prasanna.admin@example.com'].password_hash)).toBe(true);
    expect(await bcrypt.compare(process.env.SEED_AUDITOR_PASSWORD, byEmail['sasank.auditor@example.com'].password_hash)).toBe(true);
    expect(await bcrypt.compare(process.env.SEED_KAVI_PASSWORD, byEmail['kavi@example.com'].password_hash)).toBe(true);
    expect(await bcrypt.compare(process.env.SEED_RAVI_PASSWORD, byEmail['ravi@example.com'].password_hash)).toBe(true);

    // Verify accounts and opening balances
    const accountsRes = await testPool.query(
      'SELECT account_number, owner_id, account_type, balance, status FROM accounts ORDER BY account_number ASC'
    );
    expect(accountsRes.rows).toHaveLength(3);
    const accMap = Object.fromEntries(accountsRes.rows.map((a) => [a.account_number, a]));
    expect(accMap['LL-ACC-1001']).toMatchObject({
      owner_id: byEmail['kavi@example.com'].id,
      account_type: 'SAVINGS',
      balance: 500000n,
      status: 'ACTIVE',
    });
    expect(accMap['LL-ACC-1002']).toMatchObject({
      owner_id: byEmail['kavi@example.com'].id,
      account_type: 'CHECKING',
      balance: 250000n,
      status: 'ACTIVE',
    });
    expect(accMap['LL-ACC-2001']).toMatchObject({
      owner_id: byEmail['ravi@example.com'].id,
      account_type: 'SAVINGS',
      balance: 1000000n,
      status: 'ACTIVE',
    });

    const txnsRes = await testPool.query('SELECT transaction_reference, amount, status FROM transactions');
    expect(txnsRes.rows).toHaveLength(3);

    const ledgerRes = await testPool.query('SELECT entry_type, amount FROM ledger_entries');
    expect(ledgerRes.rows).toHaveLength(3);

    const auditRes = await testPool.query("SELECT action, resource_type FROM audit_events WHERE action = 'INITIAL_SEED_DEPOSIT'");
    expect(auditRes.rows).toHaveLength(3);

    // Ensure no passwords or bcrypt hashes were logged anywhere
    const allLoggedText = JSON.stringify([
      ...infoSpy.mock.calls,
      ...warnSpy.mock.calls,
      ...errorSpy.mock.calls,
      ...consoleLogSpy.mock.calls,
      ...consoleErrorSpy.mock.calls,
    ]);
    for (const key of ['SEED_ADMIN_PASSWORD', 'SEED_AUDITOR_PASSWORD', 'SEED_KAVI_PASSWORD', 'SEED_RAVI_PASSWORD']) {
      expect(allLoggedText).not.toContain(process.env[key]);
    }
    for (const u of usersRes.rows) {
      expect(allLoggedText).not.toContain(u.password_hash);
    }
    expect(allLoggedText).not.toMatch(/\$2[aby]\$/);
  });

  test('Repeated seeding is strictly idempotent and does not duplicate rows', async () => {
    await seedDatabase();
    const firstUsers = await testPool.query('SELECT id, email, password_hash, role FROM users ORDER BY email ASC');

    // Re-run with changed env passwords to also verify no password reset happens
    Object.assign(process.env, createGeneratedSeedPasswords());
    await seedDatabase();

    const secondUsers = await testPool.query('SELECT id, email, password_hash, role FROM users ORDER BY email ASC');
    expect(secondUsers.rows).toEqual(firstUsers.rows);

    const counts = await testPool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS users,
        (SELECT COUNT(*)::int FROM accounts) AS accounts,
        (SELECT COUNT(*)::int FROM transactions) AS transactions,
        (SELECT COUNT(*)::int FROM ledger_entries) AS ledger_entries,
        (SELECT COUNT(*)::int FROM audit_events WHERE action = 'INITIAL_SEED_DEPOSIT') AS audit_events
    `);
    expect(counts.rows[0]).toEqual({
      users: 4,
      accounts: 3,
      transactions: 3,
      ledger_entries: 3,
      audit_events: 3,
    });
  });

  test('Existing users preserve ID, rotated password hash, modified role, display name, and is_active across seed runs', async () => {
    const customPassword = `CustomPass!${crypto.randomBytes(10).toString('hex')}9Z`;
    const customHash = await bcrypt.hash(customPassword, 10);

    const inserted = await testPool.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ('Kavi Custom Name', 'kavi@example.com', $1, 'AUDITOR', false)
       RETURNING id, email, password_hash, role, is_active`,
      [customHash]
    );
    const existingKavi = inserted.rows[0];

    await seedDatabase();

    const afterRes = await testPool.query(
      'SELECT id, full_name, email, password_hash, role, is_active FROM users WHERE id = $1',
      [existingKavi.id]
    );
    expect(afterRes.rows[0]).toEqual({
      id: existingKavi.id,
      full_name: 'Kavi Custom Name',
      email: 'kavi@example.com',
      password_hash: customHash,
      role: 'AUDITOR',
      is_active: false,
    });
    expect(await bcrypt.compare(customPassword, afterRes.rows[0].password_hash)).toBe(true);
    expect(await bcrypt.compare(process.env.SEED_KAVI_PASSWORD, afterRes.rows[0].password_hash)).toBe(false);
  });

  test('Account ownership and balance are never reassigned if an existing seeded account belongs to another owner', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    const altPasswordHash = await bcrypt.hash(`AltOwner!${crypto.randomBytes(8).toString('hex')}5X`, 10);
    const altOwnerRes = await testPool.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ('Existing Real Owner', 'real.owner@example.com', $1, 'ACCOUNT_HOLDER', true)
       RETURNING id`,
      [altPasswordHash]
    );
    const realOwnerId = altOwnerRes.rows[0].id;

    await testPool.query(
      `INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
       VALUES ('LL-ACC-1001', $1, 'SAVINGS', 'INR', 987654, 'ACTIVE')`,
      [realOwnerId]
    );

    await seedDatabase();

    const accRes = await testPool.query(
      "SELECT owner_id, balance, status FROM accounts WHERE account_number = 'LL-ACC-1001'"
    );
    expect(accRes.rows[0]).toEqual({
      owner_id: realOwnerId,
      balance: 987654n,
      status: 'ACTIVE',
    });

    const txnRes = await testPool.query(
      "SELECT id FROM transactions WHERE transaction_reference = 'INIT-DEP-LL-ACC-1001'"
    );
    expect(txnRes.rows).toHaveLength(0);
    expect(warnSpy).toHaveBeenCalled();
  });

  test('Legacy user migration is disabled by default and preserves credentials/role when explicitly opted in', async () => {
    const legacyPassword = `LegacyPass!${crypto.randomBytes(10).toString('hex')}7L`;
    const legacyHash = await bcrypt.hash(legacyPassword, 10);

    const legacyInsert = await testPool.query(
      `INSERT INTO users (full_name, email, password_hash, role, is_active)
       VALUES ('Alice Legacy', 'alice@example.com', $1, 'AUDITOR', true)
       RETURNING id`,
      [legacyHash]
    );
    const legacyId = legacyInsert.rows[0].id;

    // Default run: no migration, no overwrite
    await seedDatabase();
    const afterDefault = await testPool.query(
      'SELECT id, email, full_name, password_hash, role FROM users WHERE id = $1',
      [legacyId]
    );
    expect(afterDefault.rows[0]).toEqual({
      id: legacyId,
      email: 'alice@example.com',
      full_name: 'Alice Legacy',
      password_hash: legacyHash,
      role: 'AUDITOR',
    });
    const kaviAfterDefault = await testPool.query(
      "SELECT id FROM users WHERE email = 'kavi@example.com'"
    );
    expect(kaviAfterDefault.rows).toHaveLength(0);

    // Explicit opt-in migration: updates email/full_name while preserving id, password_hash, role
    await seedDatabase({ migrateLegacyUsers: true });
    const afterOptIn = await testPool.query(
      'SELECT id, email, full_name, password_hash, role FROM users WHERE id = $1',
      [legacyId]
    );
    expect(afterOptIn.rows[0]).toEqual({
      id: legacyId,
      email: 'kavi@example.com',
      full_name: 'Kavi',
      password_hash: legacyHash,
      role: 'AUDITOR',
    });
  });

  test('Rejects execution when required seed password environment variables are missing', async () => {
    delete process.env.SEED_ADMIN_PASSWORD;

    await expect(seedDatabase()).rejects.toThrow(/Missing required seed password environment variable.*SEED_ADMIN_PASSWORD/i);

    const usersRes = await testPool.query('SELECT COUNT(*)::int AS count FROM users');
    expect(usersRes.rows[0].count).toBe(0);
  });

  test('Refuses execution in production environment without modifying database', async () => {
    await expect(seedDatabase({ nodeEnv: 'production' })).rejects.toThrow(/production/i);

    process.env.NODE_ENV = 'production';
    await expect(seedDatabase()).rejects.toThrow(/production/i);

    const usersRes = await testPool.query('SELECT COUNT(*)::int AS count FROM users');
    expect(usersRes.rows[0].count).toBe(0);
  });

  test('Requires explicit ALLOW_DEMO_SEED opt-in in non-test environments and honors ALLOW_DEMO_SEED=false', async () => {
    await expect(seedDatabase({ nodeEnv: 'development' })).rejects.toThrow(/explicit opt-in/i);

    process.env.ALLOW_DEMO_SEED = 'false';
    await expect(seedDatabase()).rejects.toThrow(/explicit opt-in/i);

    const usersRes = await testPool.query('SELECT COUNT(*)::int AS count FROM users');
    expect(usersRes.rows[0].count).toBe(0);
  });
});

