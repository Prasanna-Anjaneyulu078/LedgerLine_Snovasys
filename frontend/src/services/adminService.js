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
   * List all registered users (Admin only)
   */
  async getUsers(query = {}) {
    const response = await api.get('/admin/users', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.users || (Array.isArray(payload) ? payload : []);
    return rawList.map(normalizeUser);
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
   */
  async getAccounts(query = {}) {
    const response = await api.get('/admin/accounts', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.accounts || (Array.isArray(payload) ? payload : []);
    return rawList.map(normalizeAccount);
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
