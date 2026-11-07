import api from './api.js';

export const statementService = {
  async getStatement(accountId) {
    const response = await api.get(`/accounts/${accountId}/statement`);
    return response.data;
  },
};

export default statementService;
