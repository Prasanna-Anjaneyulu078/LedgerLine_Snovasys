import { pool } from '../config/database.js';

export class LedgerRepository {
  /**
   * Insert immutable ledger entry
   * Notice: Append-Only! No update or delete operations exist.
   */
  async create({ transactionId, accountId, entryType, amount, balanceAfter }, client = pool) {
    const sql = `
      INSERT INTO ledger_entries (
        transaction_id, account_id, entry_type, amount, balance_after
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, transaction_id, account_id, entry_type, amount, balance_after, created_at;
    `;
    const res = await client.query(sql, [transactionId, accountId, entryType, amount, balanceAfter]);
    return res.rows[0];
  }

  /**
   * Find all ledger entries for a transaction (verifies double-entry balancing)
   */
  async findByTransactionId(transactionId, client = pool) {
    const sql = `
      SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.balance_after, le.created_at,
             a.account_number
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      WHERE le.transaction_id = $1
      ORDER BY le.created_at ASC;
    `;
    const res = await client.query(sql, [transactionId]);
    return res.rows;
  }

  /**
   * Find ledger statement for an account
   */
  async findByAccountId(
    accountId,
    { limit = 50, offset = 0, startDate = null, endDate = null } = {},
    client = pool
  ) {
    const conditions = ['le.account_id = $1'];
    const params = [accountId];

    if (startDate) {
      params.push(startDate);
      conditions.push(`le.created_at >= $${params.length}`);
    }

    if (endDate) {
      params.push(endDate);
      conditions.push(`le.created_at <= $${params.length}`);
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const sql = `
      SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.balance_after, le.created_at,
             t.transaction_reference, t.transaction_type, t.description, t.status as transaction_status,
             u.full_name as initiator_name
      FROM ledger_entries le
      JOIN transactions t ON le.transaction_id = t.id
      JOIN users u ON t.initiated_by = u.id
      ${whereClause}
      ORDER BY le.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length};
    `;

    const countSql = `SELECT count(*) as total FROM ledger_entries le ${whereClause};`;

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, params),
      client.query(countSql, params.slice(0, -2)),
    ]);

    return {
      entries: rowsRes.rows,
      total: Number(countRes.rows[0].total),
    };
  }

  /**
   * Find global ledger records (auditor view)
   */
  async findAll({ limit = 50, offset = 0 } = {}, client = pool) {
    const sql = `
      SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.balance_after, le.created_at,
             a.account_number, t.transaction_reference, t.transaction_type
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      JOIN transactions t ON le.transaction_id = t.id
      ORDER BY le.created_at DESC
      LIMIT $1 OFFSET $2;
    `;
    const countSql = 'SELECT count(*) as total FROM ledger_entries;';

    const [rowsRes, countRes] = await Promise.all([
      client.query(sql, [limit, offset]),
      client.query(countSql),
    ]);

    return {
      entries: rowsRes.rows,
      total: Number(countRes.rows[0].total),
    };
  }

  /**
   * Accounting Invariant Check:
   * Net balance calculated from sum of CREDIT minus DEBIT must equal the account's current balance
   */
  async calculateNetBalanceFromLedger(accountId, client = pool) {
    const sql = `
      SELECT 
        COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) AS calculated_balance
      FROM ledger_entries
      WHERE account_id = $1;
    `;
    const res = await client.query(sql, [accountId]);
    return res.rows[0].calculated_balance;
  }
}

export const ledgerRepository = new LedgerRepository();

