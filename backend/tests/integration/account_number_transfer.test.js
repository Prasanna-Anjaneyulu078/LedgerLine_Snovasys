import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb, getAdminPool } from '../helpers/testDb.js';
import crypto from 'crypto';

describe('Account Number-Based Transfer Tests (Source & Destination)', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // 1. Successful transfer using valid source and destination account numbers
  test('1. Successful transfer using valid source and destination account numbers', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '25.00',
        description: 'Payment for lunch',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceAccountNumber).toBe(fixtures.aliceAccount.account_number);
    expect(res.body.data.destinationAccountNumber).toBe(fixtures.bobAccount.account_number);
    expect(res.body.data.amountPaise).toBe('2500');
    expect(res.body.data.sourceBalanceAfterPaise).toBe('7500'); // 10000 - 2500
    expect(res.body.data.destinationBalanceAfterPaise).toBe('7500'); // 5000 + 2500
  });

  // 2. Source account number does not exist
  test('2. Source account number does not exist returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: 'LL-ACC-NONEXISTENT',
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Source account not found/i);
  });

  // 3. Destination account number does not exist
  test('3. Destination account number does not exist returns 404', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: 'LL-ACC-UNKNOWN-999',
        amount: '10.00',
      });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Destination account not found/i);
  });

  // 4. Source account belongs to another user
  test('4. Source account belongs to another user returns 403 Forbidden', async () => {
    // Alice attempts to transfer from Bob's account
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.bobAccount.account_number,
        destinationAccountNumber: fixtures.aliceAccount.account_number,
        amount: '15.00',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/do not have permission to transfer funds from this source account/i);
  });

  // 5. Inactive source account
  test('5. Inactive source account returns 400 Bad Request', async () => {
    // Freeze Alice's account using adminPool
    const admin = getAdminPool();
    await admin.query("UPDATE accounts SET status = 'FROZEN' WHERE id = $1", [fixtures.aliceAccount.id]);

    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Source account is not active/i);
  });

  // 6. Inactive destination account
  test('6. Inactive destination account returns 400 Bad Request', async () => {
    // Close Bob's account using adminPool
    const admin = getAdminPool();
    await admin.query("UPDATE accounts SET status = 'CLOSED' WHERE id = $1", [fixtures.bobAccount.id]);

    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Destination account is not active/i);
  });

  // 7. Same source and destination account number
  test('7. Same source and destination account number returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.aliceAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toMatch(/Source and destination accounts must be different/i);
  });

  // 8. Insufficient balance
  test('8. Insufficient balance returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '999.00', // ₹999.00 > available ₹100.00
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Insufficient funds/i);
  });

  // 9. Zero or negative amount
  test('9. Zero or negative amount returns 400 Bad Request', async () => {
    const zeroRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '0.00',
      });

    expect(zeroRes.status).toBe(400);
    expect(JSON.stringify(zeroRes.body)).toMatch(/Amount must be strictly greater than zero/i);

    const negRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '-50.00',
      });

    expect(negRes.status).toBe(400);
    expect(JSON.stringify(negRes.body)).toMatch(/Amount must be strictly greater than zero|positive/i);
  });

  // 10. Invalid account-number format (e.g. empty string)
  test('10. Invalid account-number format returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: '   ',
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 11. Missing source account number
  test('11. Missing source account number returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toMatch(/Source account number is required/i);
  });

  // 12. Missing destination account number
  test('12. Missing destination account number returns 400 Bad Request', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).toMatch(/Destination account number is required/i);
  });

  // 13. Duplicate idempotency key with the same request
  test('13. Duplicate idempotency key with the same request replays cached response', async () => {
    const idempotencyKey = '10000000-0000-4000-8000-000000000001';

    const reqBody = {
      sourceAccountNumber: fixtures.aliceAccount.account_number,
      destinationAccountNumber: fixtures.bobAccount.account_number,
      amount: '20.00',
      description: 'Idempotent test',
    };

    // First request
    const firstRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(reqBody);

    expect(firstRes.status).toBe(200);
    expect(firstRes.body.data.sourceBalanceAfterPaise).toBe('8000'); // 10000 - 2000

    // Duplicate retry
    const secondRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(reqBody);

    expect(secondRes.status).toBe(200);
    expect(secondRes.body.data.transactionId).toBe(firstRes.body.data.transactionId);
    expect(secondRes.body.data.sourceBalanceAfterPaise).toBe('8000'); // Balance was NOT deducted twice!

    // Verify database balance only decreased by 2000 once
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(8000n);
  });

  // 14. Duplicate idempotency key with a different request
  test('14. Duplicate idempotency key with a different request returns 409 Conflict', async () => {
    const idempotencyKey = '10000000-0000-4000-8000-000000000002';

    // First request: transfer ₹20.00
    await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '20.00',
      });

    // Second request with SAME key but DIFFERENT amount (tampered payload)
    const conflictRes = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '50.00', // Changed amount!
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.success).toBe(false);
    expect(conflictRes.body.message).toMatch(/Idempotency key reuse conflict/i);
  });

  // 15. Concurrent transfers from the same source account
  test('15. Concurrent transfers from the same source account serialize safely', async () => {
    // Alice has 10,000 paise (₹100.00). Attempt two concurrent transfers of ₹60.00 each.
    // One must succeed, the other must fail with insufficient funds.
    const [res1, res2] = await Promise.all([
      request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', '10000000-0000-4000-8000-000000000003')
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '60.00',
        }),
      request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', '10000000-0000-4000-8000-000000000004')
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '60.00',
        }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 400]);

    // Alice balance must be exactly 4000n (10000 - 6000)
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(4000n);
  });

  // 16. Successful transfer preserves money conservation
  test('16. Successful transfer preserves money conservation', async () => {
    const beforeTotalRes = await testPool.query('SELECT SUM(balance) as total FROM accounts;');
    const beforeTotal = BigInt(beforeTotalRes.rows[0].total);

    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '35.00',
      });

    expect(res.status).toBe(200);

    const afterTotalRes = await testPool.query('SELECT SUM(balance) as total FROM accounts;');
    const afterTotal = BigInt(afterTotalRes.rows[0].total);
    expect(afterTotal).toBe(beforeTotal);
  });

  // 17. Failed transfer does not create partial ledger entries
  test('17. Failed transfer does not create partial ledger entries', async () => {
    const beforeLedgerCount = await testPool.query('SELECT count(*) as count FROM ledger_entries;');
    const initialCount = Number(beforeLedgerCount.rows[0].count);

    // Attempt overdraft transfer
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '9999.00',
      });

    expect(res.status).toBe(400);

    const afterLedgerCount = await testPool.query('SELECT count(*) as count FROM ledger_entries;');
    expect(Number(afterLedgerCount.rows[0].count)).toBe(initialCount);
  });

  // 18. Auditor cannot initiate transfers
  test('18. Auditor cannot initiate transfers returns 403 Forbidden', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\]|Auditors are restricted/i);
  });

  // 19. Unauthorized requests are rejected
  test('19. Unauthorized requests are rejected returns 401', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .send({
        sourceAccountNumber: fixtures.aliceAccount.account_number,
        destinationAccountNumber: fixtures.bobAccount.account_number,
        amount: '10.00',
      });

    expect(res.status).toBe(401);
  });

  // 20. Existing transfer tests continue to pass via backward compatibility
  test('20. Backward compatibility - Transfer using UUID sourceAccountId and destinationAccountId', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '12.00',
        description: 'Legacy UUID transfer',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sourceAccountId).toBe(fixtures.aliceAccount.id);
    expect(res.body.data.destinationAccountId).toBe(fixtures.bobAccount.id);
    expect(res.body.data.sourceAccountNumber).toBe(fixtures.aliceAccount.account_number);
    expect(res.body.data.destinationAccountNumber).toBe(fixtures.bobAccount.account_number);
    expect(res.body.data.amountPaise).toBe('1200');
  });
});

