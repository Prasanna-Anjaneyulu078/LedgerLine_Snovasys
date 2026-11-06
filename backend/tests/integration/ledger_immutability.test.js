import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, getAdminPool, teardownTestDb } from '../helpers/testDb.js';
import { ledgerRepository } from '../../src/repositories/ledger.repository.js';

describe('Database-Level Append-Only Ledger Immutability & Role Permission Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test('Database Role & Privilege Verification - Runtime role has least-privilege permissions', async () => {
    const roleRes = await testPool.query('SELECT current_user, session_user;');
    expect(roleRes.rows[0].current_user).toBe('ledgerline_runtime');

    // Privilege checks using has_table_privilege
    const privRes = await testPool.query(`
      SELECT 
        has_table_privilege('ledgerline_runtime', 'ledger_entries', 'SELECT') as can_select,
        has_table_privilege('ledgerline_runtime', 'ledger_entries', 'INSERT') as can_insert,
        has_table_privilege('ledgerline_runtime', 'ledger_entries', 'UPDATE') as can_update,
        has_table_privilege('ledgerline_runtime', 'ledger_entries', 'DELETE') as can_delete,
        has_table_privilege('ledgerline_runtime', 'ledger_entries', 'TRUNCATE') as can_truncate;
    `);

    const privs = privRes.rows[0];
    expect(privs.can_select).toBe(true);
    expect(privs.can_insert).toBe(true);
    expect(privs.can_update).toBe(false);
    expect(privs.can_delete).toBe(false);
    expect(privs.can_truncate).toBe(false);

    // Verify trigger definition and status in information_schema
    const triggerRes = await testPool.query(`
      SELECT trigger_name, event_manipulation, action_timing, action_statement
      FROM information_schema.triggers
      WHERE event_object_table = 'ledger_entries' AND trigger_name = 'trg_prevent_ledger_modification';
    `);

    expect(triggerRes.rows.length).toBeGreaterThan(0);
    const trigger = triggerRes.rows[0];
    expect(trigger.trigger_name).toBe('trg_prevent_ledger_modification');
    expect(trigger.action_timing).toBe('BEFORE');
  });

  test('Requirement 1: A ledger INSERT succeeds under runtime role', async () => {
    // Create an explicit transaction record first
    const txnRes = await testPool.query(`
      INSERT INTO transactions (transaction_reference, transaction_type, destination_account_id, amount, status, initiated_by)
      VALUES ('TEST-INSERT-LE', 'DEPOSIT', $1, 2500, 'SUCCESS', $2)
      RETURNING id;
    `, [fixtures.aliceAccount.id, fixtures.alice.id]);

    const txnId = txnRes.rows[0].id;

    // Direct INSERT into ledger_entries via repository and raw SQL
    const entry = await ledgerRepository.create({
      transactionId: txnId,
      accountId: fixtures.aliceAccount.id,
      entryType: 'CREDIT',
      amount: 2500n,
      balanceAfter: 12500n,
    }, testPool);

    expect(entry).toBeDefined();
    expect(entry.id).toBeDefined();
    expect(entry.transaction_id).toBe(txnId);
    expect(entry.account_id).toBe(fixtures.aliceAccount.id);
    expect(entry.entry_type).toBe('CREDIT');
    expect(entry.amount).toBe(2500n);
    expect(entry.balance_after).toBe(12500n);
  });

  test('Requirement 2: A ledger SELECT succeeds under runtime role', async () => {
    // Select via raw query on runtime pool
    const res = await testPool.query(
      'SELECT id, transaction_id, account_id, entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at ASC;',
      [fixtures.aliceAccount.id]
    );

    expect(res.rows.length).toBeGreaterThan(0);
    const first = res.rows[0];
    expect(first.account_id).toBe(fixtures.aliceAccount.id);
    expect(first.entry_type).toBe('CREDIT');
    expect(first.amount).toBe(10000n);
    expect(first.balance_after).toBe(10000n);

    // Select via repository
    const stmt = await ledgerRepository.findByAccountId(fixtures.aliceAccount.id, {}, testPool);
    expect(stmt.entries.length).toBeGreaterThan(0);
    expect(stmt.total).toBeGreaterThanOrEqual(1);
  });

  test('Requirement 3: An UPDATE attempt is rejected (Privilege & Trigger Enforcement)', async () => {
    // Fetch existing ledger entry
    const entryRes = await testPool.query('SELECT id, amount, balance_after FROM ledger_entries LIMIT 1;');
    const entryId = entryRes.rows[0].id;

    // Layer 1: Under runtime role (ledgerline_runtime), UPDATE fails at SQL privilege level
    let runtimeErr = null;
    try {
      await testPool.query('UPDATE ledger_entries SET amount = 999999 WHERE id = $1;', [entryId]);
    } catch (err) {
      runtimeErr = err;
    }

    expect(runtimeErr).toBeDefined();
    expect(runtimeErr.code).toBe('42501'); // insufficient_privilege
    expect(runtimeErr.message).toMatch(/permission denied for table ledger_entries/i);

    // Layer 2: Under owner account (adminPool), UPDATE is intercepted and rejected by the trigger
    const adminPool = getAdminPool();
    let triggerErr = null;
    try {
      await adminPool.query('UPDATE ledger_entries SET amount = 999999 WHERE id = $1;', [entryId]);
    } catch (err) {
      triggerErr = err;
    }

    expect(triggerErr).toBeDefined();
    expect(triggerErr.code).toBe('23000'); // integrity_constraint_violation
    expect(triggerErr.message).toMatch(/Ledger entries are strictly append-only: UPDATE operations are prohibited/i);
  });

  test('Requirement 4: A DELETE attempt is rejected (Privilege & Trigger Enforcement)', async () => {
    // Fetch existing ledger entry
    const entryRes = await testPool.query('SELECT id FROM ledger_entries LIMIT 1;');
    const entryId = entryRes.rows[0].id;

    // Layer 1: Under runtime role, DELETE fails at SQL privilege level
    let runtimeErr = null;
    try {
      await testPool.query('DELETE FROM ledger_entries WHERE id = $1;', [entryId]);
    } catch (err) {
      runtimeErr = err;
    }

    expect(runtimeErr).toBeDefined();
    expect(runtimeErr.code).toBe('42501'); // insufficient_privilege
    expect(runtimeErr.message).toMatch(/permission denied for table ledger_entries/i);

    // Layer 2: Under owner account, DELETE is intercepted and rejected by the trigger
    const adminPool = getAdminPool();
    let triggerErr = null;
    try {
      await adminPool.query('DELETE FROM ledger_entries WHERE id = $1;', [entryId]);
    } catch (err) {
      triggerErr = err;
    }

    expect(triggerErr).toBeDefined();
    expect(triggerErr.code).toBe('23000'); // integrity_constraint_violation
    expect(triggerErr.message).toMatch(/Ledger entries are strictly append-only: DELETE operations are prohibited/i);
  });

  test('Requirement 5: The original ledger row remains unchanged after rejected operations', async () => {
    // 1. Capture exact baseline state of an existing row
    const beforeRes = await testPool.query(
      'SELECT id, transaction_id, account_id, entry_type, amount, balance_after, created_at FROM ledger_entries ORDER BY created_at ASC LIMIT 1;'
    );
    const originalRow = beforeRes.rows[0];

    const countBeforeRes = await testPool.query('SELECT count(*) as count FROM ledger_entries;');
    const countBefore = Number(countBeforeRes.rows[0].count);

    // 2. Attempt prohibited operations across roles
    await expect(testPool.query('UPDATE ledger_entries SET amount = 1 WHERE id = $1;', [originalRow.id])).rejects.toThrow();
    await expect(testPool.query('DELETE FROM ledger_entries WHERE id = $1;', [originalRow.id])).rejects.toThrow();

    const adminPool = getAdminPool();
    await expect(adminPool.query('UPDATE ledger_entries SET balance_after = 0 WHERE id = $1;', [originalRow.id])).rejects.toThrow();
    await expect(adminPool.query('DELETE FROM ledger_entries WHERE id = $1;', [originalRow.id])).rejects.toThrow();

    // 3. Verify the row remains completely unaltered
    const afterRes = await testPool.query(
      'SELECT id, transaction_id, account_id, entry_type, amount, balance_after, created_at FROM ledger_entries WHERE id = $1;',
      [originalRow.id]
    );
    const rowAfter = afterRes.rows[0];

    expect(rowAfter.id).toBe(originalRow.id);
    expect(rowAfter.transaction_id).toBe(originalRow.transaction_id);
    expect(rowAfter.account_id).toBe(originalRow.account_id);
    expect(rowAfter.entry_type).toBe(originalRow.entry_type);
    expect(rowAfter.amount).toBe(originalRow.amount);
    expect(rowAfter.balance_after).toBe(originalRow.balance_after);
    expect(new Date(rowAfter.created_at).getTime()).toBe(new Date(originalRow.created_at).getTime());

    // Verify row count remained identical
    const countAfterRes = await testPool.query('SELECT count(*) as count FROM ledger_entries;');
    expect(Number(countAfterRes.rows[0].count)).toBe(countBefore);
  });

  test('Requirement 6: Existing transaction workflows still create ledger entries successfully', async () => {
    // 1. Perform deposit via application API
    const depositRes = await request(app)
      .post('/api/v1/transactions/deposit')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '25.00', // 2,500 paise
        description: 'Salary advance',
      });

    expect(depositRes.status).toBe(200);
    expect(depositRes.body.success).toBe(true);

    // 2. Perform transfer via application API
    const transferRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '35.00', // 3,500 paise
        description: 'Dinner split',
      });

    expect(transferRes.status).toBe(200);
    expect(transferRes.body.success).toBe(true);

    // 3. Verify ledger entries for transfer in PostgreSQL
    const transferTxnId = transferRes.body.data.transactionId;
    const ledgerEntries = await ledgerRepository.findByTransactionId(transferTxnId, testPool);

    expect(ledgerEntries).toHaveLength(2);
    const debit = ledgerEntries.find((e) => e.entry_type === 'DEBIT');
    const credit = ledgerEntries.find((e) => e.entry_type === 'CREDIT');

    expect(debit).toBeDefined();
    expect(credit).toBeDefined();
    expect(debit.amount).toBe(3500n);
    expect(credit.amount).toBe(3500n);
    expect(debit.account_id).toBe(fixtures.aliceAccount.id);
    expect(credit.account_id).toBe(fixtures.bobAccount.id);

    // 4. Verify Accounting Invariant: Calculated Net Balance from ledger matches account balance
    const aliceCalculated = await ledgerRepository.calculateNetBalanceFromLedger(fixtures.aliceAccount.id, testPool);
    const aliceDbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.aliceAccount.id]);
    expect(BigInt(aliceCalculated)).toBe(BigInt(aliceDbAcc.rows[0].balance));

    const bobCalculated = await ledgerRepository.calculateNetBalanceFromLedger(fixtures.bobAccount.id, testPool);
    const bobDbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.bobAccount.id]);
    expect(BigInt(bobCalculated)).toBe(BigInt(bobDbAcc.rows[0].balance));
  });

  test('Requirement 7: A failed transaction rolls back without leaving partial ledger entries or balance changes', async () => {
    // 1. Baseline state
    const aliceBefore = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.aliceAccount.id]);
    const bobBefore = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.bobAccount.id]);
    const countBeforeRes = await testPool.query('SELECT count(*) as count FROM ledger_entries;');

    const aliceBalanceBefore = aliceBefore.rows[0].balance;
    const bobBalanceBefore = bobBefore.rows[0].balance;
    const countBefore = Number(countBeforeRes.rows[0].count);

    // 2. Attempt failed transaction via API (overdraft)
    const failRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '99999.00', // exceeds balance
        description: 'Excessive transfer attempt',
      });

    expect(failRes.status).toBe(400);

    // 3. Attempt transactional atomic rollback on runtime client directly
    const client = await testPool.connect();
    let abortedTxnId = null;
    try {
      await client.query('BEGIN;');

      // Create transaction record
      const txn = await client.query(`
        INSERT INTO transactions (transaction_reference, transaction_type, source_account_id, destination_account_id, amount, status, initiated_by)
        VALUES ('TEST-ROLLBACK-TXN', 'TRANSFER', $1, $2, 1000, 'PENDING', $3)
        RETURNING id;
      `, [fixtures.aliceAccount.id, fixtures.bobAccount.id, fixtures.alice.id]);
      abortedTxnId = txn.rows[0].id;

      // Debit ledger entry
      await client.query(`
        INSERT INTO ledger_entries (transaction_id, account_id, entry_type, amount, balance_after)
        VALUES ($1, $2, 'DEBIT', 1000, 9000);
      `, [abortedTxnId, fixtures.aliceAccount.id]);

      // Deduct balance
      await client.query('UPDATE accounts SET balance = balance - 1000 WHERE id = $1;', [fixtures.aliceAccount.id]);

      // Simulate mid-flight failure and explicit ROLLBACK
      throw new Error('Simulated network disconnect or invariant failure');
    } catch (simulatedErr) {
      await client.query('ROLLBACK;');
    } finally {
      client.release();
    }

    // 4. Verify complete database rollback: zero balance changes, zero orphan ledger entries
    const aliceAfter = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.aliceAccount.id]);
    const bobAfter = await testPool.query('SELECT balance FROM accounts WHERE id = $1;', [fixtures.bobAccount.id]);
    const countAfterRes = await testPool.query('SELECT count(*) as count FROM ledger_entries;');

    expect(aliceAfter.rows[0].balance).toBe(aliceBalanceBefore);
    expect(bobAfter.rows[0].balance).toBe(bobBalanceBefore);
    expect(Number(countAfterRes.rows[0].count)).toBe(countBefore);

    // Verify abortedTxnId has no ledger entries whatsoever
    if (abortedTxnId) {
      const orphanEntries = await testPool.query('SELECT * FROM ledger_entries WHERE transaction_id = $1;', [abortedTxnId]);
      expect(orphanEntries.rows).toHaveLength(0);
    }
  });
});

