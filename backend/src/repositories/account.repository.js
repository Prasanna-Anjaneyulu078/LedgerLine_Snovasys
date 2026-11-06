import { pool } from '../config/database.js';

export class AccountRepository {
  /**
   * Create a new bank account
   */
  async create({ accountNumber, ownerId, accountType = 'SAVINGS', currency = 'INR', initialBalance = 0n }, client = pool) {
    const sql = `
      INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
      VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
      RETURNING id, account_number, owner_id, account_type, currency, balance, status, created_at, updated_at;
    `;
    const res = await client.query(sql, [accountNumber, ownerId, accountType, currency, initialBalance]);
    return res.rows[0];
  }

  isUuid(str) {
    return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str.trim());
  }

  /**
   * Find account by either ID (UUID) or Account Number (e.g. LL-ACC-1001)
   */
  async findByIdOrAccountNumber(identifier, client = pool) {
    if (!identifier) return null;
    const cleanId = String(identifier).trim();
    if (this.isUuid(cleanId)) {
      const byId = await this.findById(cleanId, client);
      if (byId) return byId;
    }
    return await this.findByAccountNumber(cleanId, client);
  }

  /**
   * Find account by ID
   */
  async findById(id, client = pool) {
    const sql = `
      SELECT a.id, a.account_number, a.owner_id, a.account_type, a.currency, a.balance, a.status, a.created_at, a.updated_at,
             u.full_name as owner_name, u.email as owner_email
      FROM accounts a
      JOIN users u ON a.owner_id = u.id
      WHERE a.id = $1;
    `;
    const res = await client.query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Find account by account number
   */
  async findByAccountNumber(accountNumber, client = pool) {
    const sql = `
      SELECT a.id, a.account_number, a.owner_id, a.account_type, a.currency, a.balance, a.status, a.created_at, a.updated_at,
             u.full_name as owner_name, u.email as owner_email
      FROM accounts a
      JOIN users u ON a.owner_id = u.id
      WHERE a.account_number = $1;
    `;
    const res = await client.query(sql, [accountNumber]);
    return res.rows[0] || null;
  }

  /**
   * Find all accounts for a specific user
   */
  async findByOwnerId(ownerId, client = pool) {
    const sql = `
      SELECT id, account_number, owner_id, account_type, currency, balance, status, created_at, updated_at
      FROM accounts
      WHERE owner_id = $1
      ORDER BY created_at ASC;
    `;
    const res = await client.query(sql, [ownerId]);
    return res.rows;
  }

  /**
   * Find all accounts system-wide (admin/auditor view)
   */
  async findAll({ limit = 50, offset = 0, status = null, accountType = null } = {}, client = pool) {
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }

    if (accountType) {
      params.push(accountType);
      conditions.push(`a.account_type = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const sql = `
      SELECT a.id, a.account_number, a.owner_id, a.account_type, a.currency, a.balance, a.status, a.created_at, a.updated_at,
             u.full_name as owner_name, u.email as owner_email
      FROM accounts a
      JOIN users u ON a.owner_id = u.id
      ${whereClause}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countSql = `SELECT count(*) as total FROM accounts a ${whereClause};`;

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)),
    ]);

    return {
      accounts: rowsRes.rows,
      total: Number(countRes.rows[0].total),
    };
  }

  /**
   * Concurrency Safe: Acquire row lock on a single account
   * Must be called within an active transaction with a checked-out client!
   */
  async findByIdForUpdate(id, client) {
    let accountId = id;
    if (!this.isUuid(id)) {
      const acc = await this.findByAccountNumber(id, client);
      if (!acc) return null;
      accountId = acc.id;
    }
    const sql = `
      SELECT id, account_number, owner_id, account_type, currency, balance, status, created_at, updated_at
      FROM accounts
      WHERE id = $1
      FOR UPDATE;
    `;
    const res = await client.query(sql, [accountId]);
    return res.rows[0] || null;
  }

  /**
   * Concurrency Safe: Acquire deterministic row locks on two accounts to eliminate deadlocks.
   * By ordering by account ID (lexicographically or numerically), simultaneous transfers
   * between Account A and Account B (in opposite directions) acquire locks in the exact same order!
   */
  async findTwoForUpdate(accountId1, accountId2, client) {
    if (accountId1 === accountId2) {
      const acc = await this.findByIdForUpdate(accountId1, client);
      return [acc, acc];
    }

    // Determine deterministic locking order
    const orderedIds = [accountId1, accountId2].sort();

    const sql = `
      SELECT id, account_number, owner_id, account_type, currency, balance, status, created_at, updated_at
      FROM accounts
      WHERE id = ANY($1::uuid[])
      ORDER BY id ASC
      FOR UPDATE;
    `;
    const res = await client.query(sql, [orderedIds]);

    const accMap = new Map(res.rows.map((row) => [row.id, row]));
    return [accMap.get(accountId1) || null, accMap.get(accountId2) || null];
  }

  /**
   * Update account balance (must be called inside transaction)
   */
  async updateBalance(id, newBalance, client) {
    const sql = `
      UPDATE accounts
      SET balance = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, account_number, balance, status, updated_at;
    `;
    const res = await client.query(sql, [id, newBalance]);
    return res.rows[0];
  }

  /**
   * Update account status (e.g. ACTIVE, FROZEN, CLOSED)
   */
  async updateStatus(id, status, client = pool) {
    const sql = `
      UPDATE accounts
      SET status = $2, updated_at = NOW()
      WHERE id = $1
      RETURNING id, account_number, status, updated_at;
    `;
    const res = await client.query(sql, [id, status]);
    return res.rows[0] || null;
  }
}

export const accountRepository = new AccountRepository();

