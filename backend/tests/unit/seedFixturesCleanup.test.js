import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { getActivePool } from '../../src/config/database.js';
import { seedTestFixtures } from '../helpers/testDb.js';

describe('seedTestFixtures Connection Cleanup & Error Handling', () => {
  let originalConnect;
  let pool;

  beforeEach(() => {
    pool = getActivePool();
    originalConnect = pool.connect;
  });

  afterEach(() => {
    pool.connect = originalConnect;
    jest.restoreAllMocks();
  });

  function createMockClient({ onQuery } = {}) {
    let releasedCount = 0;
    const queries = [];

    const client = {
      queries,
      get releasedCount() {
        return releasedCount;
      },
      query: jest.fn(async (text, params) => {
        queries.push({ text: typeof text === 'string' ? text.trim() : text, params });
        if (onQuery) {
          return onQuery(text, params);
        }
        // Default successful responses for fixture inserts
        return {
          rows: [
            {
              id: '00000000-0000-0000-0000-000000000001',
              email: 'test@test.com',
              role: 'ADMIN',
              account_number: 'TEST-ACC',
              balance: 10000n,
            },
          ],
        };
      }),
      release: jest.fn((destroy) => {
        releasedCount++;
        if (releasedCount > 1) {
          throw new Error('Release called on client which has already been released to the pool');
        }
      }),
    };

    return client;
  }

  test('releases client exactly once and commits without rolling back on successful seed', async () => {
    const mockClient = createMockClient();
    pool.connect = jest.fn(async () => mockClient);

    const result = await seedTestFixtures();

    expect(result).toBeDefined();
    expect(result.tokens).toBeDefined();
    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.releasedCount).toBe(1);

    const queryTexts = mockClient.queries.map((q) => q.text);
    expect(queryTexts[0]).toBe('BEGIN;');
    expect(queryTexts).toContain('COMMIT;');
    expect(queryTexts).not.toContain('ROLLBACK;');
  });

  test('rolls back and releases client exactly once when a query fails inside transaction, preserving original DB error', async () => {
    const originalDbError = new Error('relation "users" does not exist');
    const mockClient = createMockClient({
      onQuery: async (text) => {
        if (text.includes('INSERT INTO users')) {
          throw originalDbError;
        }
        return { rows: [{ id: 'mock-id', email: 'test@test.com', role: 'ADMIN' }] };
      },
    });
    pool.connect = jest.fn(async () => mockClient);

    await expect(seedTestFixtures()).rejects.toThrow('relation "users" does not exist');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.releasedCount).toBe(1);

    const queryTexts = mockClient.queries.map((q) => q.text);
    expect(queryTexts).toContain('BEGIN;');
    expect(queryTexts).toContain('ROLLBACK;');
    expect(queryTexts).not.toContain('COMMIT;');
  });

  test('does not execute ROLLBACK if BEGIN query itself fails, releasing client exactly once and preserving original error', async () => {
    const beginError = new Error('Connection lost before BEGIN');
    const mockClient = createMockClient({
      onQuery: async (text) => {
        if (text === 'BEGIN;') {
          throw beginError;
        }
        return { rows: [] };
      },
    });
    pool.connect = jest.fn(async () => mockClient);

    await expect(seedTestFixtures()).rejects.toThrow('Connection lost before BEGIN');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.releasedCount).toBe(1);

    const queryTexts = mockClient.queries.map((q) => q.text);
    expect(queryTexts).not.toContain('ROLLBACK;');
  });

  test('does not execute ROLLBACK if an error occurs after COMMIT succeeds, releasing client exactly once', async () => {
    const mockClient = createMockClient();
    pool.connect = jest.fn(async () => mockClient);

    const jwtError = new Error('JWT secret error');
    jest.spyOn(jwt, 'sign').mockImplementation(() => {
      throw jwtError;
    });

    await expect(seedTestFixtures()).rejects.toThrow('JWT secret error');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.releasedCount).toBe(1);

    const queryTexts = mockClient.queries.map((q) => q.text);
    expect(queryTexts).toContain('COMMIT;');
    expect(queryTexts).not.toContain('ROLLBACK;');
  });

  test('preserves original database error even if ROLLBACK query fails', async () => {
    const insertError = new Error('Foreign key violation on ledger entry');
    const rollbackError = new Error('Connection terminated during rollback');

    const mockClient = createMockClient({
      onQuery: async (text) => {
        if (text.includes('INSERT INTO ledger_entries')) {
          throw insertError;
        }
        if (text === 'ROLLBACK;') {
          throw rollbackError;
        }
        return {
          rows: [
            {
              id: 'mock-id',
              email: 'test@test.com',
              role: 'ADMIN',
              account_number: 'ACC-1',
              balance: 1000n,
            },
          ],
        };
      },
    });
    pool.connect = jest.fn(async () => mockClient);

    await expect(seedTestFixtures()).rejects.toThrow('Foreign key violation on ledger entry');

    expect(mockClient.release).toHaveBeenCalledTimes(1);
    expect(mockClient.releasedCount).toBe(1);
  });

  test('preserves original database error even if client.release throws during error cleanup', async () => {
    const dbError = new Error('Deadlock detected on table lock');
    const mockClient = createMockClient({
      onQuery: async (text) => {
        if (text.includes('INSERT INTO users')) {
          throw dbError;
        }
        return { rows: [] };
      },
    });

    mockClient.release = jest.fn(() => {
      throw new Error('Socket closed unexpectedly on release');
    });

    pool.connect = jest.fn(async () => mockClient);

    // The original database error must be preserved, not masked by the release error
    await expect(seedTestFixtures()).rejects.toThrow('Deadlock detected on table lock');
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

