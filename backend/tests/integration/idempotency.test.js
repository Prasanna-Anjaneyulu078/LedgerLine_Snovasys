import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool } from '../helpers/testDb.js';

describe('Idempotency Implementation Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await testPool.end();
  });

  test('Idempotent Retry - Same key and payload returns cached response without duplicate execution', async () => {
    const idempotencyKey = 'unique-key-retry-12345';
    const payload = {
      sourceAccountId: fixtures.aliceAccount.id,
      destinationAccountId: fixtures.bobAccount.id,
      amount: '20.00', // 2,000 paise
      description: 'Idempotent test transfer',
    };

    // First Request
    const res1 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(200);
    const txn1Id = res1.body.data.transactionId;

    // Count transactions in DB after first request
    const count1 = await testPool.query('SELECT count(*) FROM transactions WHERE id = $1', [txn1Id]);
    expect(count1.rows[0].count).toBe(1n);

    // Second Identical Request (Simulating a network retry)
    const res2 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.body.data.transactionId).toBe(txn1Id);
    expect(res2.body.data.transactionReference).toBe(res1.body.data.transactionReference);

    // CRITICAL: Ensure balance was debited ONLY ONCE (10000 - 2000 = 8000 paise, NOT 6000 paise!)
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    expect(aliceDb.rows[0].balance).toBe(8000n);

    // CRITICAL: Ensure no duplicate ledger entries were created
    const ledgerCount = await testPool.query('SELECT count(*) FROM ledger_entries WHERE transaction_id = $1', [txn1Id]);
    expect(ledgerCount.rows[0].count).toBe(2n); // exactly 1 debit + 1 credit
  });

  test('Idempotency Conflict - Same key with DIFFERENT payload returns 409 Conflict', async () => {
    const idempotencyKey = 'reused-key-conflict-999';

    // First Request: ₹10.00
    const res1 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '10.00',
        description: 'Original transfer',
      });

    expect(res1.status).toBe(200);

    // Second Request with SAME key but DIFFERENT amount (₹50.00)
    const res2 = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '50.00',
        description: 'Tampered different transfer',
      });

    expect(res2.status).toBe(409);
    expect(res2.body.success).toBe(false);
    expect(res2.body.message).toMatch(/Idempotency key reuse conflict/i);
  });
});

