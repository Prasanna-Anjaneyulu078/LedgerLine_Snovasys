import { pool } from '../config/database.js';

export class RefreshTokenRepository {
  /**
   * Persist a new refresh token record with SHA-256 token hash
   */
  async create({ userId, tokenHash, expiresAt, userAgent = null, ipAddress = null }, client = pool) {
    const sql = `
      INSERT INTO refresh_tokens (
        user_id, token_hash, expires_at, user_agent, ip_address
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_hash, user_agent, ip_address, created_at;
    `;
    const res = await client.query(sql, [
      userId,
      tokenHash,
      expiresAt,
      userAgent,
      ipAddress,
    ]);
    return res.rows[0];
  }

  /**
   * Find a refresh token by its SHA-256 hash
   */
  async findByTokenHash(tokenHash, client = pool) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_hash, user_agent, ip_address, created_at
      FROM refresh_tokens
      WHERE token_hash = $1;
    `;
    const res = await client.query(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  /**
   * Find and row-lock a refresh token by its SHA-256 hash inside an active transaction
   */
  async findByTokenHashForUpdate(tokenHash, client) {
    const sql = `
      SELECT id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_hash, user_agent, ip_address, created_at
      FROM refresh_tokens
      WHERE token_hash = $1
      FOR UPDATE;
    `;
    const res = await client.query(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  /**
   * Atomically revoke an active refresh token and optionally record its replacement hash
   */
  async revokeById(id, replacedByTokenHash = null, client = pool) {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW(), replaced_by_token_hash = $1
      WHERE id = $2 AND revoked_at IS NULL
      RETURNING id, user_id, token_hash, expires_at, revoked_at, replaced_by_token_hash;
    `;
    const res = await client.query(sql, [replacedByTokenHash, id]);
    return res.rows[0] || null;
  }

  /**
   * Revoke an active refresh token by its token hash
   */
  async revokeByTokenHash(tokenHash, client = pool) {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE token_hash = $1 AND revoked_at IS NULL
      RETURNING id, user_id, token_hash, revoked_at;
    `;
    const res = await client.query(sql, [tokenHash]);
    return res.rows[0] || null;
  }

  /**
   * Revoke all active sessions for a user (used on reuse detection or security reset)
   */
  async revokeAllForUser(userId, client = pool) {
    const sql = `
      UPDATE refresh_tokens
      SET revoked_at = NOW()
      WHERE user_id = $1 AND revoked_at IS NULL;
    `;
    const res = await client.query(sql, [userId]);
    return res.rowCount;
  }

  /**
   * Delete stale tokens older than 30 days past expiration
   */
  async deleteExpired(client = pool) {
    const sql = `
      DELETE FROM refresh_tokens
      WHERE expires_at < NOW() - INTERVAL '30 days';
    `;
    const res = await client.query(sql);
    return res.rowCount;
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();

