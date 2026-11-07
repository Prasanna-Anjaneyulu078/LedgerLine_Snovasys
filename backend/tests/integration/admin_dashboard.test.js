import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, testPool, teardownTestDb } from '../helpers/testDb.js';

describe('Admin Dashboard, Telemetry & Institutional Operations Integration Tests', () => {
  let fixtures;

  beforeEach(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ========================================================
  // 1. Admin Dashboard Overview & Metrics
  // ========================================================
  describe('Admin Dashboard Telemetry (GET /api/v1/admin/dashboard)', () => {
    test('Admin successfully retrieves authoritative database-aggregated dashboard overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const { overview, transactionTrends, transactionTypeDistribution, recentTransactions } = res.body.data;

      // Verify overview metrics
      expect(overview).toBeDefined();
      expect(overview.totalUsers).toBeGreaterThanOrEqual(3);
      expect(overview.activeUsers).toBeGreaterThanOrEqual(3);
      expect(overview.inactiveUsers).toBe(overview.totalUsers - overview.activeUsers);
      expect(overview.totalAccounts).toBeGreaterThanOrEqual(2);
      expect(overview.activeAccounts).toBeGreaterThanOrEqual(2);
      expect(overview.inactiveAccounts).toBe(overview.totalAccounts - overview.activeAccounts);
      expect(overview.totalVaultBalancePaise).toBeDefined();
      expect(overview.totalVaultBalanceFormatted).toMatch(/^\d+\.\d{2}$/);
      expect(overview.totalTransactions).toBeGreaterThanOrEqual(0);
      expect(overview.successfulTransactions).toBeGreaterThanOrEqual(0);
      expect(overview.unsuccessfulTransactions).toBe(overview.refusedTransactions + overview.failedTransactions);
      expect(overview.totalAuditLogs).toBeGreaterThanOrEqual(0);

      // Verify time-series trends
      expect(Array.isArray(transactionTrends)).toBe(true);

      // Verify type distribution
      expect(Array.isArray(transactionTypeDistribution)).toBe(true);

      // Verify recent transactions
      expect(Array.isArray(recentTransactions)).toBe(true);
    });

    test('Non-admin users cannot access admin dashboard (403 Forbidden)', async () => {
      const resAlice = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);
      expect(resAlice.status).toBe(403);

      const resAuditor = await request(app)
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);
      expect(resAuditor.status).toBe(403);
    });

    test('Unauthenticated request to admin dashboard returns 401 Unauthorized', async () => {
      const res = await request(app).get('/api/v1/admin/dashboard');
      expect(res.status).toBe(401);
    });
  });

  // ========================================================
  // 2. Admin Users Management (GET & PATCH /api/v1/admin/users)
  // ========================================================
  describe('Admin Users Management', () => {
    test('Admin lists all users with server-side pagination and filters', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?page=1&limit=2')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeLessThanOrEqual(2);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.page).toBe(1);
      expect(res.body.data.pagination.limit).toBe(2);
      expect(res.body.data.pagination.totalUsers).toBeGreaterThanOrEqual(3);

      // Verify password hashes are never exposed
      for (const u of res.body.data.users) {
        expect(u.password_hash).toBeUndefined();
        expect(u.password).toBeUndefined();
      }
    });

    test('Admin filters users by search keyword and role', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users?search=alice&role=ACCOUNT_HOLDER')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.users.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.users[0].email).toMatch(/alice/i);
      expect(res.body.data.users[0].role).toBe('ACCOUNT_HOLDER');
    });

    test('Admin updates user active/suspended status and logs audit event', async () => {
      // Suspend Alice
      const suspendRes = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.alice.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ isActive: false });

      expect(suspendRes.status).toBe(200);
      expect(suspendRes.body.data.is_active).toBe(false);

      // Verify audit event was logged
      const auditRes = await testPool.query(
        "SELECT * FROM audit_events WHERE action = 'ADMIN_USER_STATUS_UPDATED' AND resource_id = $1",
        [fixtures.alice.id]
      );
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('Admin cannot deactivate own identity (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/users/${fixtures.admin.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ isActive: false });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/cannot deactivate their own account/i);
    });
  });

  // ========================================================
  // 3. Admin Accounts Management (GET & PATCH /api/v1/admin/accounts)
  // ========================================================
  describe('Admin Accounts Management', () => {
    test('Admin lists system accounts with search, status, and type filtering', async () => {
      const res = await request(app)
        .get('/api/v1/admin/accounts?search=TEST-ACC-ALICE-1&status=ACTIVE')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.accounts.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.accounts[0].account_number).toBe('TEST-ACC-ALICE-1');
      expect(res.body.data.accounts[0].status).toBe('ACTIVE');
      expect(res.body.data.accounts[0].balancePaise).toBeDefined();
      expect(res.body.data.accounts[0].balanceFormatted).toBeDefined();
    });

    test('Admin updates account operational status (FROZEN / ACTIVE)', async () => {
      const freezeRes = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'FROZEN' });

      expect(freezeRes.status).toBe(200);
      expect(freezeRes.body.data.status).toBe('FROZEN');

      // Verify audit event was logged
      const auditRes = await testPool.query(
        "SELECT * FROM audit_events WHERE action = 'ADMIN_ACCOUNT_STATUS_UPDATED' AND resource_id = $1",
        [fixtures.aliceAccount.id]
      );
      expect(auditRes.rows.length).toBeGreaterThanOrEqual(1);
    });

    test('Admin rejects invalid account status update (400 Bad Request)', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/accounts/${fixtures.aliceAccount.id}/status`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`)
        .send({ status: 'INVALID_STATUS' });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ========================================================
  // 4. Admin Double-Entry Ledger & Statement Inspection
  // ========================================================
  describe('Admin Ledger & Statement Verification', () => {
    test('Admin retrieves global ledger with database-aggregated credit & debit totals', async () => {
      const res = await request(app)
        .get('/api/v1/ledger')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.entries).toBeInstanceOf(Array);
      expect(res.body.data.totalCreditsFormatted).toBeDefined();
      expect(res.body.data.totalDebitsFormatted).toBeDefined();
      expect(res.body.data.total).toBeGreaterThanOrEqual(0);
    });

    test('Admin can inspect any account statement for audit oversight', async () => {
      const res = await request(app)
        .get(`/api/v1/statements/${fixtures.aliceAccount.account_number}`)
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.data.account).toBeDefined();
      expect(res.body.data.committedPostings).toBeInstanceOf(Array);
    });
  });
});
