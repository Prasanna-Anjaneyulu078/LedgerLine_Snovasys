import request from 'supertest';
import app from '../../src/app.js';
import { cleanDatabase, seedTestFixtures, teardownTestDb } from '../helpers/testDb.js';

describe('Authentication & Authorization Tests', () => {
  let fixtures;

  beforeAll(async () => {
    await cleanDatabase();
    fixtures = await seedTestFixtures();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  test('POST /api/v1/auth/register - Successfully registers a new account holder', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'New User',
        email: 'newuser@test.com',
        password: 'NewUser@123456',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe('newuser@test.com');
    expect(res.body.data.user.role).toBe('ACCOUNT_HOLDER');
    expect(res.body.data.token).toBeDefined();
  });

  test('POST /api/v1/auth/register - Rejects registration with duplicate email', async () => {
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

  test('POST /api/v1/auth/register - Rejects weak password failing complexity requirements', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        fullName: 'Weak Password User',
        email: 'weak@test.com',
        password: 'password123', // Missing uppercase and special character
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

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
    expect(res.body.data.accounts).toBeInstanceOf(Array);
  });

  test('GET /api/v1/auth/me - Rejects request without token', async () => {
    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

