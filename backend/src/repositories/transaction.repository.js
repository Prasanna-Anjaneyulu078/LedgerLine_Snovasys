import { pool } from '../config/database.js';

export class TransactionRepository {
  /**
   * Create a transaction record
   */
  async create(
    {
      transactionReference,
      transactionType,
      sourceAccountId = null,
      destinationAccountId = null,
      amount,
      status = 'PENDING',
      initiatedBy,
      description = null,
    },
    client = pool
  ) {
    const sql = `
      INSERT INTO transactions (
        transaction_reference, transaction_type, source_account_id,
        destination_account_id, amount, status, initiated_by, description
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, transaction_reference, transaction_type, source_account_id,
                destination_account_id, amount, status, initiated_by, description, created_at;
    `;
    const res = await client.query(sql, [
      transactionReference,
      transactionType,
      sourceAccountId,
      destinationAccountId,
      amount,
      status,
      initiatedBy,
      description,
    ]);
    return res.rows[0];
  }

  /**
   * Find transaction by primary key
   */
  async findById(id, client = pool) {
    const sql = `
      SELECT t.id, t.transaction_reference, t.transaction_type, t.source_account_id,
             t.destination_account_id, t.amount, t.status, t.initiated_by, t.description, t.created_at,
             sa.account_number as source_account_number,
             da.account_number as destination_account_number,
             u.full_name as initiator_name, u.email as initiator_email
      FROM transactions t
      LEFT JOIN accounts sa ON t.source_account_id = sa.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      JOIN users u ON t.initiated_by = u.id
      WHERE t.id = $1;
    `;
    const res = await client.query(sql, [id]);
    return res.rows[0] || null;
  }

  /**
   * Find transaction by unique reference
   */
  async findByReference(reference, client = pool) {
    const sql = `
      SELECT t.id, t.transaction_reference, t.transaction_type, t.source_account_id,
             t.destination_account_id, t.amount, t.status, t.initiated_by, t.description, t.created_at
      FROM transactions t
      WHERE t.transaction_reference = $1;
    `;
    const res = await client.query(sql, [reference]);
    return res.rows[0] || null;
  }

  /**
   * Find all transactions with filtering and pagination
   */
  async findAll(
    {
      limit = 15,
      offset = null,
      page = null,
      accountId = null,
      status = null,
      type = null,
      startDate = null,
      endDate = null,
      search = null,
    } = {},
    client = pool
  ) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : null;
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const offsetNum = offset !== null && offset !== undefined
      ? Math.max(0, parseInt(offset, 10) || 0)
      : pageNum
      ? (pageNum - 1) * limitNum
      : 0;

    const conditions = [];
    const params = [];

    if (search && typeof search === 'string' && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      conditions.push(
        `(t.transaction_reference ILIKE $${params.length} OR t.description ILIKE $${params.length} OR sa.account_number ILIKE $${params.length} OR da.account_number ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`
      );
    }

    if (accountId) {
      params.push(accountId);
      conditions.push(`(t.source_account_id = $${params.length} OR t.destination_account_id = $${params.length})`);
    }

    if (status && status !== 'ALL' && typeof status === 'string' && status.trim() !== '') {
      params.push(status.trim().toUpperCase());
      conditions.push(`t.status = $${params.length}`);
    }

    if (type && type !== 'ALL' && typeof type === 'string' && type.trim() !== '') {
      params.push(type.trim().toUpperCase());
      conditions.push(`t.transaction_type = $${params.length}`);
    }

    if (startDate) {
      params.push(startDate);
      conditions.push(`t.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`t.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT count(*) as total
      FROM transactions t
      LEFT JOIN accounts sa ON t.source_account_id = sa.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      JOIN users u ON t.initiated_by = u.id
      ${whereClause};
    `;
    const countRes = await client.query(countSql, params);
    const totalTransactions = Number(countRes.rows[0]?.total || 0);

    const queryParams = [...params, limitNum, offsetNum];
    const sql = `
      SELECT t.id, t.transaction_reference, t.transaction_type, t.source_account_id,
             t.destination_account_id, t.amount, t.status, t.initiated_by, t.description, t.created_at,
             sa.account_number as source_account_number,
             da.account_number as destination_account_number,
             u.full_name as initiator_name, u.email as initiator_email
      FROM transactions t
      LEFT JOIN accounts sa ON t.source_account_id = sa.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      JOIN users u ON t.initiated_by = u.id
      ${whereClause}
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;

    const rowsRes = await client.query(sql, queryParams);
    const totalPages = totalTransactions > 0 ? Math.ceil(totalTransactions / limitNum) : 0;

    return {
      transactions: rowsRes.rows,
      total: totalTransactions,
      pagination: {
        page: pageNum || Math.floor(offsetNum / limitNum) + 1,
        limit: limitNum,
        totalTransactions,
        totalPages,
      },
    };
  }

  /**
   * Update transaction status
   */
  async updateStatus(id, status, client = pool) {
    const sql = `
      UPDATE transactions
      SET status = $2
      WHERE id = $1
      RETURNING id, transaction_reference, status;
    `;
    const res = await client.query(sql, [id, status]);
    return res.rows[0] || null;
  }
}

export const transactionRepository = new TransactionRepository();

