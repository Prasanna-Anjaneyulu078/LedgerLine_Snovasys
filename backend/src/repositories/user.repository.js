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
  async findAll({ page = 1, limit = 4, offset = null, search = null, role = null, isActive = null, status = null } = {}, client = pool) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 4));
    const offsetNum = offset !== null && offset !== undefined
      ? Math.max(0, parseInt(offset, 10) || 0)
      : (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      conditions.push(`(full_name ILIKE $${params.length} OR email ILIKE $${params.length})`);
    }

    if (role && typeof role === 'string' && role.trim() !== '') {
      params.push(role.trim().toUpperCase());
      conditions.push(`role = $${params.length}`);
    }

    let activeFilter = isActive;
    if (activeFilter === null || activeFilter === undefined) {
      if (status === 'ACTIVE') activeFilter = true;
      else if (status === 'SUSPENDED') activeFilter = false;
    }
    if (activeFilter !== null && activeFilter !== undefined && activeFilter !== '') {
      const boolVal = activeFilter === true || activeFilter === 'true';
      params.push(boolVal);
      conditions.push(`is_active = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `SELECT count(*) as total FROM users ${whereClause};`;
    const countRes = await client.query(countSql, params);
    const totalUsers = Number(countRes.rows[0]?.total || 0);

    const queryParams = [...params, limitNum, offsetNum];
    const sql = `
      SELECT id, full_name, email, role, is_active, created_at, updated_at
      FROM users
      ${whereClause}
      ORDER BY created_at DESC, id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;

    const rowsRes = await client.query(sql, queryParams);

    const totalPages = totalUsers > 0 ? Math.ceil(totalUsers / limitNum) : 0;

    return {
      users: rowsRes.rows,
      total: totalUsers,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalUsers,
        totalPages,
      },
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

