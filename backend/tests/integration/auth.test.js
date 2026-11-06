import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { cleanDatabase, seedTestFixtures, teardownTestDb, testPool } from '../helpers/testDb.js';
import { authService } from '../../src/modules/auth/auth.service.js';

describe('Authentication & Authorization Tests', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ==========================================
  // Section 6 & 7: Registration & Role Protection
  // ==========================================
  describe('Public Registration Flow & Role Escalation Prevention', () => {
    test('Test A — Normal registration successfully registers an ACCOUNT_HOLDER and hashes password', async () => {
      const payload = {
        fullName: 'Normal User',
        email: 'normaluser@example.com',
        password: 'Test@123456',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.email).toBe('normaluser@example.com');
      expect(res.body.data.user.fullName).toBe('Normal User');
      expect(res.body.data.user.role).toBe('ACCOUNT_HOLDER');
      expect(res.body.data.token).toBeDefined();

      // Ensure password hash or raw password is not exposed in API response
      expect(res.body.data.user.password).toBeUndefined();
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.password_hash).toBeUndefined();

      // Database Verification: Query PostgreSQL directly
      const dbRes = await testPool.query('SELECT * FROM users WHERE email = $1', ['normaluser@example.com']);
      expect(dbRes.rows).toHaveLength(1);
      const dbUser = dbRes.rows[0];
      expect(dbUser.role).toBe('ACCOUNT_HOLDER');
      expect(dbUser.full_name).toBe('Normal User');
      expect(dbUser.is_active).toBe(true);

      // Verify password was securely hashed with bcrypt, not plaintext
      expect(dbUser.password_hash).not.toBe('Test@123456');
      expect(dbUser.password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
      const isPasswordValid = await bcrypt.compare('Test@123456', dbUser.password_hash);
      expect(isPasswordValid).toBe(true);

      // Token claim verification
      const decoded = jwt.verify(res.body.data.token, env.JWT_SECRET);
      expect(decoded.id).toBe(dbUser.id);
      expect(decoded.role).toBe('ACCOUNT_HOLDER');

      // Authenticated Identity Verification: GET /api/v1/auth/me
      const meRes = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${res.body.data.token}`);

      expect(meRes.status).toBe(200);
      expect(meRes.body.success).toBe(true);
      expect(meRes.body.data.email).toBe('normaluser@example.com');
      expect(meRes.body.data.role).toBe('ACCOUNT_HOLDER');
    });

    test('Test B — ADMIN role injection is rejected and does not create an admin user', async () => {
      const payload = {
        fullName: 'Malicious Admin',
        email: 'maliciousadmin@example.com',
        password: 'Test@123456',
        role: 'ADMIN',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(JSON.stringify(res.body.errors)).toMatch(/unrecognized/i);

      // Verify no user was created in the database
      const dbRes = await testPool.query('SELECT * FROM users WHERE email = $1', ['maliciousadmin@example.com']);
      expect(dbRes.rows).toHaveLength(0);
    });

    test('Test C — AUDITOR role injection is rejected and does not create an auditor user', async () => {
      const payload = {
        fullName: 'Malicious Auditor',
        email: 'maliciousauditor@example.com',
        password: 'Test@123456',
        role: 'AUDITOR',
      };

      const res = await request(app).post('/api/v1/auth/register').send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(JSON.stringify(res.body.errors)).toMatch(/unrecognized/i);

      // Verify no user was created in the database
      const dbRes = await testPool.query('SELECT * FROM users WHERE email = $1', ['maliciousauditor@example.com']);
      expect(dbRes.rows).toHaveLength(0);
    });

    test('Test D — Lowercase and alternative role injection values are rejected', async () => {
      const maliciousRoles = ['admin', 'auditor', 'ACCOUNT_HOLDER', 'SUPER_ADMIN', 'ROOT'];

      for (const malRole of maliciousRoles) {
        const email = `attacker_${malRole.toLowerCase()}@example.com`;
        const res = await request(app)
          .post('/api/v1/auth/register')
          .send({
            fullName: 'Role Attacker',
            email,
            password: 'Test@123456',
            role: malRole,
          });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(JSON.stringify(res.body.errors)).toMatch(/unrecognized/i);

        // Verify no user was created
        const dbRes = await testPool.query('SELECT * FROM users WHERE email = $1', [email]);
        expect(dbRes.rows).toHaveLength(0);
      }
    });

    test('Test E — Additional privilege fields (isAdmin, permissions, isVerified) are rejected', async () => {
      const maliciousPayloads = [
        {
          fullName: 'Privilege Attacker 1',
          email: 'priv1@example.com',
          password: 'Test@123456',
          isAdmin: true,
        },
        {
          fullName: 'Privilege Attacker 2',
          email: 'priv2@example.com',
          password: 'Test@123456',
          permissions: ['*'],
        },
        {
          fullName: 'Privilege Attacker 3',
          email: 'priv3@example.com',
          password: 'Test@123456',
          isVerified: true,
        },
      ];

      for (const malPayload of maliciousPayloads) {
        const res = await request(app).post('/api/v1/auth/register').send(malPayload);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
        expect(JSON.stringify(res.body.errors)).toMatch(/unrecognized/i);

        // Verify no user created
        const dbRes = await testPool.query('SELECT * FROM users WHERE email = $1', [malPayload.email]);
        expect(dbRes.rows).toHaveLength(0);
      }
    });

    test('Server-Side Role Defense-in-Depth: Direct authService invocation ignores any supplied role and creates ACCOUNT_HOLDER', async () => {
      // Even if an attacker somehow bypassed route validation middleware, the service layer forces ACCOUNT_HOLDER
      const user = await authService.register(
        {
          fullName: 'Direct Service User',
          email: 'directservice@example.com',
          password: 'Test@123456',
          role: 'ADMIN', // Deliberately passed to service
        },
        { ipAddress: '127.0.0.1' }
      );

      expect(user.user.role).toBe('ACCOUNT_HOLDER');

      const dbRes = await testPool.query('SELECT role FROM users WHERE email = $1', ['directservice@example.com']);
      expect(dbRes.rows[0].role).toBe('ACCOUNT_HOLDER');
    });
  });

  // ==========================================
  // Validation Rules & Error Handling Tests
  // ==========================================
  describe('Registration Validation & Constraint Enforcement', () => {
    test('Rejects registration with missing fullName', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'noname@example.com',
          password: 'Test@123456',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/full name/i);
    });

    test('Rejects registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Invalid Email User',
          email: 'not-an-email',
          password: 'Test@123456',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/invalid email/i);
    });

    test('Rejects registration with weak password failing complexity requirements', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Weak Password User',
          email: 'weak@test.com',
          password: 'password123', // Missing uppercase and special character
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(JSON.stringify(res.body.errors)).toMatch(/password must contain/i);
    });

    test('Rejects registration with duplicate email (409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          fullName: 'Alice Duplicate',
          email: 'alice@test.com',
          password: 'Alice@123456',
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
    });
  });

  // ==========================================
  // Authenticated User Identity & Role Security
  // ==========================================
  describe('Login & Authenticated Identity Security', () => {
    test('POST /api/v1/auth/login - Successfully logs in with valid credentials', async () => {
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
      expect(res.body.data.user.role).toBe('ACCOUNT_HOLDER');
    });

    test('POST /api/v1/auth/login - Rejects invalid password', async () => {
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
      expect(res.body.data.accounts).toBeInstanceOf(Array);
    });

    test('GET /api/v1/auth/me - Rejects request without token', async () => {
      const res = await request(app).get('/api/v1/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('API rejects client-forged JWT with tampered role claim', async () => {
      // Create a forged token claiming role: 'ADMIN' signed with an attacker key
      const forgedToken = jwt.sign(
        { id: fixtures.alice.id, email: fixtures.alice.email, role: 'ADMIN' },
        'attacker_malicious_secret_key_1234567890'
      );

      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    test('Privileged role protection: ACCOUNT_HOLDER cannot access ADMIN routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.alice}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Privileged role protection: AUDITOR cannot access ADMIN routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.auditor}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    test('Privileged role protection: ADMIN can access ADMIN routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${fixtures.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.users).toBeInstanceOf(Array);
    });
  });
});

