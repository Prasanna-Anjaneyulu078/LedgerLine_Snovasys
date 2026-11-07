import api, { generateIdempotencyKey } from './api.js';

export const transactionService = {
  async deposit(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();
    const response = await api.post('/transactions/deposit', data, {
      headers: {
        'Idempotency-Key': key,
      },
    });
    return response.data;
  },

  async withdraw(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();
    const response = await api.post('/transactions/withdraw', data, {
      headers: {
        'Idempotency-Key': key,
      },
    });
    return response.data;
  },

  async transfer(data, idempotencyKey) {
    const key = idempotencyKey || generateIdempotencyKey();
    const response = await api.post('/transactions/transfer', data, {
      headers: {
        'Idempotency-Key': key,
      },
    });
    return response.data;
  },

  async getTransactions() {
    const response = await api.get('/transactions');
    return response.data?.transactions || [];
  },

  async getTransactionById(id) {
    const response = await api.get(`/transactions/${id}`);
    return response.data;
  },
};

export default transactionService;
