import api from './api.js';

export const adminService = {
  async getUsers() {
    const response = await api.get('/admin/users');
    return response.data?.users || [];
  },

  async updateUserStatus(userId, status) {
    const response = await api.patch(`/admin/users/${userId}/status`, { status });
    return response.data;
  },

  async getAccounts() {
    const response = await api.get('/admin/accounts');
    return response.data?.accounts || [];
  },

  async updateAccountStatus(accountId, status) {
    const response = await api.patch(`/admin/accounts/${accountId}/status`, { status });
    return response.data;
  },
};

export default adminService;
