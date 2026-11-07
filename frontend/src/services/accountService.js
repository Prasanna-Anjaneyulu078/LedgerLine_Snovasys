import api from './api.js';

export const accountService = {
  async getAccounts() {
    const response = await api.get('/accounts');
    return response.data?.accounts || [];
  },

  async getAccountBalance(id) {
    const response = await api.get(`/accounts/${id}/balance`);
    return response.data;
  },

  async getAccountStatement(id) {
    const response = await api.get(`/accounts/${id}/statement`);
    return response.data;
  },
};

export default accountService;
