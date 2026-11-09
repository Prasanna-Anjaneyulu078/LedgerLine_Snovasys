import api from './api.js';

export function normalizeStatement(data) {
  if (!data) return null;

  const rawAccount = data.account;
  const balancePaise = rawAccount?.currentBalancePaise || (rawAccount?.balance ? rawAccount.balance.toString() : '0');
  const balanceFormatted = rawAccount?.currentBalanceFormatted || (Number(balancePaise) / 100).toFixed(2);

  const account = rawAccount
    ? {
        ...rawAccount,
        id: rawAccount.id,
        accountNumber: rawAccount.accountNumber || rawAccount.account_number,
        accountType: rawAccount.accountType || rawAccount.account_type || 'SAVINGS',
        currency: rawAccount.currency || 'INR',
        status: rawAccount.status || 'ACTIVE',
        balancePaise,
        balanceFormatted,
        balance: parseFloat(balanceFormatted),
        holderName: rawAccount.holderName || rawAccount.owner_name || 'Account Holder',
        branchName: rawAccount.branchName || 'Central Operations Treasury',
        ifscCode: rawAccount.ifscCode || 'LLIN0001001',
      }
    : null;

  const rawEntries = data.committedPostings || data.entries || [];
  const entries = rawEntries.map((e) => {
    const amountPaise = e.amountPaise || (e.amount ? e.amount.toString() : '0');
    const amountFormatted = e.amountFormatted || (Number(amountPaise) / 100).toFixed(2);
    const balanceAfterPaise = e.resultingRunningBalancePaise || e.balanceAfterPaise || (e.balance_after ? e.balance_after.toString() : '0');
    const balanceAfterFormatted = e.resultingRunningBalanceFormatted || e.balanceAfterFormatted || (Number(balanceAfterPaise) / 100).toFixed(2);

    return {
      ...e,
      id: e.ledgerEntryId || e.id,
      transactionId: e.transactionId || e.transaction_id,
      transactionReference: e.transactionReference || e.transaction_reference,
      transactionType: e.transactionType || e.transaction_type,
      displayType: e.displayType || e.display_type || (e.transactionType === 'TRANSFER' || e.transaction_type === 'TRANSFER' ? ((e.entryType || e.entry_type) === 'CREDIT' ? 'TRANSFER IN' : 'TRANSFER OUT') : (e.transactionType || e.transaction_type)),
      description: e.description || 'Ledger Posting',
      entryType: e.entryType || e.entry_type,
      direction: e.direction || ((e.entryType || e.entry_type) === 'CREDIT' ? 'INCOMING' : 'OUTGOING'),
      isCredit: e.isCredit ?? e.is_credit ?? ((e.entryType || e.entry_type) === 'CREDIT'),
      amountPaise,
      amountFormatted,
      amount: parseFloat(amountFormatted),
      balanceAfterPaise,
      balanceAfterFormatted,
      balanceAfter: parseFloat(balanceAfterFormatted),
      timestamp: e.date || e.created_at || e.createdAt,
      createdAt: e.date || e.created_at || e.createdAt,
      initiator: e.initiator || e.initiatorName || e.initiator_name,
    };
  });

  const refusedAttempts = (data.refusedAttempts || []).map((r) => ({
    id: r.id,
    action: r.action,
    createdAt: r.attemptedAt || r.createdAt || r.created_at,
    reference: r.reference || r.action,
    refusalReason: r.refusalReason || 'Operation refused by policy',
    amount: r.attemptedAmount || r.amount || null,
    status: 'REFUSED',
  }));

  return {
    account,
    entries,
    committedPostings: entries,
    refusedAttempts,
    pagination: data.pagination || { total: entries.length },
  };
}

export const statementService = {
  /**
   * Generates or retrieves verified statement for an account
   * Supports public account numbers (LL-ACC-1001) or UUIDs
   */
  async getStatement(identifier, query = {}) {
    // Call the dedicated statement endpoint
    const response = await api.get(`/statements/${identifier}`, { params: query });
    const payload = response.data?.data || response.data;
    return normalizeStatement(payload);
  },
};

export default statementService;
