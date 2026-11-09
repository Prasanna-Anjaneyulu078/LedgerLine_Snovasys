import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

describe('Concurrency Safety & Race Condition Protection Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ========================================================
  // Test D — Two racing withdrawals
  // ========================================================
  test('Test D — Two racing withdrawals exceeding available balance allow at most one success and prevent negative balance', async () => {
    // 1. Prepare a test account with known balance: ₹500.00 (50,000 paise)
    // Deposit ₹400.00 into Alice's account (initial 10,000 paise + 40,000 paise = 50,000 paise)
    const setupDeposit = await testPool.query(
      'UPDATE accounts SET balance = 50000 WHERE id = $1 RETURNING balance, account_number',
      [fixtures.aliceAccount.id]
    );
    expect(setupDeposit.rows[0].balance).toBe(50000n);
    const aliceAccNum = setupDeposit.rows[0].account_number;

    // 2. Submit two concurrent withdrawal requests that together exceed the available balance:
    // Withdrawal A: ₹400.00 (40,000 paise)
    // Withdrawal B: ₹300.00 (30,000 paise)
    // Total requested = ₹700.00 (70,000 paise) > ₹500.00 (50,000 paise) available!
    // Using distinct idempotency keys for the two independent withdrawal requests.
    const reqA = request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'c0000000-0000-4000-8000-000000000001')
      .send({
        accountNumber: aliceAccNum,
        amount: '400.00',
        description: 'Racing withdrawal A (₹400.00)',
      });

    const reqB = request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'c0000000-0000-4000-8000-000000000002')
      .send({
        accountNumber: aliceAccNum,
        amount: '300.00',
        description: 'Racing withdrawal B (₹300.00)',
      });

    // Execute in TRUE parallel via Promise.all
    const [resA, resB] = await Promise.all([reqA, reqB]);

    const statuses = [resA.status, resB.status];
    // Expected: At most one withdrawal succeeds (200), the other fails due to insufficient funds (400)
    expect(statuses).toContain(200);
    expect(statuses).toContain(400);

    const successfulRes = resA.status === 200 ? resA : resB;
    const failedRes = resA.status === 400 ? resA : resB;
    expect(failedRes.body.message).toMatch(/Insufficient funds/i);

    // Database verification:
    // 1. Verify final balance in PostgreSQL:
    const dbAccount = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [
      fixtures.aliceAccount.id,
    ]);
    const finalBalance = dbAccount.rows[0].balance;

    // If A won: 50,000 - 40,000 = 10,000 paise (₹100.00)
    // If B won: 50,000 - 30,000 = 20,000 paise (₹200.00)
    expect([10000n, 20000n]).toContain(finalBalance);
    // CRITICAL: Guarantee no negative balance
    expect(finalBalance).toBeGreaterThanOrEqual(0n);

    // 2. Transaction records reflect the actual outcome: exactly 1 SUCCESS withdrawal
    const txnRows = await testPool.query(
      "SELECT id, amount, status FROM transactions WHERE source_account_id = $1 AND transaction_type = 'WITHDRAWAL'",
      [fixtures.aliceAccount.id]
    );
    expect(txnRows.rows).toHaveLength(1);
    expect(txnRows.rows[0].status).toBe('SUCCESS');
    expect(txnRows.rows[0].id).toBe(successfulRes.body.data.transactionId);

    // 3. No partial or duplicate ledger entries: exactly 1 DEBIT ledger entry for this account
    const ledgerRows = await testPool.query(
      "SELECT id, amount, balance_after, entry_type FROM ledger_entries WHERE account_id = $1 AND entry_type = 'DEBIT'",
      [fixtures.aliceAccount.id]
    );
    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0].balance_after).toBe(finalBalance);
  });

  // ========================================================
  // Test E — Opposite-direction transfers
  // ========================================================
  test('Test E — Opposite-direction transfers complete without deadlocks, with balanced ledger and money conservation', async () => {
    // Prepare two accounts with known sufficient balances:
    // Alice Account: ₹500.00 (50,000 paise)
    // Bob Account: ₹500.00 (50,000 paise)
    await testPool.query('UPDATE accounts SET balance = 50000 WHERE id = $1', [fixtures.aliceAccount.id]);
    await testPool.query('UPDATE accounts SET balance = 50000 WHERE id = $1', [fixtures.bobAccount.id]);

    const initialTotalPaise = 50000n + 50000n; // 100,000 paise (₹1000.00)

    // Submit these transfers concurrently:
    // Transfer 1: Account A → Account B for ₹15.00 (1,500 paise)
    // Transfer 2: Account B → Account A for ₹25.00 (2,500 paise)
    const reqAliceToBob = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'c0000000-0000-4000-8000-000000000003')
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '15.00',
        description: 'Alice to Bob transfer (₹15.00)',
      });

    const reqBobToAlice = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.bob}`)
      .set('Idempotency-Key', 'c0000000-0000-4000-8000-000000000004')
      .send({
        sourceAccountNumber: fixtures.bobAccount.account_number,
        destinationAccountNumber: fixtures.aliceAccount.account_number,
        amount: '25.00',
        description: 'Bob to Alice transfer (₹25.00)',
      });

    // Execute concurrently via Promise.all
    const [res1, res2] = await Promise.all([reqAliceToBob, reqBobToAlice]);

    // Expected: No avoidable deadlock (PostgreSQL 40P01 eliminated), both succeed with 200 OK
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(res1.body.success).toBe(true);
    expect(res2.body.success).toBe(true);

    // Database verification:
    // 1. Both accounts have correct final balances:
    // Alice: 50,000 - 1,500 + 2,500 = 51,000 paise (₹510.00)
    // Bob:   50,000 + 1,500 - 2,500 = 49,000 paise (₹490.00)
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(51000n);
    expect(bobDb.rows[0].balance).toBe(49000n);

    // 2. Money conservation: Total money across both accounts is conserved
    const finalTotalPaise = aliceDb.rows[0].balance + bobDb.rows[0].balance;
    expect(finalTotalPaise).toBe(initialTotalPaise);

    // 3. Exactly 2 SUCCESS transaction records created
    const txnCheck = await testPool.query(
      "SELECT id, amount, status FROM transactions WHERE transaction_type = 'TRANSFER' AND status = 'SUCCESS' AND (initiated_by = $1 OR initiated_by = $2)",
      [fixtures.alice.id, fixtures.bob.id]
    );
    expect(txnCheck.rows).toHaveLength(2);

    // 4. Ledger postings are balanced: exactly 4 postings (2 debits, 2 credits)
    const ledgerCheck = await testPool.query(
      'SELECT entry_type, amount FROM ledger_entries WHERE transaction_id = ANY($1::uuid[])',
      [txnCheck.rows.map((t) => t.id)]
    );
    expect(ledgerCheck.rows).toHaveLength(4);

    const totalDebited = ledgerCheck.rows
      .filter((r) => r.entry_type === 'DEBIT')
      .reduce((sum, r) => sum + r.amount, 0n);
    const totalCredited = ledgerCheck.rows
      .filter((r) => r.entry_type === 'CREDIT')
      .reduce((sum, r) => sum + r.amount, 0n);

    expect(totalDebited).toBe(4000n); // 1500 + 2500
    expect(totalCredited).toBe(4000n);
    expect(totalDebited).toBe(totalCredited); // Double-entry balance invariant
  });
});

