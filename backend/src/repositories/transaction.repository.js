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
      limit = 50,
      offset = 0,
      accountId = null,
      status = null,
      type = null,
      startDate = null,
      endDate = null,
    } = {},
    client = pool
  ) {
    const conditions = [];
    const params = [];

    if (accountId) {
      params.push(accountId);
      conditions.push(`(t.source_account_id = $${params.length} OR t.destination_account_id = $${params.length})`);
    }

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (type) {
      params.push(type);
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

    params.push(limit, offset);
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
      ORDER BY t.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countSql = `SELECT count(*) as total FROM transactions t ${whereClause};`;

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)),
    ]);

    return {
      transactions: rowsRes.rows,
      total: Number(countRes.rows[0].total),
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

