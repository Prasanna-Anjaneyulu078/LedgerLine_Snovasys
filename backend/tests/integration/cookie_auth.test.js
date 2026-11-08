import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, teardownTestDb, testPool } from '../helpers/testDb.js';
import { REFRESH_COOKIE_NAME } from '../../src/utils/cookie.js';

describe('Secure Persistent Cookie-Based Authentication Tests', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // Helper to extract cookie from response set-cookie header
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

  test('1. Successful login creates the persistent HttpOnly authentication cookie', async () => {
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

    // Ensure refreshToken is NOT in the JSON response body
    expect(res.body.data.refreshToken).toBeUndefined();

    // Verify Set-Cookie header exists with HttpOnly, Path=/, and Max-Age
    const setCookieHeaders = res.headers['set-cookie'];
    expect(setCookieHeaders).toBeDefined();

    const refreshCookie = setCookieHeaders.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
    expect(refreshCookie).toMatch(/Path=\//i);
    expect(refreshCookie).toMatch(/Max-Age=\d+/i);
    expect(refreshCookie).toMatch(/SameSite=Lax/i);

    // Verify database record in refresh_tokens table
    const dbRes = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
      [res.body.data.user.id]
    );
    expect(dbRes.rows.length).toBeGreaterThan(0);
    expect(dbRes.rows[0].token_hash).toBeDefined();
    expect(new Date(dbRes.rows[0].expires_at) > new Date()).toBe(true);
  });

  test('2. Successful registration creates the persistent HttpOnly authentication cookie', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Cookie Test User',
        email: 'cookietest@example.com',
        password: 'Test@123456',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.refreshToken).toBeUndefined();

    const setCookieHeaders = res.headers['set-cookie'];
    const refreshCookie = setCookieHeaders.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
  });

  test('3. Token refresh rotates the refresh token, sets new cookie, and issues fresh access token', async () => {
    // 1. Log in
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'bob@test.com',
        password: 'Test@123456',
      });

    const cookieHeader = extractCookie(loginRes, REFRESH_COOKIE_NAME);
    expect(cookieHeader).toBeDefined();

    // 2. Refresh token using cookie
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data.token).toBeDefined();
    expect(refreshRes.body.data.user.email).toBe('bob@test.com');

    // Verify a new rotated cookie was sent
    const newCookieHeader = extractCookie(refreshRes, REFRESH_COOKIE_NAME);
    expect(newCookieHeader).toBeDefined();
    expect(newCookieHeader).not.toBe(cookieHeader);

    // Verify the new access token works against /auth/me
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${refreshRes.body.data.token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('bob@test.com');
  });

  test('4. Token reuse detection: Reusing an already-rotated token revokes all user sessions', async () => {
    // 1. Log in with Bob
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'bob@test.com',
        password: 'Test@123456',
      });

    expect(loginRes.status).toBe(200);
    const initialCookie = extractCookie(loginRes, REFRESH_COOKIE_NAME);
    const userId = loginRes.body.data.user.id;

    // 2. Perform legitimate rotation
    const rotationRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', initialCookie);

    expect(rotationRes.status).toBe(200);
    const rotatedCookie = extractCookie(rotationRes, REFRESH_COOKIE_NAME);

    // 3. Attacker presents the initial (already rotated) cookie again
    const attackRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', initialCookie);

    expect(attackRes.status).toBe(401);
    expect(attackRes.body.message).toMatch(/reuse detected/i);

    // 4. Verify that all sessions for this user were revoked in database
    const dbActive = await testPool.query(
      'SELECT * FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL;',
      [userId]
    );
    expect(dbActive.rows).toHaveLength(0);

    // 5. Even the rotated cookie should now be rejected because all sessions were revoked
    const postAttackRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookie);

    expect(postAttackRes.status).toBe(401);
  });

  test('5. Refresh request without cookie or with invalid cookie returns 401 Unauthorized', async () => {
    // No cookie
    const noCookieRes = await request(app).post('/api/v1/auth/refresh');
    expect(noCookieRes.status).toBe(401);

    // Invalid cookie
    const invalidCookieRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=malicious_nonexistent_token_value_12345`);
    expect(invalidCookieRes.status).toBe(401);
  });

  test('6. Expired refresh token is rejected with 401', async () => {
    // Insert an already expired token into DB
    const expiredRawToken = 'expired_test_token_1234567890abcdef1234567890abcdef';
    const crypto = await import('crypto');
    const tokenHash = crypto.createHash('sha256').update(expiredRawToken).digest('hex');

    await testPool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() - INTERVAL '1 day');`,
      [fixtures.alice.id, tokenHash]
    );

    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', `${REFRESH_COOKIE_NAME}=${expiredRawToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/expired/i);
  });

  test('7. Logout invalidates the refresh token session and clears the HttpOnly cookie', async () => {
    // 1. Log in
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'alice@test.com',
        password: 'Test@123456',
      });

    const cookieHeader = extractCookie(loginRes, REFRESH_COOKIE_NAME);

    // 2. Call logout
    const logoutRes = await request(app)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookieHeader);

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);

    // Verify Set-Cookie header cleared the cookie (Max-Age <= 0 or past expires)
    const setCookieHeaders = logoutRes.headers['set-cookie'] || [];
    const clearCookie = setCookieHeaders.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
    expect(clearCookie).toBeDefined();
    expect(clearCookie).toMatch(/Max-Age=0|expires=/i);

    // 3. Attempting to refresh using the logged-out cookie returns 401
    const postLogoutRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader);

    expect(postLogoutRes.status).toBe(401);
  });

  test('8. Deactivated user cannot refresh token (403 Forbidden)', async () => {
    // 1. Log in as an account holder
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        email: 'alice@test.com',
        password: 'Test@123456',
      });

    const cookieHeader = extractCookie(loginRes, REFRESH_COOKIE_NAME);

    // 2. Deactivate the user directly in DB
    await testPool.query('UPDATE users SET is_active = false WHERE id = $1;', [fixtures.alice.id]);

    // 3. Attempt to refresh
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookieHeader);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/deactivated/i);

    // Re-activate user for other tests
    await testPool.query('UPDATE users SET is_active = true WHERE id = $1;', [fixtures.alice.id]);
  });
});

