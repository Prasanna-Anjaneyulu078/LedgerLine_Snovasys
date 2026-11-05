import pg from 'pg';
import { env } from './env.js';
import { logger } from './logger.js';

const { Pool, types } = pg;

// Parse PostgreSQL BIGINT (OID 20) as JavaScript BigInt to prevent 64-bit precision loss
types.setTypeParser(20, (val) => (val === null ? null : BigInt(val)));

// Enable safe JSON serialization of BigInt values across Express responses
BigInt.prototype.toJSON = function () {
  return this.toString();
};

const connectionString =
  env.NODE_ENV === 'test' && env.TEST_DATABASE_URL
    ? env.TEST_DATABASE_URL
    : env.DATABASE_URL;

const isSslRequired =
  connectionString.includes('sslmode=require') ||
  connectionString.includes('sslmode=verify-full') ||
  connectionString.includes('ssl=true');

function createPoolInstance() {
  const p = new Pool({
    connectionString,
    ssl: isSslRequired ? { rejectUnauthorized: true } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
  });

  p.on('error', (err) => {
    logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
  });

  return p;
}

let activePool = createPoolInstance();

export function getActivePool() {
  if (!activePool || activePool.ended) {
    activePool = createPoolInstance();
  }
  return activePool;
}

export const pool = new Proxy({}, {
  get(target, prop) {
    const current = getActivePool();
    const val = current[prop];
    return typeof val === 'function' ? val.bind(current) : val;
  },
});

/**
 * Execute a standalone parameterized query
 * @param {string} text
 * @param {Array} params
 */
export async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (env.NODE_ENV === 'development' && duration > 200) {
    logger.warn({ text, duration, rows: res.rowCount }, 'Slow query detected');
  }
  return res;
}

/**
 * Acquire a dedicated client from the pool for transactional operations
 * Callers MUST call client.release() in a finally block!
 */
export async function getClient() {
  const client = await pool.connect();
  return client;
}

/**
 * Health check connection to database
 */
export async function checkDatabaseConnection() {
  try {
    const res = await pool.query('SELECT 1 as connected, NOW() as current_time');
    return res.rows[0];
  } catch (err) {
    logger.error({ err }, 'Database health check failed');
    throw err;
  }
}

/**
 * Graceful close of the pool
 */
export async function closePool() {
  if (activePool && !activePool.ended) {
    await activePool.end();
    logger.info('Database pool closed cleanly');
  }
}
