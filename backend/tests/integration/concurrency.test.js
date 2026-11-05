import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool } from '../helpers/testDb.js';

describe('Concurrency Safety & Race Condition Protection Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await testPool.end();
  });

  test('Concurrent Withdrawals - Two simultaneous withdrawals exceeding available balance cannot overdraw account', async () => {
    // Alice has 10,000 paise (₹100.00) in her account
    // Launch two simultaneous withdrawal requests of 6,000 paise (₹60.00) each
    // Total requested = 12,000 paise > 10,000 paise available!

    const req1 = request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'concurrent-wth-1')
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '60.00',
        description: 'Concurrent withdrawal #1',
      });

    const req2 = request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'concurrent-wth-2')
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '60.00',
        description: 'Concurrent withdrawal #2',
      });

    // Execute in TRUE parallel via Promise.all
    const [res1, res2] = await Promise.all([req1, req2]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(200); // Exactly one succeeded
    expect(statuses).toContain(400); // Exactly one was refused due to insufficient funds

    // CRITICAL: Verify final database balance in PostgreSQL
    const dbAccount = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [
      fixtures.aliceAccount.id,
    ]);

    // Initial 10000 - 6000 = 4000 paise (₹40.00). Account was NEVER overdrawn!
    expect(dbAccount.rows[0].balance).toBe(4000n);

    // Verify ledger entries: Exactly 1 debit of 6000 was inserted
    const ledgerRows = await testPool.query(
      "SELECT amount, entry_type FROM ledger_entries WHERE account_id = $1 AND entry_type = 'DEBIT'",
      [fixtures.aliceAccount.id]
    );

    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0].amount).toBe(6000n);
  });

  test('Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks', async () => {
    // Alice transfers ₹10.00 to Bob while simultaneously Bob transfers ₹10.00 to Alice
    // In naive systems, locking Alice then Bob in one thread, and Bob then Alice in another creates DEADLOCK (code 40P01)
    // Our deterministic row ordering (order by UUID ASC) guarantees both transactions acquire locks in identical order!

    const reqAliceToBob = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .set('Idempotency-Key', 'opp-transfer-alice-1')
      .send({
        sourceAccountId: fixtures.aliceAccount.id,
        destinationAccountId: fixtures.bobAccount.id,
        amount: '10.00',
        description: 'Alice to Bob',
      });

    const reqBobToAlice = request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.bob}`)
      .set('Idempotency-Key', 'opp-transfer-bob-1')
      .send({
        sourceAccountId: fixtures.bobAccount.id,
        destinationAccountId: fixtures.aliceAccount.id,
        amount: '10.00',
        description: 'Bob to Alice',
      });

    const [res1, res2] = await Promise.all([reqAliceToBob, reqBobToAlice]);

    // Both succeed with zero deadlocks
    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    // Verify balances in database
    const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
    const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);

    // Alice sent 1000 and received 1000 -> 10000
    // Bob sent 1000 and received 1000 -> 5000
    expect(aliceDb.rows[0].balance).toBe(10000n);
    expect(bobDb.rows[0].balance).toBe(5000n);
  });
});

