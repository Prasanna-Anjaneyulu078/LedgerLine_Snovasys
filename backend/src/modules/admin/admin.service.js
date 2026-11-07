import { pool } from '../../config/database.js';
import { userRepository } from '../../repositories/user.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/appError.js';
import { formatRupees } from '../../utils/money.js';

export class AdminService {
  /**
   * Comprehensive database-aggregated telemetry for Admin Dashboard
   * Authoritative source of truth: PostgreSQL users, accounts, transactions, and audit_events
   */
  async getDashboardOverview() {
    const usersQuery = `
      SELECT
        count(*)::int as total_users,
        count(*) FILTER (WHERE is_active = true)::int as active_users
      FROM users;
    `;

    const accountsQuery = `
      SELECT
        count(*)::int as total_accounts,
        count(*) FILTER (WHERE status = 'ACTIVE')::int as active_accounts,
        COALESCE(SUM(balance), 0)::text as total_vault_balance_paise
      FROM accounts;
    `;

    const txnsQuery = `
      SELECT
        count(*)::int as total_transactions,
        count(*) FILTER (WHERE status = 'SUCCESS')::int as successful_transactions,
        count(*) FILTER (WHERE status = 'REFUSED')::int as refused_transactions,
        count(*) FILTER (WHERE status = 'FAILED')::int as failed_transactions,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DEPOSIT' AND status = 'SUCCESS'), 0)::text as total_deposits_paise,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'WITHDRAWAL' AND status = 'SUCCESS'), 0)::text as total_withdrawals_paise,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'TRANSFER' AND status = 'SUCCESS'), 0)::text as total_transfer_volume_paise
      FROM transactions;
    `;

    const auditQuery = `
      SELECT count(*)::int as total_audit_logs FROM audit_events;
    `;

    const typeDistQuery = `
      SELECT
        transaction_type,
        count(*)::int as count,
        count(*) FILTER (WHERE status = 'SUCCESS')::int as successful_count,
        count(*) FILTER (WHERE status = 'REFUSED')::int as refused_count,
        count(*) FILTER (WHERE status = 'FAILED')::int as failed_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'SUCCESS'), 0)::text as volume_paise
      FROM transactions
      GROUP BY transaction_type
      ORDER BY transaction_type ASC;
    `;

    const trendsQuery = `
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') as date,
        count(*)::int as total_count,
        count(*) FILTER (WHERE transaction_type = 'DEPOSIT' AND status = 'SUCCESS')::int as deposit_count,
        count(*) FILTER (WHERE transaction_type = 'WITHDRAWAL' AND status = 'SUCCESS')::int as withdrawal_count,
        count(*) FILTER (WHERE transaction_type = 'TRANSFER' AND status = 'SUCCESS')::int as transfer_count,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'DEPOSIT' AND status = 'SUCCESS'), 0)::text as deposit_volume_paise,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'WITHDRAWAL' AND status = 'SUCCESS'), 0)::text as withdrawal_volume_paise,
        COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'TRANSFER' AND status = 'SUCCESS'), 0)::text as transfer_volume_paise
      FROM transactions
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at) ASC
      LIMIT 14;
    `;

    const recentTxnsQuery = `
      SELECT t.id, t.transaction_reference, t.transaction_type, t.amount, t.status, t.created_at,
             sa.account_number as source_account_number,
             da.account_number as destination_account_number,
             u.full_name as initiator_name, u.email as initiator_email
      FROM transactions t
      LEFT JOIN accounts sa ON t.source_account_id = sa.id
      LEFT JOIN accounts da ON t.destination_account_id = da.id
      JOIN users u ON t.initiated_by = u.id
      ORDER BY t.created_at DESC
      LIMIT 8;
    `;

    const [usersRes, accountsRes, txnsRes, auditRes, trendsRes, recentTxnsRes, typeDistRes] = await Promise.all([
      pool.query(usersQuery),
      pool.query(accountsQuery),
      pool.query(txnsQuery),
      pool.query(auditQuery),
      pool.query(trendsQuery),
      pool.query(recentTxnsQuery),
      pool.query(typeDistQuery),
    ]);

    const usersData = usersRes.rows[0];
    const accountsData = accountsRes.rows[0];
    const txnsData = txnsRes.rows[0];
    const auditData = auditRes.rows[0];

    const overview = {
      totalUsers: usersData.total_users,
      activeUsers: usersData.active_users,
      inactiveUsers: usersData.total_users - usersData.active_users,
      totalAccounts: accountsData.total_accounts,
      activeAccounts: accountsData.active_accounts,
      inactiveAccounts: accountsData.total_accounts - accountsData.active_accounts,
      totalVaultBalancePaise: accountsData.total_vault_balance_paise,
      totalVaultBalanceFormatted: formatRupees(accountsData.total_vault_balance_paise),
      totalTransactions: txnsData.total_transactions,
      successfulTransactions: txnsData.successful_transactions,
      refusedTransactions: txnsData.refused_transactions,
      failedTransactions: txnsData.failed_transactions,
      unsuccessfulTransactions: txnsData.refused_transactions + txnsData.failed_transactions,
      totalDepositsPaise: txnsData.total_deposits_paise,
      totalDepositsFormatted: formatRupees(txnsData.total_deposits_paise),
      totalWithdrawalsPaise: txnsData.total_withdrawals_paise,
      totalWithdrawalsFormatted: formatRupees(txnsData.total_withdrawals_paise),
      totalTransferVolumePaise: txnsData.total_transfer_volume_paise,
      totalTransferVolumeFormatted: formatRupees(txnsData.total_transfer_volume_paise),
      totalAuditLogs: auditData.total_audit_logs,
    };

    const transactionTypeDistribution = typeDistRes.rows.map((row) => ({
      type: row.transaction_type,
      count: row.count,
      successfulCount: row.successful_count,
      refusedCount: row.refused_count,
      failedCount: row.failed_count,
      volumePaise: row.volume_paise,
      volumeFormatted: formatRupees(row.volume_paise),
    }));

    const transactionTrends = trendsRes.rows.map((row) => ({
      date: row.date,
      totalCount: row.total_count,
      depositCount: row.deposit_count,
      withdrawalCount: row.withdrawal_count,
      transferCount: row.transfer_count,
      depositVolumePaise: row.deposit_volume_paise,
      depositVolumeFormatted: formatRupees(row.deposit_volume_paise),
      withdrawalVolumePaise: row.withdrawal_volume_paise,
      withdrawalVolumeFormatted: formatRupees(row.withdrawal_volume_paise),
      transferVolumePaise: row.transfer_volume_paise,
      transferVolumeFormatted: formatRupees(row.transfer_volume_paise),
    }));

    const recentTransactions = recentTxnsRes.rows.map((tx) => ({
      id: tx.id,
      transactionReference: tx.transaction_reference,
      transactionType: tx.transaction_type,
      amountPaise: tx.amount.toString(),
      amountFormatted: formatRupees(tx.amount),
      status: tx.status,
      sourceAccountNumber: tx.source_account_number || null,
      destinationAccountNumber: tx.destination_account_number || null,
      initiatorName: tx.initiator_name,
      initiatorEmail: tx.initiator_email,
      createdAt: tx.created_at,
    }));

    return {
      overview,
      transactionTrends,
      transactionTypeDistribution,
      recentTransactions,
    };
  }

  async getAllUsers(query = {}) {
    return userRepository.findAll(query);
  }

  async getAllAccounts(query = {}) {
    const result = await accountRepository.findAll(query);
    return {
      ...result,
      accounts: result.accounts.map((acc) => ({
        ...acc,
        balancePaise: acc.balance.toString(),
        balanceFormatted: formatRupees(acc.balance),
      })),
    };
  }

  async updateUserStatus(userId, isActive, adminUser, context = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.id === adminUser.id && !isActive) {
      throw AppError.badRequest('Administrators cannot deactivate their own account');
    }

    const updated = await userRepository.updateStatus(userId, isActive);

    await auditRepository.create({
      actorId: adminUser.id,
      action: 'ADMIN_USER_STATUS_UPDATED',
      resourceType: 'USER',
      resourceId: userId,
      metadata: { previousStatus: user.is_active, newStatus: isActive },
      ipAddress: context.ipAddress,
    });

    return updated;
  }

  async updateAccountStatus(accountId, status, adminUser, context = {}) {
    const account = await accountRepository.findByIdOrAccountNumber(accountId);
    if (!account) {
      throw AppError.notFound('Account not found');
    }

    const validStatuses = ['ACTIVE', 'FROZEN', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      throw AppError.badRequest(`Invalid account status. Permitted: ${validStatuses.join(', ')}`);
    }

    const updated = await accountRepository.updateStatus(account.id, status);

    await auditRepository.create({
      actorId: adminUser.id,
      action: 'ADMIN_ACCOUNT_STATUS_UPDATED',
      resourceType: 'ACCOUNT',
      resourceId: account.id,
      metadata: { previousStatus: account.status, newStatus: status, accountNumber: account.account_number },
      ipAddress: context.ipAddress,
    });

    return updated;
  }
}

export const adminService = new AdminService();

