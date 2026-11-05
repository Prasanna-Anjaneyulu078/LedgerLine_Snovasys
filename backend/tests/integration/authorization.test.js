import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, teardownTestDb } from '../helpers/testDb.js';

describe('Role-Based & Account-Level Authorization Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test('Account Access - User cannot view balance of another user account', async () => {
    // Alice attempts to inspect Bob's account balance
    const res = await request(app)
      .get(`/api/v1/accounts/${fixtures.bobAccount.id}/balance`)
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Account Access - User cannot view statement of another user account', async () => {
    // Alice attempts to view Bob's account statement
    const res = await request(app)
      .get(`/api/v1/accounts/${fixtures.bobAccount.id}/statement`)
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Transaction Authorization - User cannot withdraw from an account they do not own', async () => {
    // Alice attempts to withdraw from Bob's account
    const res = await request(app)
      .post('/api/v1/transactions/withdraw')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        accountId: fixtures.bobAccount.id,
        amount: '10.00',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Transaction Authorization - User cannot transfer funds out of another user account', async () => {
    // Alice attempts to transfer Bob's money to herself
    const res = await request(app)
      .post('/api/v1/transactions/transfer')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
      .send({
        sourceAccountId: fixtures.bobAccount.id, // Bob's account
        destinationAccountId: fixtures.aliceAccount.id,
        amount: '10.00',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Auditor Role - Auditor is restricted from initiating financial transactions', async () => {
    const res = await request(app)
      .post('/api/v1/transactions/deposit')
      .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
      .send({
        accountId: fixtures.aliceAccount.id,
        amount: '100.00',
      });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Auditors are restricted/i);
  });

  test('Auditor Role - Auditor CAN inspect global ledger and audit trail', async () => {
    const ledgerRes = await request(app)
      .get('/api/v1/ledger')
      .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.success).toBe(true);

    const auditRes = await request(app)
      .get('/api/v1/audit-events')
      .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

    expect(auditRes.status).toBe(200);
    expect(auditRes.body.success).toBe(true);
  });

  test('Admin Role - Non-admin cannot access admin routes', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test('Admin Role - Admin can view system users and accounts', async () => {
    const usersRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

    expect(usersRes.status).toBe(200);
    expect(usersRes.body.success).toBe(true);
  });
});

