import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

jest.setTimeout(120000);

describe('Complete Backend API Verification & Security Audit Test Suite', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ==========================================
  // 1. System & Authentication Endpoints
  // ==========================================
  describe('System & Authentication APIs', () => {
    test('GET /health - Returns 200 with operational database status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('UP');
      expect(res.body.data.database.connected).toBe(true);
    });

    test('POST /api/v1/auth/register - Creates new user with hashed password and returns token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Audit Candidate',
          email: 'audit.candidate@example.com',
          password: 'Password@123',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('audit.candidate@example.com');
      expect(res.body.data.user.role).toBe('ACCOUNT_HOLDER');
      expect(res.body.data.token).toBeDefined();
    });

    test('POST /api/v1/auth/login - Validates credentials and returns JWT', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@test.com',
          password: 'Test@123456',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('alice@test.com');
    });

    test('POST /api/v1/auth/login - Rejects invalid credentials with 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'alice@test.com',
          password: 'WrongPassword@123',
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/v1/auth/me - Returns current user profile with valid token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('alice@test.com');
      expect(res.body.data.role).toBe('ACCOUNT_HOLDER');
    });

    test('GET /api/v1/auth/me - Rejects unauthenticated request with 401', async () => {
      const res = await request(app).get('/api/v1/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // 2. Account-Number-Based Account Operations
  // ==========================================
  describe('Account Identification & Access Control', () => {
    test('GET /api/v1/accounts - Account holder retrieves own accounts with account numbers', async () => {
      const res = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.accounts)).toBe(true);
      expect(res.body.data.accounts.length).toBeGreaterThan(0);
      expect(res.body.data.accounts[0].account_number).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.accounts[0].balancePaise).toBe('10000');
    });

    test('GET /api/v1/accounts/:accountNumber/balance - User can view balance using account number', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/TEST-ACC-ALICE-1/balance')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.balancePaise).toBe('10000');
      expect(res.body.data.balanceFormatted).toBe('100.00');
    });

    test('GET /api/v1/accounts/:accountNumber/balance - Rejects user probing another user account with 403', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/TEST-ACC-BOB-1/balance')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/permission/i);
    });

    test('GET /api/v1/accounts/:accountNumber/statement - User can view statement using account number', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/TEST-ACC-ALICE-1/statement')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(Array.isArray(res.body.data.entries)).toBe(true);
    });

    test('GET /api/v1/accounts/:accountNumber/statement - Rejects access to other user statement with 403', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/TEST-ACC-BOB-1/statement')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('GET /api/v1/accounts/:accountNumber/balance - Backward compatibility with UUID', async () => {
      const res = await request(app)
        .get(`/api/v1/accounts/${fixtures.aliceAccount.id}/balance`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
    });
  });

  // ==========================================
  // 3. Deposit & Withdrawal with Account Numbers
  // ==========================================
  describe('Deposit & Withdrawal with Account Numbers', () => {
    test('POST /api/v1/transactions/deposit - Credits funds using accountNumber and creates CREDIT ledger entry', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '50.00',
          description: 'Account number deposit',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('DEPOSIT');
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.amountPaise).toBe('5000');
      expect(res.body.data.balanceAfterPaise).toBe('15000'); // 10000 + 5000

      // Direct Database Verification
      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE account_number = $1', ['TEST-ACC-ALICE-1']);
      expect(dbAcc.rows[0].balance).toBe(15000n);

      const dbLedger = await testPool.query(
        'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
        [fixtures.aliceAccount.id]
      );
      expect(dbLedger.rows[0].entry_type).toBe('CREDIT');
      expect(dbLedger.rows[0].amount).toBe(5000n);
      expect(dbLedger.rows[0].balance_after).toBe(15000n);
    });

    test('POST /api/v1/transactions/deposit - Idempotency replay with same key and payload', async () => {
      const key = 'deposit-idemp-test-101';
      const payload = {
        accountNumber: 'TEST-ACC-ALICE-1',
        amount: '25.00',
        description: 'First deposit attempt',
      };

      const res1 = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res1.status).toBe(200);
      expect(res1.body.data.balanceAfterPaise).toBe('17500'); // 15000 + 2500

      // Replay identical request
      const res2 = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res2.status).toBe(200);
      expect(res2.body.data.transactionId).toBe(res1.body.data.transactionId);

      // Verify balance was credited only once in DB
      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE account_number = $1', ['TEST-ACC-ALICE-1']);
      expect(dbAcc.rows[0].balance).toBe(17500n);
    });

    test('POST /api/v1/transactions/withdraw - Debits funds using accountNumber and creates DEBIT ledger entry', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '40.00',
          description: 'ATM withdrawal',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('WITHDRAWAL');
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.balanceAfterPaise).toBe('13500'); // 17500 - 4000

      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE account_number = $1', ['TEST-ACC-ALICE-1']);
      expect(dbAcc.rows[0].balance).toBe(13500n);

      const dbLedger = await testPool.query(
        'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
        [fixtures.aliceAccount.id]
      );
      expect(dbLedger.rows[0].entry_type).toBe('DEBIT');
      expect(dbLedger.rows[0].amount).toBe(4000n);
      expect(dbLedger.rows[0].balance_after).toBe(13500n);
    });

    test('POST /api/v1/transactions/withdraw - Rejects withdrawal from another user account with 403', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-BOB-1',
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/permission/i);
    });

    test('POST /api/v1/transactions/withdraw - Rejects overdraft exceeding available balance with 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '500.00', // 50,000 paise > 13,500 paise available
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/Insufficient funds/i);

      // Verify balance was untouched
      const dbAcc = await testPool.query('SELECT balance FROM accounts WHERE account_number = $1', ['TEST-ACC-ALICE-1']);
      expect(dbAcc.rows[0].balance).toBe(13500n);
    });

    test('POST /api/v1/transactions/withdraw - Backward compatibility with UUID', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountId: fixtures.aliceAccount.id,
          amount: '20.00',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.balanceAfterPaise).toBe('11500'); // 13500 - 2000
    });
  });

  // ==========================================
  // 4. Double-Entry Transfers with Account Numbers
  // ==========================================
  describe('Double-Entry Transfers with Account Numbers', () => {
    test('POST /api/v1/transactions/transfer - Successfully executes double-entry transfer between account numbers', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'transfer-audit-test-1')
        .send({
          sourceAccountNumber: 'TEST-ACC-ALICE-1',
          destinationAccountNumber: 'TEST-ACC-BOB-1',
          amount: '35.00',
          description: 'Rent share transfer',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.sourceAccountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.destinationAccountNumber).toBe('TEST-ACC-BOB-1');
      expect(res.body.data.sourceBalanceAfterPaise).toBe('8000'); // 11500 - 3500
      expect(res.body.data.destinationBalanceAfterPaise).toBe('8500'); // 5000 + 3500

      // Verify double-entry ledger in DB
      const dbDebit = await testPool.query(
        'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
        [fixtures.aliceAccount.id]
      );
      const dbCredit = await testPool.query(
        'SELECT entry_type, amount, balance_after FROM ledger_entries WHERE account_id = $1 ORDER BY created_at DESC LIMIT 1',
        [fixtures.bobAccount.id]
      );

      expect(dbDebit.rows[0].entry_type).toBe('DEBIT');
      expect(dbDebit.rows[0].amount).toBe(3500n);
      expect(dbCredit.rows[0].entry_type).toBe('CREDIT');
      expect(dbCredit.rows[0].amount).toBe(3500n);
    });

    test('POST /api/v1/transactions/transfer - Rejects transfer when user does not own source account number with 403', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          sourceAccountNumber: 'TEST-ACC-BOB-1',
          destinationAccountNumber: 'TEST-ACC-ALICE-1',
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/permission|authorized/i);
    });

    test('POST /api/v1/transactions/transfer - Rejects transfer between identical account numbers with 400', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          sourceAccountNumber: 'TEST-ACC-ALICE-1',
          destinationAccountNumber: 'TEST-ACC-ALICE-1',
          amount: '10.00',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body)).toMatch(/different/i);
    });
  });

  // ==========================================
  // 5. Transaction History & Transaction Details
  // ==========================================
  describe('Transaction History & Details', () => {
    test('GET /api/v1/transactions - Filters transactions by accountNumber', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?accountNumber=TEST-ACC-ALICE-1')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.transactions)).toBe(true);
      expect(res.body.data.transactions.length).toBeGreaterThan(0);
    });

    test('GET /api/v1/transactions/:transactionId - Lookup transaction by reference', async () => {
      const depRes = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '10.00',
        });

      const txnRef = depRes.body.data.transactionReference;

      const res = await request(app)
        .get(`/api/v1/transactions/${txnRef}`)
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.transaction_reference).toBe(txnRef);
      expect(res.body.data.amountPaise).toBe('1000');
    });
  });

  // ==========================================
  // 6. Ledger & Statement Consistency
  // ==========================================
  describe('Ledger & Statement APIs', () => {
    test('GET /api/v1/ledger/:accountNumber - Retrieves account ledger with balance consistency check', async () => {
      const res = await request(app)
        .get('/api/v1/ledger/TEST-ACC-ALICE-1')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.isBalanceConsistent).toBe(true);
      expect(res.body.data.currentBalancePaise).toBe(res.body.data.ledgerCalculatedBalancePaise);
    });

    test('GET /api/v1/statements/:accountNumber - Returns committed postings and account metadata', async () => {
      const res = await request(app)
        .get('/api/v1/statements/TEST-ACC-ALICE-1')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(Array.isArray(res.body.data.committedPostings)).toBe(true);
    });

    test('GET /api/v1/ledger - Global ledger forbidden for regular user (403), allowed for auditor (200)', async () => {
      const userRes = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(userRes.status).toBe(403);

      const auditorRes = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(auditorRes.status).toBe(200);
      expect(auditorRes.body.success).toBe(true);
    });

    test('GET /api/v1/audit-events - Audit trail forbidden for regular user (403), allowed for auditor (200)', async () => {
      const userRes = await request(app)
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(userRes.status).toBe(403);

      const auditorRes = await request(app)
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(auditorRes.status).toBe(200);
      expect(auditorRes.body.success).toBe(true);
    });
  });

  // ==========================================
  // 7. Admin Endpoints & Role Restrictions
  // ==========================================
  describe('Admin Role APIs & Status Management', () => {
    test('GET /api/v1/admin/users & accounts - Admin can list all users and accounts', async () => {
      const usersRes = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(usersRes.status).toBe(200);
      expect(usersRes.body.success).toBe(true);

      const accountsRes = await request(app)
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(accountsRes.status).toBe(200);
      expect(accountsRes.body.success).toBe(true);
    });

    test('PATCH /api/v1/admin/accounts/:accountId/status - Freezes account and rejects transactions', async () => {
      // Admin freezes Alice's account using account number
      const freezeRes = await request(app)
        .patch('/api/v1/admin/accounts/TEST-ACC-ALICE-1/status')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'FROZEN' });

      expect(freezeRes.status).toBe(200);
      expect(freezeRes.body.data.status).toBe('FROZEN');

      // Attempt deposit on frozen account
      const depRes = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '10.00',
        });

      expect(depRes.status).toBe(400);
      expect(depRes.body.message).toMatch(/status: FROZEN/i);

      // Restore account back to ACTIVE
      const unfreezeRes = await request(app)
        .patch('/api/v1/admin/accounts/TEST-ACC-ALICE-1/status')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'ACTIVE' });

      expect(unfreezeRes.status).toBe(200);
      expect(unfreezeRes.body.data.status).toBe('ACTIVE');
    });

    test('Admin Routes - Regular user cannot access admin routes with 403', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
