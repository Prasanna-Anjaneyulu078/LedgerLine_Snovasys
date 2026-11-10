import request from 'supertest';
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';
import app from '../../src/app.js';
import { logger } from '../../src/config/logger.js';
import { authService } from '../../src/modules/auth/auth.service.js';
import { authController } from '../../src/modules/auth/auth.controller.js';
import { auditRepository } from '../../src/repositories/audit.repository.js';
import { cleanDatabase, seedTestFixtures, teardownTestDb, testPool, TEST_USER_PASSWORD } from '../helpers/testDb.js';
import { REFRESH_COOKIE_NAME } from '../../src/utils/cookie.js';

describe('Backend Refresh Token Rotation & Reuse Detection Integration Tests', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  const extractCookie = (res, name) => {
    const cookies = res.headers['set-cookie'] || [];
    const prefix = `${name}=`;
    for (const cookie of cookies) {
      if (cookie.startsWith(prefix)) {
        return cookie.split(';')[0];
      }
    }
    return null;
  };

  describe('1. Role-based Authentication and Session Restoration', () => {
    test('ADMIN role: logs in, restores session via refresh, accesses /admin/dashboard and /auth/me', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('ADMIN');
      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      expect(cookie).toBeDefined();

      // Refresh token
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.user.role).toBe('ADMIN');

      // Authoritative profile check
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.data.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.role).toBe('ADMIN');
      expect(meRes.body.data.email).toBe('admin@test.com');
    });

    test('AUDITOR role: logs in, restores session via refresh, accesses /auth/me', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'auditor@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('AUDITOR');
      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      expect(cookie).toBeDefined();

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.user.role).toBe('AUDITOR');

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.data.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.role).toBe('AUDITOR');
    });

    test('ACCOUNT_HOLDER role: logs in, restores session via refresh, accesses /auth/me', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      expect(loginRes.body.data.user.role).toBe('ACCOUNT_HOLDER');
      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      expect(cookie).toBeDefined();

      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.data.user.role).toBe('ACCOUNT_HOLDER');

      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${refreshRes.body.data.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.data.role).toBe('ACCOUNT_HOLDER');
      expect(meRes.body.data.accounts.length).toBeGreaterThan(0);
    });
  });

  describe('2. Race Condition Reproduction & Reuse Detection Proof', () => {
    test('Uncoordinated duplicate refresh requests with the same token trigger backend reuse detection', async () => {
      // 1. Log in Bob
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bob@test.com', password: TEST_USER_PASSWORD });

      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const userId = loginRes.body.data.user.id;

      // 2. Perform rotation 1
      const res1 = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      expect(res1.status).toBe(200);
      const rotatedCookie = extractCookie(res1, REFRESH_COOKIE_NAME);

      // 3. Duplicate request arrives with the original token (simulating uncoordinated StrictMode or concurrent race)
      const res2 = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);

      // Reused rotated token triggers 401 reuse detection and session revocation
      expect(res2.status).toBe(401);
      expect(res2.body.message).toMatch(/reuse detected/i);

      // All sessions for Bob are revoked
      const dbTokens = await testPool.query(
        'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [userId]
      );
      expect(dbTokens.rows).toHaveLength(0);

      // Even the newly rotated cookie is now invalid
      const postRevokeRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', rotatedCookie);
      expect(postRevokeRes.status).toBe(401);
    });
  });

  describe('3. Sequential Refresh Token Rotation with Cookie Updates (Backend Verification)', () => {
    test('Sequential refresh requests with updated cookies succeed on backend (cross-tab concurrency coordination is tested in frontend suite)', async () => {
      // Log in Alice
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      let currentCookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);

      // Simulate 4 rapid consecutive page refreshes (each reload sending the updated cookie)
      for (let i = 0; i < 4; i++) {
        const refreshRes = await request(app)
          .post('/api/v1/auth/refresh')
          .set('Cookie', currentCookie);

        expect(refreshRes.status).toBe(200);
        expect(refreshRes.body.data.token).toBeDefined();

        // Update cookie to rotated cookie for next reload
        currentCookie = extractCookie(refreshRes, REFRESH_COOKIE_NAME);
        expect(currentCookie).toBeDefined();

        // Verify the issued access token works on /auth/me
        const meRes = await request(app)
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${refreshRes.body.data.token}`);
        expect(meRes.status).toBe(200);
        expect(meRes.body.data.email).toBe('alice@test.com');
      }
    });
  });

  describe('4. Logout and Re-Login Lifecycle', () => {
    test('Logout revokes session cookie and permits clean re-login', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: TEST_USER_PASSWORD });

      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);

      // Logout
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie);

      expect(logoutRes.status).toBe(200);

      // Refresh using logged-out cookie fails with 401
      const refreshAfterLogout = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie);
      expect(refreshAfterLogout.status).toBe(401);

      // Re-login succeeds cleanly
      const reLoginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'admin@test.com', password: TEST_USER_PASSWORD });

      expect(reLoginRes.status).toBe(200);
      expect(reLoginRes.body.data.token).toBeDefined();
      const newCookie = extractCookie(reLoginRes, REFRESH_COOKIE_NAME);
      expect(newCookie).toBeDefined();

      // New session can refresh
      const newRefreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', newCookie);
      expect(newRefreshRes.status).toBe(200);
    });
  });

  describe('5. Concurrency, Premature Abort & Lost-Response Recovery (Priority 1/4)', () => {
    const extractRawCookieValue = (cookieHeader, name) => {
      if (!cookieHeader) return null;
      const prefix = `${name}=`;
      return cookieHeader.startsWith(prefix) ? cookieHeader.slice(prefix.length) : null;
    };

    test('Concurrent backend Promise.all /auth/refresh with same cookie serializes safely (one 200, one 401 reuse, zero 500s)', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const userId = loginRes.body.data.user.id;
      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);

      const [r1, r2] = await Promise.all([
        request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
        request(app).post('/api/v1/auth/refresh').set('Cookie', cookie),
      ]);

      const statuses = [r1.status, r2.status].sort((a, b) => a - b);
      expect(statuses).toEqual([200, 401]);

      const failed = r1.status === 401 ? r1 : r2;
      expect(failed.body.message).toMatch(/reuse detected/i);

      // Genuine concurrent duplicate with no lost-response must revoke all user sessions cleanly
      const activeTokens = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [userId]
      );
      expect(activeTokens.rows).toHaveLength(0);
    });

    test('Pre-commit client abort rolls back rotation and preserves original refresh cookie validity', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const cookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken = extractRawCookieValue(cookie, REFRESH_COOKIE_NAME);

      const abortResult = await authService.rotateRefreshToken(rawToken, {
        ipAddress: '127.0.0.1',
        userAgent: 'AbortAgent/1.0',
        isClientAborted: () => true,
      });

      expect(abortResult).toEqual({ aborted: true });

      // Original cookie MUST still be unrevoked and succeed on reload/retry
      const reloadRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie)
        .set('User-Agent', 'AbortAgent/1.0');

      expect(reloadRes.status).toBe(200);
      expect(reloadRes.body.data.token).toBeDefined();
    });

    test('Post-commit premature close grants single-use recovery to same User-Agent and revokes on second replay', async () => {
      const ua = 'LedgerLineBrowser/5.0';
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', ua)
        .send({ email: 'bob@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const bobId = loginRes.body.data.user.id;
      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken1 = extractRawCookieValue(cookie1, REFRESH_COOKIE_NAME);

      // Invoke controller with EventEmitter req/res where socket closes after COMMIT but before writableFinished
      const mockReq = new EventEmitter();
      mockReq.cookies = { [REFRESH_COOKIE_NAME]: rawToken1 };
      mockReq.headers = { 'user-agent': ua };
      mockReq.ip = '127.0.0.1';
      mockReq.destroyed = false;

      const mockRes = new EventEmitter();
      mockRes.writableFinished = false;
      mockRes.writableEnded = false;
      mockRes.headersSent = false;
      mockRes.destroyed = false;
      mockRes.statusCode = 200;
      mockRes.cookie = () => mockRes;
      mockRes.status = (code) => {
        mockRes.statusCode = code;
        return mockRes;
      };
      mockRes.json = () => {
        // Simulate TCP connection drop before HTTP body flushes to client
        mockRes.destroyed = true;
        mockRes.emit('close');
        return mockRes;
      };
      mockRes.end = () => mockRes;

      await new Promise((resolve, reject) => {
        mockRes.on('close', () => setImmediate(resolve));
        authController.refreshToken(mockReq, mockRes, (err) => {
          if (err) reject(err);
        });
      });

      // Retry with original cookie1 from same User-Agent should recover ONCE (200 OK)
      const recoveryRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', ua);

      expect(recoveryRes.status).toBe(200);
      expect(recoveryRes.body.data.token).toBeDefined();
      const recoveredCookie = extractCookie(recoveryRes, REFRESH_COOKIE_NAME);
      expect(recoveredCookie).toBeDefined();
      expect(recoveredCookie).not.toBe(cookie1);

      // Verify audit logs recorded AUTH_REFRESH_RESPONSE_LOST and AUTH_REFRESH_RECOVERY_SUCCESS with no secret tokens
      const auditRes = await testPool.query(
        `SELECT action, metadata FROM audit_events
         WHERE actor_id = $1 AND action IN ('AUTH_REFRESH_RESPONSE_LOST', 'AUTH_REFRESH_RECOVERY_SUCCESS')
         ORDER BY created_at DESC LIMIT 5;`,
        [bobId]
      );
      const actions = auditRes.rows.map((r) => r.action);
      expect(actions).toContain('AUTH_REFRESH_RESPONSE_LOST');
      expect(actions).toContain('AUTH_REFRESH_RECOVERY_SUCCESS');
      for (const row of auditRes.rows) {
        const metaStr = JSON.stringify(row.metadata || {});
        expect(metaStr).not.toContain(rawToken1);
      }

      // Second replay of already-recovered cookie1 MUST fail 401 reuse detection and revoke all sessions
      const secondReplay = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', ua);

      expect(secondReplay.status).toBe(401);
      expect(secondReplay.body.message).toMatch(/reuse detected/i);

      const postReplayRecoveryCookieCheck = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', recoveredCookie)
        .set('User-Agent', ua);
      expect(postReplayRecoveryCookieCheck.status).toBe(401);
    });

    test('Post-commit lost-response rejects recovery when User-Agent differs and revokes all sessions', async () => {
      const uaOrigin = 'OriginBrowser/1.0';
      const uaAttacker = 'AttackerScript/9.9';

      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', uaOrigin)
        .send({ email: 'bob@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const bobId = loginRes.body.data.user.id;
      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken1 = extractRawCookieValue(cookie1, REFRESH_COOKIE_NAME);

      const rotated = await authService.rotateRefreshToken(rawToken1, {
        ipAddress: '127.0.0.1',
        userAgent: uaOrigin,
      });
      await authService.markRefreshResponseLost({
        tokenId: rotated.rotatedFromTokenId,
        userId: bobId,
        replacedTokenHash: rotated.rotatedFromTokenHash,
        ipAddress: '127.0.0.1',
      });

      const attackerAttempt = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', uaAttacker);

      expect(attackerAttempt.status).toBe(401);
      expect(attackerAttempt.body.message).toMatch(/reuse detected/i);

      const remaining = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [bobId]
      );
      expect(remaining.rows).toHaveLength(0);
    });

    test('Logout with pre-rotation cookie follows replacement chain and revokes active successor', async () => {
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const refreshRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1);
      expect(refreshRes.status).toBe(200);
      const cookie2 = extractCookie(refreshRes, REFRESH_COOKIE_NAME);

      // Logout arrives carrying pre-rotation cookie1 (e.g., racing logout)
      const logoutRes = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', cookie1);
      expect(logoutRes.status).toBe(200);

      // Successor cookie2 must now also be revoked
      const postLogoutRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie2);
      expect(postLogoutRefresh.status).toBe(401);
    });

    test('JWT signing failure rolls back refresh-token rotation and preserves original cookie', async () => {
      const ua = 'LedgerLineJwtRollback/1.0';
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', ua)
        .send({ email: 'alice@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const aliceId = loginRes.body.data.user.id;
      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken1 = extractRawCookieValue(cookie1, REFRESH_COOKIE_NAME);
      const tokenHash1 = authService.hashToken(rawToken1);

      const preOriginal = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE token_hash = $1;',
        [tokenHash1]
      );
      expect(preOriginal.rows).toHaveLength(1);
      const activeTokenId = preOriginal.rows[0].id;

      const preCountRes = await testPool.query(
        'SELECT count(*)::int AS cnt FROM refresh_tokens WHERE user_id = $1;',
        [aliceId]
      );
      const preAuditCountRes = await testPool.query(
        `SELECT count(*)::int AS cnt FROM audit_events WHERE actor_id = $1 AND action = 'AUTH_REFRESH_SUCCESS';`,
        [aliceId]
      );

      const signSpy = jest.spyOn(authService, 'generateToken').mockImplementationOnce(() => {
        throw new Error('Simulated JWT signing failure');
      });

      const failedRefresh = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', ua);

      signSpy.mockRestore();
      expect(failedRefresh.status).toBe(500);

      // Original refresh token must NOT be revoked or replaced, and zero successor/audit row committed
      const postOriginal = await testPool.query(
        'SELECT id, revoked_at, replaced_by_token_hash FROM refresh_tokens WHERE id = $1;',
        [activeTokenId]
      );
      expect(postOriginal.rows).toHaveLength(1);
      expect(postOriginal.rows[0].revoked_at).toBeNull();
      expect(postOriginal.rows[0].replaced_by_token_hash).toBeNull();

      const postCountRes = await testPool.query(
        'SELECT count(*)::int AS cnt FROM refresh_tokens WHERE user_id = $1;',
        [aliceId]
      );
      expect(postCountRes.rows[0].cnt).toBe(preCountRes.rows[0].cnt);

      const postAuditCountRes = await testPool.query(
        `SELECT count(*)::int AS cnt FROM audit_events WHERE actor_id = $1 AND action = 'AUTH_REFRESH_SUCCESS';`,
        [aliceId]
      );
      expect(postAuditCountRes.rows[0].cnt).toBe(preAuditCountRes.rows[0].cnt);

      // Subsequent refresh with original cookie1 still succeeds after rollback
      const retrySuccess = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', ua);
      expect(retrySuccess.status).toBe(200);
      expect(retrySuccess.body.data.token).toBeDefined();
    });

    test('Post-commit lost-response rejects recovery when original User-Agent is missing', async () => {
      const loginData = await authService.login(
        { email: 'bob@test.com', password: TEST_USER_PASSWORD },
        { ipAddress: '127.0.0.1', userAgent: null }
      );
      const bobId = loginData.user.id;
      const cookie1 = `${REFRESH_COOKIE_NAME}=${loginData.refreshToken}`;

      const rotated = await authService.rotateRefreshToken(loginData.refreshToken, {
        ipAddress: '127.0.0.1',
        userAgent: null,
      });
      await authService.markRefreshResponseLost({
        tokenId: rotated.rotatedFromTokenId,
        userId: bobId,
        replacedTokenHash: rotated.rotatedFromTokenHash,
        ipAddress: '127.0.0.1',
      });

      const retryRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', 'SomeBrowser/1.0');

      expect(retryRes.status).toBe(401);
      expect(retryRes.body.message).toMatch(/reuse detected/i);

      const remaining = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [bobId]
      );
      expect(remaining.rows).toHaveLength(0);
    });

    test('Post-commit lost-response rejects recovery when retry User-Agent is missing', async () => {
      const uaOrigin = 'OriginStrictAgent/1.0';
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', uaOrigin)
        .send({ email: 'bob@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const bobId = loginRes.body.data.user.id;
      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken1 = extractRawCookieValue(cookie1, REFRESH_COOKIE_NAME);

      const rotated = await authService.rotateRefreshToken(rawToken1, {
        ipAddress: '127.0.0.1',
        userAgent: uaOrigin,
      });
      await authService.markRefreshResponseLost({
        tokenId: rotated.rotatedFromTokenId,
        userId: bobId,
        replacedTokenHash: rotated.rotatedFromTokenHash,
        ipAddress: '127.0.0.1',
      });

      const missingRetryUaRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', '');

      expect(missingRetryUaRes.status).toBe(401);
      expect(missingRetryUaRes.body.message).toMatch(/reuse detected/i);

      const remaining = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [bobId]
      );
      expect(remaining.rows).toHaveLength(0);
    });

    test('Lost-response audit write failure logs safe server diagnostic without leaking tokens and remains fail-closed', async () => {
      const ua = 'LedgerLineDiagAgent/1.0';
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .set('User-Agent', ua)
        .send({ email: 'bob@test.com', password: TEST_USER_PASSWORD });

      expect(loginRes.status).toBe(200);
      const bobId = loginRes.body.data.user.id;
      const cookie1 = extractCookie(loginRes, REFRESH_COOKIE_NAME);
      const rawToken1 = extractRawCookieValue(cookie1, REFRESH_COOKIE_NAME);

      const rotated = await authService.rotateRefreshToken(rawToken1, {
        ipAddress: '127.0.0.1',
        userAgent: ua,
      });

      const auditSpy = jest
        .spyOn(auditRepository, 'create')
        .mockRejectedValueOnce(Object.assign(new Error('audit write unavailable'), { code: '57P01' }));
      const loggerSpy = jest.spyOn(logger, 'error').mockImplementation(() => {});

      const persistResult = await authService.markRefreshResponseLost({
        tokenId: rotated.rotatedFromTokenId,
        userId: bobId,
        replacedTokenHash: rotated.rotatedFromTokenHash,
        ipAddress: '127.0.0.1',
      });

      auditSpy.mockRestore();
      expect(persistResult).toBeNull();
      expect(loggerSpy).toHaveBeenCalledTimes(1);

      const loggedText = JSON.stringify(loggerSpy.mock.calls[0]);
      expect(loggedText).toContain('AUTH_REFRESH_RESPONSE_LOST');
      expect(loggedText).toContain(String(rotated.rotatedFromTokenId));
      expect(loggedText).toContain('57P01');
      expect(loggedText).not.toContain(rawToken1);
      expect(loggedText).not.toContain(rotated.rotatedFromTokenHash);
      loggerSpy.mockRestore();

      // Recovery must remain fail-closed without persisted AUTH_REFRESH_RESPONSE_LOST
      const replayRes = await request(app)
        .post('/api/v1/auth/refresh')
        .set('Cookie', cookie1)
        .set('User-Agent', ua);

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.message).toMatch(/reuse detected/i);

      const remaining = await testPool.query(
        'SELECT id FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
        [bobId]
      );
      expect(remaining.rows).toHaveLength(0);
    });
  });
});

