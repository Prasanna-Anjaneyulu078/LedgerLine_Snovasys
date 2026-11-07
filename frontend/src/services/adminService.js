import api from './api.js';
import { normalizeAccount } from './accountService.js';

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

export const adminService = {
  /**
   * Retrieve authoritative PostgreSQL aggregate telemetry for Admin Dashboard
   */
  async getDashboardOverview() {
    const response = await api.get('/admin/dashboard');
    return response.data?.data || response.data;
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
      limit: Number(query.limit) || 4,
      totalUsers: payload?.total ?? normalizedUsers.length,
      totalPages: Math.ceil((payload?.total ?? normalizedUsers.length) / (Number(query.limit) || 4)),
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
      limit: Number(query.limit) || 10,
      totalAccounts: payload?.total ?? normalized.length,
      totalPages: Math.ceil((payload?.total ?? normalized.length) / (Number(query.limit) || 10)),
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
};

export default adminService;
