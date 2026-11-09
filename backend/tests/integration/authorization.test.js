import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

describe('Role-Based & Account-Level Authorization Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ========================================================
  // Test F — Cross-user account access (IDOR Protection)
  // ========================================================
  describe('Test F — Cross-user account access & IDOR prevention', () => {
    test('Alice attempts to inspect Bob balance by UUID and account number returns 403 Forbidden', async () => {
      // By UUID
      const resById = await request(app)
        .get(`/api/v1/accounts/${fixtures.bobAccount.id}/balance`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(resById.status).toBe(403);
      expect(resById.body.success).toBe(false);

      // By Account Number
      const resByNum = await request(app)
        .get(`/api/v1/accounts/${fixtures.bobAccount.account_number}/balance`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(resByNum.status).toBe(403);
      expect(resByNum.body.success).toBe(false);
    });

    test('Alice attempts to view Bob account statement returns 403 Forbidden', async () => {
      // By UUID
      const resById = await request(app)
        .get(`/api/v1/accounts/${fixtures.bobAccount.id}/statement`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(resById.status).toBe(403);
      expect(resById.body.success).toBe(false);

      // By Account Number
      const resByNum = await request(app)
        .get(`/api/v1/accounts/${fixtures.bobAccount.account_number}/statement`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(resByNum.status).toBe(403);
      expect(resByNum.body.success).toBe(false);
    });

    test('Bob attempts to inspect Alice account balance and statement returns 403 Forbidden', async () => {
      // Bob attempts Alice balance
      const resBal = await request(app)
        .get(`/api/v1/accounts/${fixtures.aliceAccount.account_number}/balance`)
        .set('Authorization', `Bearer ${fixtures.tokens.bob}`);

      expect(resBal.status).toBe(403);
      expect(resBal.body.success).toBe(false);

      // Bob attempts Alice statement
      const resStmt = await request(app)
        .get(`/api/v1/accounts/${fixtures.aliceAccount.account_number}/statement`)
        .set('Authorization', `Bearer ${fixtures.tokens.bob}`);

      expect(resStmt.status).toBe(403);
      expect(resStmt.body.success).toBe(false);
    });

    test('Alice attempts to initiate withdrawal from Bob account returns 403 with zero database changes', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'a0000000-0000-4000-8000-000000000001')
        .send({
          accountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);

      // Database verification: Bob's balance is untouched
      const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
      expect(bobDb.rows[0].balance).toBe(5000n);

      // 0 unauthorized withdrawal transactions created
      const txnCheck = await testPool.query(
        "SELECT count(*) as count FROM transactions WHERE initiated_by = $1 AND transaction_type = 'WITHDRAWAL'",
        [fixtures.alice.id]
      );
      expect(Number(txnCheck.rows[0].count)).toBe(0);

      // Bob's account has zero unauthorized ledger entries
      const bobLedger = await testPool.query(
        "SELECT count(*) as count FROM ledger_entries WHERE account_id = $1 AND entry_type = 'DEBIT'",
        [fixtures.bobAccount.id]
      );
      expect(Number(bobLedger.rows[0].count)).toBe(0);
    });

    test('Alice attempts to initiate transfer out of Bob account returns 403 with zero database changes', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'a0000000-0000-4000-8000-000000000002')
        .send({
          sourceAccountNumber: fixtures.bobAccount.account_number,
          destinationAccountNumber: fixtures.aliceAccount.account_number,
          amount: '20.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);

      // Database verification: Balances untouched
      const aliceDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
      const bobDb = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.bobAccount.id]);
      expect(aliceDb.rows[0].balance).toBe(10000n);
      expect(bobDb.rows[0].balance).toBe(5000n);

      // 0 unauthorized transfer transactions created
      const totalTxns = await testPool.query(
        "SELECT count(*) as count FROM transactions WHERE transaction_type = 'TRANSFER'"
      );
      expect(Number(totalTxns.rows[0].count)).toBe(0);

      // No debit ledger entries created for either account (neither account was debited)
      const debitLedger = await testPool.query(
        "SELECT count(*) as count FROM ledger_entries WHERE entry_type = 'DEBIT'"
      );
      expect(Number(debitLedger.rows[0].count)).toBe(0);
    });
  });

  // ========================================================
  // Test G — Auditor money-movement denial
  // ========================================================
  describe('Test G — Auditor money-movement denial & read-only access', () => {
    test('Auditor is rejected from initiating deposits returns 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          accountNumber: fixtures.aliceAccount.account_number,
          amount: '100.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Auditors are restricted/i);

      // Database verification: Account balance unchanged
      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
      expect(dbAcc.rows[0].balance).toBe(10000n);
    });

    test('Auditor is rejected from initiating withdrawals returns 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          accountNumber: fixtures.aliceAccount.account_number,
          amount: '50.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Auditors are restricted/i);

      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE id = $1', [fixtures.aliceAccount.id]);
      expect(dbAcc.rows[0].balance).toBe(10000n);
    });

    test('Auditor is rejected from initiating transfers returns 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          sourceAccountNumber: fixtures.aliceAccount.account_number,
          destinationAccountNumber: fixtures.bobAccount.account_number,
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Auditors are restricted/i);

      // Database check: 0 transactions created by auditor
      const auditorTxns = await testPool.query('SELECT count(*) as count FROM transactions WHERE initiated_by = $1', [
        fixtures.auditor.id,
      ]);
      expect(Number(auditorTxns.rows[0].count)).toBe(0);
    });

    test('Auditor CAN inspect global ledger, audit trail, accounts and statements', async () => {
      // Global ledger
      const ledgerRes = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);
      expect(ledgerRes.status).toBe(200);
      expect(ledgerRes.body.success).toBe(true);

      // Audit trail
      const auditRes = await request(app)
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);
      expect(auditRes.status).toBe(200);
      expect(auditRes.body.success).toBe(true);

      // Accounts list
      const accsRes = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);
      expect(accsRes.status).toBe(200);
      expect(accsRes.body.success).toBe(true);

      // User statement
      const stmtRes = await request(app)
        .get(`/api/v1/statements/${fixtures.aliceAccount.account_number}`)
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);
      expect(stmtRes.status).toBe(200);
      expect(stmtRes.body.success).toBe(true);
    });
  });

  // ========================================================
  // Administrative Route RBAC Tests
  // ========================================================
  describe('Admin Role Authorization & Privilege Restrictions', () => {
    test('Non-admin (ACCOUNT_HOLDER) cannot access admin routes with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Auditor cannot access admin routes with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Admin can access admin routes and view system users and accounts', async () => {
      const usersRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(usersRes.status).toBe(200);
      expect(usersRes.body.success).toBe(true);
      expect(usersRes.body.data.users).toBeInstanceOf(Array);

      const accsRes = await request(app)
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(accsRes.status).toBe(200);
      expect(accsRes.body.success).toBe(true);
      expect(accsRes.body.data.accounts).toBeInstanceOf(Array);
    });
  });
});

