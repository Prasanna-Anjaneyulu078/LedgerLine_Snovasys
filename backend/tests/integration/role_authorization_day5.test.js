import { jest } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

jest.setTimeout(120000);

describe('Day 5: Role Authorization & Least-Privilege Verification Suite', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ========================================================
  // Verification 1: Admin can access permitted administration endpoints
  // ========================================================
  describe('1. Admin Permitted Administration Access', () => {
    test('Admin accesses /admin/dashboard with 200 OK and database telemetry', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.overview).toBeDefined();
      expect(res.body.data.overview.totalUsers).toBeGreaterThanOrEqual(3);
      expect(res.body.data.overview.totalAccounts).toBeGreaterThanOrEqual(2);
      expect(res.body.data.overview.totalVaultBalanceFormatted).toBeDefined();
    });

    test('Admin lists all system users via /admin/users with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.users)).toBe(true);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(3);
    });

    test('Admin lists all system accounts via /admin/accounts with 200 OK', async () => {
      const res = await request(app)
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.accounts)).toBe(true);
      expect(res.body.data.accounts.length).toBeGreaterThanOrEqual(2);
    });

    test('Admin can update user status via PATCH /admin/users/:userId/status', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.bob.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.is_active).toBe(false);

      // Reactivate Bob for subsequent tests
      const restoreRes = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.bob.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ isActive: true });
      expect(restoreRes.status).toBe(200);
    });

    test('Admin can update account operational status via PATCH /admin/accounts/:accountId/status', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'FROZEN' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('FROZEN');

      // Unfreeze Alice's account for subsequent tests
      const unfreezeRes = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'ACTIVE' });
      expect(unfreezeRes.status).toBe(200);
    });
  });

  // ========================================================
  // Verification 2: Admin CANNOT perform ordinary money operations
  // ========================================================
  describe('2. Admin Ordinary Money Operation Denial', () => {
    test('Admin deposit attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '100.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[ADMIN\]/i);
    });

    test('Admin withdrawal attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '50.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[ADMIN\]/i);
    });

    test('Admin transfer attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({
          sourceAccountNumber: 'TEST-ACC-ALICE-1',
          destinationAccountNumber: 'TEST-ACC-BOB-1',
          amount: '25.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[ADMIN\]/i);
    });
  });

  // ========================================================
  // Verification 3: Auditor can access supported read-only endpoints
  // ========================================================
  describe('3. Auditor Read-Only Oversight Access', () => {
    test('Auditor can inspect global ledger via GET /api/v1/ledger (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.entries)).toBe(true);
      expect(res.body.data.totalCreditsFormatted).toBeDefined();
      expect(res.body.data.totalDebitsFormatted).toBeDefined();
    });

    test('Auditor can inspect audit events trail via GET /api/v1/audit-events (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.events)).toBe(true);
    });

    test('Auditor can inspect all accounts via GET /api/v1/accounts (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.accounts)).toBe(true);
      expect(res.body.data.accounts.length).toBeGreaterThanOrEqual(2);
    });

    test('Auditor can inspect any account statement via GET /api/v1/statements/:accountNumber (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/statements/TEST-ACC-ALICE-1')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.account).toBeDefined();
      expect(res.body.data.account.accountNumber).toBe('TEST-ACC-ALICE-1');
    });

    test('Auditor can inspect transactions via GET /api/v1/transactions (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/transactions')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.transactions)).toBe(true);
    });

    test('Auditor can inspect account-specific ledger and invariant check via GET /api/v1/ledger/:accountNumber (200 OK)', async () => {
      const res = await request(app)
        .get('/api/v1/ledger/TEST-ACC-ALICE-1')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.accountNumber).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.isBalanceConsistent).toBe(true);
    });
  });

  // ========================================================
  // Verification 4: Auditor CANNOT deposit, withdraw, transfer, or modify accounts
  // ========================================================
  describe('4. Auditor Modification and Money Movement Denial', () => {
    test('Auditor deposit attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/deposit')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '100.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[AUDITOR\]/i);
    });

    test('Auditor withdrawal attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '50.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[AUDITOR\]/i);
    });

    test('Auditor transfer attempt is rejected with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({
          sourceAccountNumber: 'TEST-ACC-ALICE-1',
          destinationAccountNumber: 'TEST-ACC-BOB-1',
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/required role \[ACCOUNT_HOLDER\], current role is \[AUDITOR\]/i);
    });

    test('Auditor cannot update user or account status with 403 Forbidden', async () => {
      const userRes = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.alice.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({ isActive: false });

      expect(userRes.status).toBe(403);

      const accRes = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`)
        .send({ status: 'FROZEN' });

      expect(accRes.status).toBe(403);
    });
  });

  // ========================================================
  // Verification 5: Account holders cannot access global admin/auditor information
  // ========================================================
  describe('5. Account Holder Global Admin/Auditor Denial', () => {
    test('Alice cannot access /admin/dashboard with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
    });

    test('Alice cannot access /admin/users with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
    });

    test('Alice cannot access /admin/accounts with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/accounts')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
    });

    test('Alice cannot access global ledger via GET /ledger with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
    });

    test('Alice cannot access global audit trail via GET /audit-events with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/audit-events')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
    });
  });

  // ========================================================
  // Verification 6: Cross-user account and statement access is rejected
  // ========================================================
  describe('6. Cross-User IDOR Access Denial', () => {
    test('Alice cannot inspect Bob balance with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/accounts/TEST-ACC-BOB-1/balance')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Alice cannot inspect Bob statement with 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/statements/TEST-ACC-BOB-1')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Alice cannot withdraw from Bob account with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'a0000000-0000-4000-8000-000000000001')
        .send({
          accountNumber: 'TEST-ACC-BOB-1',
          amount: '10.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Alice cannot transfer out of Bob account with 403 Forbidden', async () => {
      const res = await request(app)
        .post('/api/v1/transactions/transfer')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'a0000000-0000-4000-8000-000000000002')
        .send({
          sourceAccountNumber: 'TEST-ACC-BOB-1',
          destinationAccountNumber: 'TEST-ACC-ALICE-1',
          amount: '15.00',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================================
  // Verification 7: Refused attempts are correctly scoped
  // ========================================================
  describe('7. Scoped Refused Transaction Attempts', () => {
    test('Overdraft attempt is marked REFUSED, logged to audit events, and scoped only to target account', async () => {
      // Alice attempts overdraft withdrawal (requested ₹1,000.00 > available ₹100.00)
      const overdraftRes = await request(app)
        .post('/api/v1/transactions/withdraw')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`)
        .set('Idempotency-Key', 'a0000000-0000-4000-8000-000000000003')
        .send({
          accountNumber: 'TEST-ACC-ALICE-1',
          amount: '1000.00',
        });

      expect(overdraftRes.status).toBe(400);
      expect(overdraftRes.body.message).toMatch(/Insufficient funds/i);

      // Verify refused audit log was created in DB
      const auditRes = await testPool.query(
        "SELECT * FROM audit_events WHERE action ILIKE '%REFUSED%' AND resource_id = $1",
        [fixtures.aliceAccount.id]
      );
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);

      // Bob's statement does NOT leak Alice's refused attempts
      const bobStmt = await request(app)
        .get('/api/v1/statements/TEST-ACC-BOB-1')
        .set('Authorization', `Bearer ${fixtures.tokens.bob}`);

      expect(bobStmt.status).toBe(200);
      const bobRefused = bobStmt.body.data.refusedAttempts || [];
      for (const ref of bobRefused) {
        expect(ref.resource_id).not.toBe(fixtures.aliceAccount.id);
      }
    });
  });

  // ========================================================
  // Verification 8: Pagination and filters return correct results
  // ========================================================
  describe('8. Server-Side Pagination and Filtering', () => {
    test('Admin users endpoint correctly respects limit and page', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeLessThanOrEqual(2);
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.totalUsers).toBeGreaterThanOrEqual(3);
    });

    test('Global ledger filters by entryType CREDIT', async () => {
      const res = await request(app)
        .get('/api/v1/ledger?entryType=CREDIT&limit=5')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      for (const entry of res.body.data.entries) {
        expect(entry.entry_type).toBe('CREDIT');
      }
    });

    test('Transactions endpoint filters by type and status', async () => {
      const res = await request(app)
        .get('/api/v1/transactions?status=SUCCESS&limit=5')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(200);
      for (const tx of res.body.data.transactions) {
        expect(tx.status).toBe('SUCCESS');
      }
    });
  });

  // ========================================================
  // Verification 9: Unauthorized requests return appropriate HTTP status
  // ========================================================
  describe('9. HTTP Status Code Appropriateness', () => {
    test('Unauthenticated request to protected endpoint returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Invalid or expired Bearer token returns 401 Unauthorized', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', 'Bearer invalid.token.payload');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Authenticated user with insufficient permissions returns 403 Forbidden', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Admin deactivating own identity returns 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.admin.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot deactivate their own account/i);
    });

    test('Invalid account status update value returns 400 Bad Request', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'DESTROYED' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });
});

