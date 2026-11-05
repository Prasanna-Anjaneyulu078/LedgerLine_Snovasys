import { pool } from '../config/database.js';

export class UserRepository {
  /**
   * Create a new user
   */
  async create({ fullName, email, passwordHash, role = 'ACCOUNT_HOLDER' }, client = pool) {
    const sql = `
      INSERT INTO users (full_name, email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4, true)
      RETURNING id, full_name, email, role, is_active, created_at, updated_at;
    `;
    const res = await client.query(sql, [fullName, email, passwordHash, role]);
    return res.rows[0];
  }

  /**
   * Find user by unique email
   */
  async findByEmail(email, client = pool) {
    const sql = `
      SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1);
    `;
    const res = await client.query(sql, [email]);
    return res.rows[0] || null;
  }

  /**
   * Find user by ID (excluding password hash by default)
   */
  async findById(id, client = pool) {
    const sql = `
      SELECT id, full_name, email, role, is_active, created_at, updated_at
      FROM users
      WHERE id = $1;
    `;
    const res = await client.query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Find user by ID including password hash (for credential verification)
   */
  async findByIdWithPassword(id, client = pool) {
    const sql = `
      SELECT id, full_name, email, password_hash, role, is_active, created_at, updated_at
      FROM users
      WHERE id = $1;
    `;
    const res = await client.query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Retrieve all users with optional filtering and pagination
   */
  async findAll({ limit = 50, offset = 0, role = null, isActive = null } = {}, client = pool) {
    const conditions = [];
    const params = [];

    if (role) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }

    if (isActive !== null && isActive !== undefined) {
      params.push(isActive);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const sql = `
      SELECT id, full_name, email, role, is_active, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countSql = `SELECT count(*) as total FROM users ${whereClause};`;

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)),
    ]);

    return {
      users: rowsRes.rows,
      total: Number(countRes.rows[0].total),
    };
  }

  /**
   * Update active status of a user
   */
  async updateStatus(id, isActive, client = pool) {
    const sql = `
      UPDATE users
      SET is_active = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, full_name, email, role, is_active, updated_at;
    `;
    const res = await client.query(sql, [id, isActive]);
    return res.rows[0] || null;
  }
}

export const userRepository = new UserRepository();

