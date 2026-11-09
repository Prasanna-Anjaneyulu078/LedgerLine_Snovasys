import { pool } from '../config/database.js';

export class IdempotencyRepository {
  /**
   * Find idempotency record by user and key
   */
  async findByKey(userId, idempotencyKey, client = pool) {
    const sql = `
      SELECT id, idempotency_key, user_id, request_hash, transaction_id, response_status, response_body, created_at, expires_at
      FROM idempotency_keys
      WHERE user_id = $1 AND idempotency_key = $2;
    `;
    const res = await client.query(sql, [userId, idempotencyKey]);
    return res.rows[0] || null;
  }

  /**
   * Insert initial idempotency reservation with uniqueness constraint
   */
  async create(
    { idempotencyKey, userId, requestHash, expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) },
    client = pool
  ) {
    const sql = `
      INSERT INTO idempotency_keys (
        idempotency_key, user_id, request_hash, expires_at
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id, idempotency_key, user_id, request_hash, created_at, expires_at;
    `;
    const res = await client.query(sql, [idempotencyKey, userId, requestHash, expiresAt]);
    return res.rows[0];
  }

  /**
   * Complete idempotency record with execution result
   */
  async complete(id, { transactionId, responseStatus, responseBody }, client = pool) {
    const sql = `
      UPDATE idempotency_keys
      SET transaction_id = $2, response_status = $3, response_body = $4
      WHERE id = $1
      RETURNING id, idempotency_key, response_status, response_body;
    `;
    const res = await client.query(sql, [
      id,
      transactionId,
      responseStatus,
      JSON.stringify(responseBody),
    ]);
    return res.rows[0];
  }

  /**
   * Delete an uncommitted / failed idempotency reservation
   */
  async deleteByKey(userId, idempotencyKey, client = pool) {
    const sql = `
      DELETE FROM idempotency_keys
      WHERE user_id = $1 AND idempotency_key = $2 AND response_status IS NULL;
    `;
    await client.query(sql, [userId, idempotencyKey]);
  }

  /**
   * Delete an expired idempotency reservation past its 24-hour expiration window
   */
  async deleteExpiredByKey(userId, idempotencyKey, client = pool) {
    const sql = `
      DELETE FROM idempotency_keys
      WHERE user_id = $1 AND idempotency_key = $2 AND expires_at <= NOW();
    `;
    await client.query(sql, [userId, idempotencyKey]);
  }
}

export const idempotencyRepository = new IdempotencyRepository();

