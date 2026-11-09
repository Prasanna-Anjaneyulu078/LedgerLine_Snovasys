import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

describe('Idempotency Implementation & Concurrent Retry Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ========================================================
  // Mandatory Idempotency Header Validation Tests
  // ========================================================
  describe('Mandatory Idempotency Header Validation', () => {
    test('Rejects financial request when Idempotency-Key header is missing with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Idempotency-Key header is required for financial operations/i);
    });

    test('Rejects financial request when Idempotency-Key header is empty string with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', '')
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Idempotency-Key header is required for financial operations/i);
    });

    test('Rejects financial request when Idempotency-Key header is whitespace-only with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', '   ')
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Idempotency-Key header is required for financial operations/i);
    });

    test('Rejects financial request when Idempotency-Key header is an invalid non-UUID string with HTTP 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'not-a-valid-uuid')
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Idempotency-Key header must be a valid RFC 4122 UUID/i);
    });

    test('Accepts valid RFC 4122 UUID with leading/trailing whitespace, trims it, and processes normally', async () => {
      const validKey = 'e0000000-0000-4000-8000-000000000005';
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', `   ${validKey}   `)
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify trimmed key was stored in idempotency_keys
      const idempRecord = await testPool.query(
        'SELECT idempotency_key FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
        [fixtures.alice.id, validKey]
      );
      expect(idempRecord.rows).toHaveLength(1);
      expect(idempRecord.rows[0].idempotency_key).toBe(validKey);
    });
  });

  // ========================================================
  // Test A — Same-key sequential retry
  // ========================================================
  test('Test A — Same-key sequential retry returns cached response without duplicate transactions or ledger entries', async () => {
    const idempotencyKey = 'a0000000-0000-4000-8000-000000000001';
    const payload = {
      sourceAccountNumber: fixtures.aliceAccount.account_number,
      destinationAccountNumber: fixtures.bobAccount.account_number,
      amount: '20.00', // 2,000 paise
      description: 'Sequential retry transfer',
    };

    // 1. Submit initial request
    const res1 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.body.success).toBe(true);
    const txnId = res1.body.data.transactionId;
    const txnRef = res1.body.data.transactionReference;

    // Database verification after first request
    const txnRes1 = await testPool.query('SELECT count(*) as count FROM transactions WHERE id = $1', [txnId]);
    expect(Number(txnRes1.rows[0].count)).toBe(1);

    // 2. Submit exactly the same request again using the same key
    const res2 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.success).toBe(true);
    // Verify exact same result returned
    expect(res2.body.data.transactionId).toBe(txnId);
    expect(res2.body.data.transactionReference).toBe(txnRef);
    expect(res2.body.data.sourceBalanceAfterPaise).toBe(res1.body.data.sourceBalanceAfterPaise);

    // Database verification:
    // Exactly one logical transfer transaction exists
    const totalTxnRes = await testPool.query(
      "SELECT count(*) as count FROM transactions WHERE initiated_by = $1 AND transaction_type = 'TRANSFER'",
      [fixtures.alice.id]
    );
    expect(Number(totalTxnRes.rows[0].count)).toBe(1);

    // Correct ledger postings exist only once (1 debit, 1 credit = 2 rows)
    const ledgerCountRes = await testPool.query(
      'SELECT count(*) as count FROM ledger_entries WHERE transaction_id = $1',
      [txnId]
    );
    expect(Number(ledgerCountRes.rows[0].count)).toBe(2);

    // Source and destination balances changed only once
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(8000n); // 10000 - 2000
    expect(bobDb.rows[0].balance).toBe(7000n); // 5000 + 2000

    // Idempotency record state in database
    const idempRes = await testPool.query(
      'SELECT response_status, transaction_id FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [fixtures.alice.id, idempotencyKey]
    );
    expect(idempRes.rows).toHaveLength(1);
    expect(idempRes.rows[0].response_status).toBe(200);
    expect(idempRes.rows[0].transaction_id).toBe(txnId);
  });

  // ========================================================
  // Test B — Same-key concurrent retry
  // ========================================================
  test('Test B — Same-key concurrent retry creates no duplicate transactions and posts only one operation', async () => {
    const idempotencyKey = 'b0000000-0000-4000-8000-000000000002';
    const payload = {
      sourceAccountNumber: fixtures.aliceAccount.account_number,
      destinationAccountNumber: fixtures.bobAccount.account_number,
      amount: '25.00', // 2,500 paise
      description: 'Concurrent retry test',
    };

    // Submit 3 simultaneous identical requests using the same idempotency key
    const req1 = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    const req2 = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    const req3 = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    const responses = await Promise.all([req1, req2, req3]);

    // Responses should be either 200 OK (initial execution or cached replay) or 409 Conflict (concurrent lock rejection)
    const successResponses = responses.filter((r) => r.status === 200);
    const conflictResponses = responses.filter((r) => r.status === 409);

    // At least one request succeeded
    expect(successResponses.length).toBeGreaterThanOrEqual(1);
    expect(successResponses.length + conflictResponses.length).toBe(3);

    // All successful responses represent the exact same original result
    const primaryTxnId = successResponses[0].body.data.transactionId;
    const primaryTxnRef = successResponses[0].body.data.transactionReference;
    for (const successRes of successResponses) {
      expect(successRes.body.data.transactionId).toBe(primaryTxnId);
      expect(successRes.body.data.transactionReference).toBe(primaryTxnRef);
      expect(successRes.body.data.amountPaise).toBe('2500');
    }

    // Database state assertions:
    // 1. Exactly one transfer transaction created in the database
    const txnCheck = await testPool.query(
      "SELECT id, status FROM transactions WHERE initiated_by = $1 AND transaction_type = 'TRANSFER'",
      [fixtures.alice.id]
    );
    expect(txnCheck.rows).toHaveLength(1);
    expect(txnCheck.rows[0].id).toBe(primaryTxnId);
    expect(txnCheck.rows[0].status).toBe('SUCCESS');

    // 2. Ledger postings are not duplicated (exactly 2 entries: 1 debit, 1 credit)
    const ledgerCheck = await testPool.query(
      'SELECT id, entry_type, amount FROM ledger_entries WHERE transaction_id = $1',
      [primaryTxnId]
    );
    expect(ledgerCheck.rows).toHaveLength(2);
    const debit = ledgerCheck.rows.find((r) => r.entry_type === 'DEBIT');
    const credit = ledgerCheck.rows.find((r) => r.entry_type === 'CREDIT');
    expect(debit.amount).toBe(2500n);
    expect(credit.amount).toBe(2500n);

    // 3. Final balances reflect ONE transaction only
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(7500n); // 10000 - 2500 = 7500 paise
    expect(bobDb.rows[0].balance).toBe(7500n); // 5000 + 2500 = 7500 paise

    // Sequential retry after concurrency completes returns 200 with the original result
    const sequentialRetry = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(sequentialRetry.status).toBe(200);
    expect(sequentialRetry.body.data.transactionId).toBe(primaryTxnId);
  });

  // ========================================================
  // Test C — Same key, changed payload
  // ========================================================
  test('Test C — Same key with changed payload (amount or destination) returns 409 Conflict with zero side-effects', async () => {
    const idempotencyKey = 'c0000000-0000-4000-8000-000000000003';

    // 1. Submit initial request: ₹10.00
    const res1 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
        description: 'Original transfer',
      });

    expect(res1.status).toBe(200);
    const originalTxnId = res1.body.data.transactionId;

    // 2. Reuse same key with different AMOUNT (₹50.00)
    const res2 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '50.00', // Changed amount
        description: 'Tampered amount transfer',
      });

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.message).toMatch(/Idempotency key reuse conflict/i);

    // 3. Reuse same key with different DESTINATION account (Bob's second checking account)
    const bobSecondAcc = await testPool.query(`
      INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
      VALUES ('TEST-ACC-BOB-2', $1, 'CHECKING', 'INR', 5000, 'ACTIVE')
      RETURNING id, account_number;
    `, [fixtures.bob.id]);

    const res3 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: bobSecondAcc.rows[0].account_number, // Changed destination
        amount: '10.00',
        description: 'Tampered destination transfer',
      });

    expect(res3.status).toBe(409);
    expect(res3.body.success).toBe(false);
    expect(res3.body.message).toMatch(/Idempotency key reuse conflict/i);

    // Database verification:
    // No second transfer transaction was created
    const allTxns = await testPool.query(
      "SELECT count(*) as count FROM transactions WHERE initiated_by = $1 AND transaction_type = 'TRANSFER'",
      [fixtures.alice.id]
    );
    expect(Number(allTxns.rows[0].count)).toBe(1);

    // No additional ledger postings
    const allLedger = await testPool.query(
      'SELECT count(*) as count FROM ledger_entries WHERE transaction_id = $1',
      [originalTxnId]
    );
    expect(Number(allLedger.rows[0].count)).toBe(2);

    // Balances reflect ONLY the first transaction (10000 - 1000 = 9000, 5000 + 1000 = 6000)
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(9000n);
    expect(bobDb.rows[0].balance).toBe(6000n);
  });

  // ========================================================
  // Failed transaction cleanup
  // ========================================================
  test('Failed transaction does not leave inconsistent idempotency reservation and allows clean retry', async () => {
    const idempotencyKey = 'd0000000-0000-4000-8000-000000000004';

    // 1. Submit request that fails (exceeds balance: ₹500.00 > available ₹100.00)
    const failRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '500.00',
      });

    expect(failRes.status).toBe(400);
    expect(failRes.body.success).toBe(false);

    // Verify in-flight idempotency reservation was rolled back / deleted
    const idempCheck = await testPool.query(
      'SELECT * FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2',
      [fixtures.alice.id, idempotencyKey]
    );
    expect(idempCheck.rows).toHaveLength(0);

    // 2. Client retries with a valid amount using the same key
    const successRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '15.00', // valid ₹15.00
      });

    expect(successRes.status).toBe(200);
    expect(successRes.body.success).toBe(true);
    expect(successRes.body.data.amountPaise).toBe('1500');

    // Balance reflects the successful retry
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(8500n); // 10000 - 1500 = 8500 paise
  });
});

