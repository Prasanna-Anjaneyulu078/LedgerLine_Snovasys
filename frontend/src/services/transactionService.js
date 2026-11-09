import api, { generateIdempotencyKey } from './api.js';
import { formatPaise } from '../utils/formatCurrency.js';

const isUuid = (val) =>
  typeof val === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val.trim());

export function normalizeTransaction(t) {
  if (!t) return null;
  const amountPaise = t.amountPaise || (t.amount !== undefined && t.amount !== null ? t.amount.toString() : '0');
  const amountFormatted = t.amountFormatted || formatPaise(amountPaise, false);

  const rawType = t.transaction_type || t.transactionType || t.type;
  const displayType = t.display_type || t.displayType || (rawType === 'DEPOSIT' ? 'DEPOSIT' : rawType === 'WITHDRAWAL' ? 'WITHDRAWAL' : rawType);
  const isCredit = t.is_credit ?? t.isCredit ?? (displayType === 'TRANSFER IN' || displayType === 'DEPOSIT' || rawType === 'DEPOSIT');
  const amountSign = t.amount_sign || t.amountSign || (isCredit ? '+' : '-');
  const direction = t.direction || (isCredit ? 'INCOMING' : 'OUTGOING');
  const entryType = t.entry_type || t.entryType || (isCredit ? 'CREDIT' : 'DEBIT');

  return {
    ...t,
    id: t.id,
    reference: t.transaction_reference || t.transactionReference || t.reference,
    transactionReference: t.transaction_reference || t.transactionReference || t.reference,
    type: displayType,
    displayType,
    transactionType: rawType,
    direction,
    entryType,
    isCredit,
    amountSign,
    description: t.description || 'Financial Transaction',
    amountPaise,
    amountFormatted,
    amount: amountFormatted, // Canonical string without float precision loss
    status: t.status,
    sourceAccountId: t.source_account_id || t.sourceAccountId,
    sourceAccountNumber: t.source_account_number || t.sourceAccountNumber,
    destinationAccountId: t.destination_account_id || t.destinationAccountId,
    destinationAccountNumber: t.destination_account_number || t.destinationAccountNumber,
    createdAt: t.created_at || t.createdAt,
  };
}

export const transactionService = {
  /**
   * Deposit external funds into an account
   * Prefers public accountNumber (e.g. LL-ACC-1001)
   */
  async deposit(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();
    const rawTarget = data.accountNumber || data.accountId;

    const payload = {
      amount: typeof data.amount === 'string' ? data.amount.trim() : typeof data.amount === 'bigint' ? formatPaise(data.amount, false) : typeof data.amount === 'number' ? data.amount.toFixed(2) : String(data.amount || '').trim(),
      description: data.description || 'Account deposit',
    };

    if (rawTarget) {
      if (isUuid(rawTarget)) {
        payload.accountId = rawTarget;
      } else {
        payload.accountNumber = rawTarget;
      }
    }

    const response = await api.post('/transactions/deposit', payload, {
      headers: { 'Idempotency-Key': key },
    });

    const result = response.data?.data || response.data;
    return normalizeTransaction(result);
  },

  /**
   * Withdraw funds from an account
   * Prefers public accountNumber
   */
  async withdraw(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();
    const rawTarget = data.accountNumber || data.accountId;

    const payload = {
      amount: typeof data.amount === 'string' ? data.amount.trim() : typeof data.amount === 'bigint' ? formatPaise(data.amount, false) : typeof data.amount === 'number' ? data.amount.toFixed(2) : String(data.amount || '').trim(),
      description: data.description || 'Account withdrawal',
    };

    if (rawTarget) {
      if (isUuid(rawTarget)) {
        payload.accountId = rawTarget;
      } else {
        payload.accountNumber = rawTarget;
      }
    }

    const response = await api.post('/transactions/withdraw', payload, {
      headers: { 'Idempotency-Key': key },
    });

    const result = response.data?.data || response.data;
    return normalizeTransaction(result);
  },

  /**
   * Double-entry internal transfer between two accounts
   * Enforces public account numbers (sourceAccountNumber, destinationAccountNumber)
   * Prevents submitting public account numbers under UUID-specific field names
   */
  async transfer(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();

    const rawSource = data.sourceAccountNumber || data.sourceAccountId;
    const rawDest = data.destinationAccountNumber || data.destinationAccountId;

    const payload = {
      amount: typeof data.amount === 'string' ? data.amount.trim() : typeof data.amount === 'bigint' ? formatPaise(data.amount, false) : typeof data.amount === 'number' ? data.amount.toFixed(2) : String(data.amount || '').trim(),
      description: data.description || 'Inter-account transfer',
    };

    if (rawSource && rawDest) {
      if (isUuid(rawSource) && isUuid(rawDest)) {
        payload.sourceAccountId = rawSource;
        payload.destinationAccountId = rawDest;
      } else {
        payload.sourceAccountNumber = rawSource;
        payload.destinationAccountNumber = rawDest;
      }
    }

    const response = await api.post('/transactions/transfer', payload, {
      headers: { 'Idempotency-Key': key },
    });

    const result = response.data?.data || response.data;
    return normalizeTransaction(result);
  },

  /**
   * Retrieve list of transactions
   * Supports server-side filtering, search, and pagination
   */
  async getTransactions(query = {}) {
    const response = await api.get('/transactions', { params: query });
    const payload = response.data?.data || response.data;
    const rawList = payload?.transactions || (Array.isArray(payload) ? payload : []);
    const normalized = rawList.map(normalizeTransaction);

    const result = normalized;
    result.transactions = normalized;
    result.total = payload?.total ?? normalized.length;
    result.pagination = payload?.pagination || {
      page: Number(query.page) || 1,
      limit: Number(query.limit) || 15,
      totalTransactions: payload?.total ?? normalized.length,
      totalPages: Math.ceil((payload?.total ?? normalized.length) / (Number(query.limit) || 15)),
    };
    return result;
  },

  /**
   * Retrieve detailed transaction inspection by ID or Reference
   */
  async getTransactionById(id) {
    const response = await api.get(`/transactions/${id}`);
    const payload = response.data?.data || response.data;
    return normalizeTransaction(payload);
  },
};

export default transactionService;
