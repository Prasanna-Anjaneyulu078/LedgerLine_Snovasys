import api from './api.js';
import { formatPaise } from '../utils/formatCurrency.js';

export function normalizeLedgerEntry(e) {
  if (!e) return null;
  const amountPaise = e.amountPaise || (e.amount !== undefined && e.amount !== null ? e.amount.toString() : '0');
  const amountFormatted = e.amountFormatted || formatPaise(amountPaise, false);
  const balanceAfterPaise = e.balanceAfterPaise || (e.balance_after !== undefined && e.balance_after !== null ? e.balance_after.toString() : '0');
  const balanceAfterFormatted = e.balanceAfterFormatted || formatPaise(balanceAfterPaise, false);

  return {
    ...e,
    id: e.id,
    transactionId: e.transaction_id || e.transactionId,
    transactionReference: e.transaction_reference || e.transactionReference,
    accountNumber: e.account_number || e.accountNumber,
    entryType: e.entry_type || e.entryType,
    amountPaise,
    amountFormatted,
    amount: amountFormatted, // canonical monetary string for display
    balanceAfterPaise,
    balanceAfterFormatted,
    balanceAfter: balanceAfterFormatted,
    timestamp: e.created_at || e.timestamp || e.createdAt,
    createdAt: e.created_at || e.timestamp || e.createdAt,
  };
}

export function normalizeAuditEvent(ev) {
  if (!ev) return null;
  return {
    ...ev,
    id: ev.id,
    timestamp: ev.created_at || ev.timestamp,
    createdAt: ev.created_at || ev.timestamp,
    actorId: ev.actor_id || ev.actorId,
    actorName: ev.actor_name || ev.actorName || 'System',
    actorEmail: ev.actor_email || ev.actorEmail || null,
    actorRole: ev.actor_role || ev.actorRole || 'SYSTEM',
    action: ev.action,
    resourceType: ev.resource_type || ev.resourceType,
    resourceId: ev.resource_id || ev.resourceId,
    resource: `${ev.resource_type || ''} ${ev.resource_id || ''}`.trim(),
    ipAddress: ev.ip_address || ev.ipAddress || null,
    details: typeof ev.metadata === 'object' ? JSON.stringify(ev.metadata) : (ev.details || '—'),
    metadata: ev.metadata,
    status: ev.action?.includes('FAILURE') || ev.action?.includes('REFUSED') ? 'FAILURE' : 'SUCCESS',
  };
}

export const ledgerService = {
  /**
   * Global double-entry ledger entries (Admin / Auditor)
   * Carries authoritative PostgreSQL database-aggregated credit and debit totals
   */
  async getGlobalLedger(query = {}) {
    const response = await api.get('/ledger', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.entries || payload?.ledger || (Array.isArray(payload) ? payload : []);
    const normalized = rawList.map(normalizeLedgerEntry);

    const result = normalized;
    result.entries = normalized;
    result.total = payload?.total ?? normalized.length;
    result.totalCreditsPaise = payload?.totalCreditsPaise;
    result.totalCreditsFormatted = payload?.totalCreditsFormatted;
    result.totalDebitsPaise = payload?.totalDebitsPaise;
    result.totalDebitsFormatted = payload?.totalDebitsFormatted;
    result.pagination = payload?.pagination;
    return result;
  },

  /**
   * Account-specific ledger entries
   */
  async getAccountLedger(accountNumber, query = {}) {
    const response = await api.get(`/ledger/${accountNumber}`, { params: query });
    const payload = response.data?.data || response.data;
    return {
      ...payload,
      entries: (payload?.entries || []).map(normalizeLedgerEntry),
    };
  },

  /**
   * Immutable audit events trail (Admin / Auditor)
   */
  async getAuditEvents(query = {}) {
    const response = await api.get('/audit-events', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.events || (Array.isArray(payload) ? payload : []);
    const normalized = rawList.map(normalizeAuditEvent);

    const result = normalized;
    result.events = normalized;
    result.total = payload?.total ?? normalized.length;
    result.pagination = payload?.pagination || {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 15,
      totalEvents: payload?.total ?? normalized.length,
      totalPages: Math.ceil((payload?.total ?? normalized.length) / (Number(query.limit) || 15)),
    };
    return result;
  },
};

export default ledgerService;
