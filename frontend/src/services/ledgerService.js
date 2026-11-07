import api from './api.js';

export const ledgerService = {
  async getGlobalLedger() {
    const response = await api.get('/ledger');
    return response.data?.ledger || [];
  },

  async getLedgerEntryById(id) {
    const response = await api.get(`/ledger/${id}`);
    return response.data?.entry;
  },

  async getAuditEvents() {
    const response = await api.get('/audit-events');
    return response.data?.events || [];
  },
};

export default ledgerService;
