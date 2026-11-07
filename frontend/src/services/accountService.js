import api from './api.js';

export function normalizeAccount(acc) {
  if (!acc) return null;
  const balancePaise = acc.balancePaise || (acc.balance !== undefined && acc.balance !== null ? acc.balance.toString() : '0');
  const balanceFormatted = acc.balanceFormatted || (Number(balancePaise) / 100).toFixed(2);
  const balanceRupees = parseFloat(balanceFormatted);

  return {
    ...acc,
    id: acc.id,
    accountNumber: acc.account_number || acc.accountNumber,
    accountType: acc.account_type || acc.accountType || 'SAVINGS',
    currency: acc.currency || 'INR',
    status: acc.status || 'ACTIVE',
    balancePaise: balancePaise,
    balanceFormatted: balanceFormatted,
    balance: balanceRupees, // numeric rupees for frontend aggregation
    holderName: acc.owner_name || acc.holderName || 'Account Holder',
    branchName: acc.branchName || 'Central Operations Treasury',
    ifscCode: acc.ifscCode || 'LLIN0001001',
    createdAt: acc.created_at || acc.createdAt,
  };
}

export const accountService = {
  /**
   * Retrieve accounts for current user (or all accounts if admin/auditor)
   */
  async getAccounts(query = {}) {
    const response = await api.get('/accounts', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.accounts || (Array.isArray(payload) ? payload : []);
    return rawList.map(normalizeAccount);
  },

  /**
   * Retrieve balance details for a specific account
   */
  async getAccountBalance(identifier) {
    const response = await api.get(`/accounts/${identifier}/balance`);
    const payload = response.data?.data || response.data;
    const balancePaise = payload.balancePaise || (payload.balance ? payload.balance.toString() : '0');
    const balanceFormatted = payload.balanceFormatted || (Number(balancePaise) / 100).toFixed(2);

    return {
      ...payload,
      accountId: payload.accountId || payload.id,
      accountNumber: payload.accountNumber || payload.account_number,
      currency: payload.currency || 'INR',
      status: payload.status || 'ACTIVE',
      balancePaise,
      balanceFormatted,
      balance: parseFloat(balanceFormatted),
    };
  },

  /**
   * Retrieve account ledger statement
   */
  async getAccountStatement(identifier, query = {}) {
    const response = await api.get(`/accounts/${identifier}/statement`, { params: query });
    return response.data?.data || response.data;
  },

  /**
   * Create a new operational account
   */
  async createAccount(data = {}) {
    const response = await api.post('/accounts', data);
    return normalizeAccount(response.data?.data || response.data);
  },
};

export default accountService;
