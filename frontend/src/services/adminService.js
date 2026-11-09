import api from './api.js';
import { normalizeAccount, accountService } from './accountService.js';
import { formatCurrency } from '../utils/formatCurrency.js';

export function normalizeUser(u) {
  if (!u) return null;
  const isActive = u.is_active ?? u.isActive ?? true;
  return {
    ...u,
    id: u.id,
    name: u.full_name || u.fullName || u.name,
    fullName: u.full_name || u.fullName || u.name,
    email: u.email,
    role: u.role,
    isActive,
    status: isActive ? 'ACTIVE' : 'SUSPENDED',
    createdAt: u.created_at || u.createdAt,
  };
}

export function normalizeDashboardOverview(data) {
  if (!data) return null;
  const rawOverview = data.overview || data;

  const totalUsers = Number(rawOverview.totalUsers ?? rawOverview.total_users ?? 0);
  const activeUsers = Number(rawOverview.activeUsers ?? rawOverview.active_users ?? 0);
  const inactiveUsers = Number(
    rawOverview.inactiveUsers ??
    rawOverview.inactive_users ??
    Math.max(0, totalUsers - activeUsers)
  );

  const totalAccounts = Number(rawOverview.totalAccounts ?? rawOverview.total_accounts ?? 0);
  const activeAccounts = Number(rawOverview.activeAccounts ?? rawOverview.active_accounts ?? 0);
  const inactiveAccounts = Number(
    rawOverview.inactiveAccounts ??
    rawOverview.inactive_accounts ??
    Math.max(0, totalAccounts - activeAccounts)
  );

  const totalTransactions = Number(rawOverview.totalTransactions ?? rawOverview.total_transactions ?? 0);
  const successfulTransactions = Number(rawOverview.successfulTransactions ?? rawOverview.successful_transactions ?? 0);
  const refusedTransactions = Number(rawOverview.refusedTransactions ?? rawOverview.refused_transactions ?? 0);
  const failedTransactions = Number(rawOverview.failedTransactions ?? rawOverview.failed_transactions ?? 0);
  const unsuccessfulTransactions = Number(
    rawOverview.unsuccessfulTransactions ??
    rawOverview.unsuccessful_transactions ??
    (refusedTransactions + failedTransactions)
  );

  return {
    ...data,
    overview: {
      ...rawOverview,
      totalUsers,
      activeUsers,
      inactiveUsers,
      totalAccounts,
      activeAccounts,
      inactiveAccounts,
      totalTransactions,
      successfulTransactions,
      refusedTransactions,
      failedTransactions,
      unsuccessfulTransactions,
      totalVaultBalancePaise: rawOverview.totalVaultBalancePaise ?? rawOverview.total_vault_balance_paise ?? '0',
      totalVaultBalanceFormatted: formatCurrency(rawOverview.totalVaultBalanceFormatted ?? (Number(rawOverview.totalVaultBalancePaise ?? rawOverview.total_vault_balance_paise ?? 0) / 100)),
      totalDepositsPaise: rawOverview.totalDepositsPaise ?? rawOverview.total_deposits_paise ?? '0',
      totalDepositsFormatted: formatCurrency(rawOverview.totalDepositsFormatted ?? (Number(rawOverview.totalDepositsPaise ?? rawOverview.total_deposits_paise ?? 0) / 100)),
      totalWithdrawalsPaise: rawOverview.totalWithdrawalsPaise ?? rawOverview.total_withdrawals_paise ?? '0',
      totalWithdrawalsFormatted: formatCurrency(rawOverview.totalWithdrawalsFormatted ?? (Number(rawOverview.totalWithdrawalsPaise ?? rawOverview.total_withdrawals_paise ?? 0) / 100)),
      totalTransferVolumePaise: rawOverview.totalTransferVolumePaise ?? rawOverview.total_transfer_volume_paise ?? '0',
      totalTransferVolumeFormatted: formatCurrency(rawOverview.totalTransferVolumeFormatted ?? (Number(rawOverview.totalTransferVolumePaise ?? rawOverview.total_transfer_volume_paise ?? 0) / 100)),
      totalAuditLogs: Number(rawOverview.totalAuditLogs ?? rawOverview.total_audit_logs ?? 0),
    },
    transactionTrends: (data.transactionTrends || data.trends || []).map((t) => ({
      ...t,
      date: t.date,
      totalCount: Number(t.totalCount ?? t.total_count ?? 0),
      depositCount: Number(t.depositCount ?? t.deposit_count ?? 0),
      withdrawalCount: Number(t.withdrawalCount ?? t.withdrawal_count ?? 0),
      transferCount: Number(t.transferCount ?? t.transfer_count ?? 0),
      depositVolumePaise: t.depositVolumePaise ?? t.deposit_volume_paise ?? '0',
      depositVolumeFormatted: formatCurrency(t.depositVolumeFormatted ?? (Number(t.depositVolumePaise ?? t.deposit_volume_paise ?? 0) / 100)),
      withdrawalVolumePaise: t.withdrawalVolumePaise ?? t.withdrawal_volume_paise ?? '0',
      withdrawalVolumeFormatted: formatCurrency(t.withdrawalVolumeFormatted ?? (Number(t.withdrawalVolumePaise ?? t.withdrawal_volume_paise ?? 0) / 100)),
      transferVolumePaise: t.transferVolumePaise ?? t.transfer_volume_paise ?? '0',
      transferVolumeFormatted: formatCurrency(t.transferVolumeFormatted ?? (Number(t.transferVolumePaise ?? t.transfer_volume_paise ?? 0) / 100)),
    })),
    transactionTypeDistribution: (data.transactionTypeDistribution || data.typeDistribution || []).map((td) => ({
      ...td,
      type: td.type || td.transaction_type,
      count: Number(td.count || 0),
      successfulCount: Number(td.successfulCount ?? td.successful_count ?? 0),
      refusedCount: Number(td.refusedCount ?? td.refused_count ?? 0),
      failedCount: Number(td.failedCount ?? td.failed_count ?? 0),
      volumePaise: td.volumePaise ?? td.volume_paise ?? '0',
      volumeFormatted: formatCurrency(td.volumeFormatted ?? (Number(td.volumePaise ?? td.volume_paise ?? 0) / 100)),
    })),
    recentTransactions: (data.recentTransactions || []).map((tx) => ({
      ...tx,
      id: tx.id,
      transactionReference: tx.transactionReference || tx.transaction_reference,
      transactionType: tx.transactionType || tx.transaction_type,
      amountPaise: tx.amountPaise || tx.amount?.toString() || '0',
      amountFormatted: formatCurrency(tx.amountFormatted ?? (Number(tx.amountPaise || tx.amount || 0) / 100)),
      status: tx.status,
      sourceAccountNumber: tx.sourceAccountNumber || tx.source_account_number,
      destinationAccountNumber: tx.destinationAccountNumber || tx.destination_account_number,
      initiatorName: tx.initiatorName || tx.initiator_name,
      initiatorEmail: tx.initiatorEmail || tx.initiator_email,
      createdAt: tx.createdAt || tx.created_at,
    })),
    recentUsers: (data.recentUsers || []).map((u) => ({
      ...u,
      id: u.id,
      name: u.fullName || u.full_name || u.name,
      fullName: u.fullName || u.full_name || u.name,
      email: u.email,
      role: u.role,
      isActive: u.isActive ?? u.is_active ?? true,
      status: (u.isActive ?? u.is_active ?? true) ? 'ACTIVE' : 'SUSPENDED',
      createdAt: u.createdAt || u.created_at,
    })),
  };
}

export const adminService = {
  /**
   * Retrieve authoritative PostgreSQL aggregate telemetry for Admin Dashboard
   */
  async getDashboardOverview() {
    const response = await api.get('/admin/dashboard');
    const raw = response.data?.data || response.data;
    return normalizeDashboardOverview(raw);
  },

  /**
   * List all registered users (Admin only)
   * Supports server-side pagination, search, role and status filtering
   */
  async getUsers(query = {}) {
    const response = await api.get('/admin/users', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.users || (Array.isArray(payload) ? payload : []);
    const normalizedUsers = rawList.map(normalizeUser);
    const pagination = payload?.pagination || {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 15,
      totalUsers: payload?.total ?? normalizedUsers.length,
      totalPages: Math.ceil((payload?.total ?? normalizedUsers.length) / (Number(query.limit) || 15)),
    };

    const result = normalizedUsers;
    result.users = normalizedUsers;
    result.pagination = pagination;
    result.total = pagination.totalUsers;
    return result;
  },

  /**
   * Update user active / suspended status
   * Maps 'ACTIVE' / 'SUSPENDED' strings to backend boolean { isActive }
   */
  async updateUserStatus(userId, status) {
    const isActive = typeof status === 'boolean' ? status : status === 'ACTIVE';
    const response = await api.patch(`/admin/users/${userId}/status`, { isActive });
    return response.data?.data || response.data;
  },

  /**
   * List all institutional accounts system-wide (Admin only)
   * Supports server-side pagination, search, status, and account type filtering
   */
  async getAccounts(query = {}) {
    const response = await api.get('/admin/accounts', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.accounts || (Array.isArray(payload) ? payload : []);
    const normalized = rawList.map(normalizeAccount);
    const pagination = payload?.pagination || {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 15,
      totalAccounts: payload?.total ?? normalized.length,
      totalPages: Math.ceil((payload?.total ?? normalized.length) / (Number(query.limit) || 15)),
    };

    const result = normalized;
    result.accounts = normalized;
    result.pagination = pagination;
    result.total = pagination.totalAccounts;
    return result;
  },

  /**
   * Update operational account status (ACTIVE, FROZEN, CLOSED)
   */
  async updateAccountStatus(accountId, status) {
    const response = await api.patch(`/admin/accounts/${accountId}/status`, { status });
    return response.data?.data || response.data;
  },

  /**
   * Retrieve full account record with PostgreSQL owner details and balance
   */
  async getAccount(identifier) {
    return accountService.getAccount(identifier);
  },

  /**
   * Retrieve recent ledger statement entries for account
   */
  async getAccountStatement(identifier, query = {}) {
    return accountService.getAccountStatement(identifier, query);
  },

  /**
   * Fetch live system and database operational health from /health
   */
  async getSystemHealth() {
    try {
      const response = await api.get('/health');
      return response.data?.data || response.data;
    } catch {
      const healthUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL)
        ? import.meta.env.VITE_API_BASE_URL.replace(/\/api\/v1\/?$/, '/health')
        : '/health';
      const response = await api.get(healthUrl, { baseURL: '' });
      return response.data?.data || response.data;
    }
  },
};

export default adminService;
