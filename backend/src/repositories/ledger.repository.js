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
   * Find ledger statement for an account with exact integer paise calculations
   * Computes opening balance, closing balance, total debits, and total credits
   * accurately across the requested statement period and across all pages.
   */
  async findByAccountId(
    accountId,
    { limit = 50, offset = 0, page = null, startDate = null, endDate = null } = {},
    client = pool
  ) {
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : null;
    const offsetNum = offset !== null && offset !== undefined && page === null
      ? Math.max(0, parseInt(offset, 10) || 0)
      : pageNum
      ? (pageNum - 1) * limitNum
      : Math.max(0, parseInt(offset, 10) || 0);

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

    // 1. Period Summary Query (total entries, debits, credits, and date boundaries)
    const summarySql = `
      SELECT
        count(*)::int as total_entries,
        COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type = 'DEBIT'), 0)::text as total_debits_paise,
        COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type = 'CREDIT'), 0)::text as total_credits_paise,
        COUNT(*) FILTER (WHERE le.entry_type = 'DEBIT')::int as debit_count,
        COUNT(*) FILTER (WHERE le.entry_type = 'CREDIT')::int as credit_count,
        MIN(le.created_at) as first_entry_date,
        MAX(le.created_at) as last_entry_date
      FROM ledger_entries le
      ${whereClause};
    `;

    // 2. Opening Balance Query: Balance immediately before startDate (or 0n if no prior entries/inception)
    let openingBalancePaise = 0n;
    if (startDate) {
      const priorSql = `
        SELECT balance_after
        FROM ledger_entries
        WHERE account_id = $1 AND created_at < $2
        ORDER BY created_at DESC, id DESC
        LIMIT 1;
      `;
      const priorRes = await client.query(priorSql, [accountId, startDate]);
      if (priorRes.rows.length > 0) {
        openingBalancePaise = BigInt(priorRes.rows[0].balance_after);
      }
    }

    // 3. Paginated Entries Query
    const queryParams = [...params, limitNum, offsetNum];
    const sql = `
      SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.balance_after, le.created_at,
             t.transaction_reference, t.transaction_type, t.description, t.status as transaction_status,
             u.full_name as initiator_name
      FROM ledger_entries le
      JOIN transactions t ON le.transaction_id = t.id
      JOIN users u ON t.initiated_by = u.id
      ${whereClause}
      ORDER BY le.created_at DESC, le.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;

    const [summaryRes, rowsRes] = await Promise.all([
      client.query(summarySql, params),
      client.query(sql, queryParams),
    ]);

    const summaryRow = summaryRes.rows[0] || {};
    const totalEntries = Number(summaryRow.total_entries || 0);
    const totalDebitsPaise = BigInt(summaryRow.total_debits_paise || '0');
    const totalCreditsPaise = BigInt(summaryRow.total_credits_paise || '0');

    // 4. Closing Balance Calculation:
    // By double-entry mathematical identity:
    // Closing Balance = Opening Balance + Total Credits - Total Debits
    let closingBalancePaise = openingBalancePaise + totalCreditsPaise - totalDebitsPaise;

    // In case no date filter was supplied and account has 0 entries, query account balance as fallback
    if (totalEntries === 0 && !startDate && !endDate) {
      const accRes = await client.query('SELECT balance FROM accounts WHERE id = $1;', [accountId]);
      if (accRes.rows.length > 0) {
        closingBalancePaise = BigInt(accRes.rows[0].balance);
        openingBalancePaise = closingBalancePaise;
      }
    }

    const totalPages = totalEntries > 0 ? Math.ceil(totalEntries / limitNum) : 1;
    const resolvedPage = pageNum || Math.floor(offsetNum / limitNum) + 1;

    return {
      entries: rowsRes.rows,
      total: totalEntries,
      totalDebitsPaise: totalDebitsPaise.toString(),
      totalCreditsPaise: totalCreditsPaise.toString(),
      openingBalancePaise: openingBalancePaise.toString(),
      closingBalancePaise: closingBalancePaise.toString(),
      debitCount: Number(summaryRow.debit_count || 0),
      creditCount: Number(summaryRow.credit_count || 0),
      firstEntryDate: summaryRow.first_entry_date || null,
      lastEntryDate: summaryRow.last_entry_date || null,
      pagination: {
        page: resolvedPage,
        limit: limitNum,
        offset: offsetNum,
        totalEntries,
        totalPages,
      },
    };
  }

  /**
   * Find global ledger records (auditor / admin view)
   * With authoritative database-aggregated credit and debit totals
   */
  async findAll({ limit = 15, offset = null, page = null, entryType = null, search = null } = {}, client = pool) {
    const pageNum = page ? Math.max(1, parseInt(page, 10) || 1) : null;
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const offsetNum = offset !== null && offset !== undefined
      ? Math.max(0, parseInt(offset, 10) || 0)
      : pageNum
      ? (pageNum - 1) * limitNum
      : 0;

    const conditions = [];
    const params = [];

    if (entryType && entryType !== 'ALL' && typeof entryType === 'string' && entryType.trim() !== '') {
      params.push(entryType.trim().toUpperCase());
      conditions.push(`le.entry_type = $${params.length}`);
    }

    if (search && typeof search === 'string' && search.trim() !== '') {
      params.push(`%${search.trim()}%`);
      conditions.push(`(t.transaction_reference ILIKE $${params.length} OR a.account_number ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const summarySql = `
      SELECT
        count(*)::int as total,
        COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type = 'CREDIT'), 0)::text as total_credits_paise,
        COALESCE(SUM(le.amount) FILTER (WHERE le.entry_type = 'DEBIT'), 0)::text as total_debits_paise
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      JOIN transactions t ON le.transaction_id = t.id
      ${whereClause};
    `;
    const summaryRes = await client.query(summarySql, params);
    const summary = summaryRes.rows[0];
    const totalEntries = Number(summary?.total || 0);

    const queryParams = [...params, limitNum, offsetNum];
    const sql = `
      SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.balance_after, le.created_at,
             a.account_number, t.transaction_reference, t.transaction_type, t.description
      FROM ledger_entries le
      JOIN accounts a ON le.account_id = a.id
      JOIN transactions t ON le.transaction_id = t.id
      ${whereClause}
      ORDER BY le.created_at DESC, le.id DESC
      LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length};
    `;

    const rowsRes = await client.query(sql, queryParams);
    const totalPages = totalEntries > 0 ? Math.ceil(totalEntries / limitNum) : 0;

    return {
      entries: rowsRes.rows,
      total: totalEntries,
      totalCreditsPaise: summary.total_credits_paise,
      totalDebitsPaise: summary.total_debits_paise,
      pagination: {
        page: pageNum || Math.floor(offsetNum / limitNum) + 1,
        limit: limitNum,
        totalEntries,
        totalPages,
      },
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

