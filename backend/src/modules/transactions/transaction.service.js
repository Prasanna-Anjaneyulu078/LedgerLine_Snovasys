import crypto from 'crypto';
import { getClient } from '../../config/database.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { transactionRepository } from '../../repositories/transaction.repository.js';
import { ledgerRepository } from '../../repositories/ledger.repository.js';
import { idempotencyRepository } from '../../repositories/idempotency.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/appError.js';
import { toPaise, formatRupees, isPositivePaise } from '../../utils/money.js';

export class TransactionService {
  /**
   * Generates a unique transaction reference with TXN- prefix
   */
  generateTransactionReference(prefix = 'TXN') {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Hashes payload and operation to ensure identical requests for idempotency
   */
  computeRequestHash(operation, payload) {
    const normalized = JSON.stringify({ operation, payload });
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Validates idempotency key.
   * If already processed: returns cached response.
   * If key reused with different payload: throws 409 Conflict.
   */
  async checkIdempotency(userId, idempotencyKey, requestHash) {
    if (!idempotencyKey) return null;

    const existing = await idempotencyRepository.findByKey(userId, idempotencyKey);
    if (!existing) return null;

    if (existing.request_hash !== requestHash) {
      throw AppError.conflict(
        'Idempotency key reuse conflict: The provided Idempotency-Key was previously used with a different request payload.'
      );
    }

    if (existing.response_status && existing.response_body) {
      return {
        cached: true,
        statusCode: existing.response_status,
        body: existing.response_body,
      };
    }

    // A concurrent in-flight request is already using this key
    throw AppError.conflict(
      'A concurrent request with the same Idempotency-Key is currently being processed. Please retry shortly.'
    );
  }

  /**
   * Process external funds deposit into an account
   */
  async deposit({ accountNumber, accountId, amount, description = 'Account deposit' }, user, idempotencyKey = null, context = {}) {
    if (user.role !== 'ACCOUNT_HOLDER') {
      throw AppError.forbidden('Only Account Holders are authorized to deposit funds into accounts');
    }

    const amountPaise = toPaise(amount);
    if (!isPositivePaise(amountPaise)) {
      throw AppError.badRequest('Deposit amount must be strictly greater than zero');
    }

    const targetIdentifier = accountNumber || accountId;
    if (!targetIdentifier) {
      throw AppError.badRequest('Account number is required');
    }

    // Resolve target account first
    const targetAccount = await accountRepository.findByIdOrAccountNumber(targetIdentifier);
    if (!targetAccount) {
      throw AppError.notFound('Destination account not found');
    }

    // Account ownership authorization check: Account Holders can only deposit into accounts they own
    if (targetAccount.owner_id !== user.id) {
      throw AppError.forbidden('You do not have permission to deposit to this account');
    }

    if (targetAccount.status !== 'ACTIVE') {
      throw AppError.badRequest(`Cannot deposit to account with status: ${targetAccount.status}`);
    }

    const resolvedAccountId = targetAccount.id;
    const resolvedAccountNumber = targetAccount.account_number;

    const requestHash = this.computeRequestHash('DEPOSIT', {
      accountId: resolvedAccountId,
      accountNumber: resolvedAccountNumber,
      amountPaise: amountPaise.toString(),
    });

    // Check Idempotency
    const idempotencyRecord = await this.checkIdempotency(user.id, idempotencyKey, requestHash);
    if (idempotencyRecord && idempotencyRecord.cached) {
      return idempotencyRecord.body;
    }

    const client = await getClient();
    let idempotencyEntryId = null;

    try {
      await client.query('BEGIN;');

      // Reserve Idempotency Key within the transaction if provided
      if (idempotencyKey) {
        try {
          const idemp = await idempotencyRepository.create(
            { idempotencyKey, userId: user.id, requestHash },
            client
          );
          idempotencyEntryId = idemp.id;
        } catch (err) {
          if (err.code === '23505') {
            throw AppError.conflict('Concurrent transaction detected with identical Idempotency-Key');
          }
          throw err;
        }
      }

      // Lock destination account using resolved UUID
      const account = await accountRepository.findByIdForUpdate(resolvedAccountId, client);
      if (!account) {
        throw AppError.notFound('Destination account not found');
      }

      if (account.owner_id !== user.id) {
        throw AppError.forbidden('You do not have permission to deposit to this account');
      }

      if (account.status !== 'ACTIVE') {
        throw AppError.badRequest(`Cannot deposit to account with status: ${account.status}`);
      }

      const initialBalance = account.balance;
      const resultingBalance = initialBalance + amountPaise;

      // 1. Create Transaction record
      const txnReference = this.generateTransactionReference('DEP');
      const transaction = await transactionRepository.create(
        {
          transactionReference: txnReference,
          transactionType: 'DEPOSIT',
          destinationAccountId: account.id,
          amount: amountPaise,
          status: 'SUCCESS',
          initiatedBy: user.id,
          description,
        },
        client
      );

      // 2. Create Ledger entry (CREDIT to account)
      const ledgerEntry = await ledgerRepository.create(
        {
          transactionId: transaction.id,
          accountId: account.id,
          entryType: 'CREDIT',
          amount: amountPaise,
          balanceAfter: resultingBalance,
        },
        client
      );

      // 3. Update account balance projection
      await accountRepository.updateBalance(account.id, resultingBalance, client);

      // 4. Record Audit Event
      await auditRepository.create(
        {
          actorId: user.id,
          action: 'TRANSACTION_DEPOSIT_SUCCESS',
          resourceType: 'TRANSACTION',
          resourceId: transaction.id,
          metadata: {
            accountNumber: account.account_number,
            amountPaise: amountPaise.toString(),
            resultingBalancePaise: resultingBalance.toString(),
          },
          ipAddress: context.ipAddress,
        },
        client
      );

      const responseData = {
        transactionId: transaction.id,
        transactionReference: transaction.transaction_reference,
        type: 'DEPOSIT',
        status: 'SUCCESS',
        accountId: account.id,
        accountNumber: account.account_number,
        amountPaise: amountPaise.toString(),
        amountFormatted: formatRupees(amountPaise),
        balanceAfterPaise: resultingBalance.toString(),
        balanceAfterFormatted: formatRupees(resultingBalance),
        ledgerEntryId: ledgerEntry.id,
        createdAt: transaction.created_at,
      };

      // 5. Complete Idempotency record atomically
      if (idempotencyEntryId) {
        await idempotencyRepository.complete(
          idempotencyEntryId,
          { transactionId: transaction.id, responseStatus: 200, responseBody: responseData },
          client
        );
      }

      await client.query('COMMIT;');
      return responseData;
    } catch (error) {
      await client.query('ROLLBACK;');

      // Clean up in-flight idempotency reservation if failed
      if (idempotencyKey) {
        await idempotencyRepository.deleteByKey(user.id, idempotencyKey).catch(() => {});
      }

      // Record refusal in audit log
      await auditRepository.create({
        actorId: user.id,
        action: 'TRANSACTION_DEPOSIT_REFUSED',
        resourceType: 'ACCOUNT',
        resourceId: resolvedAccountId || accountId || null,
        metadata: {
          accountNumber: resolvedAccountNumber || accountNumber || null,
          amount: amount.toString(),
          refusalReason: error.message,
        },
        ipAddress: context.ipAddress,
      }).catch(() => {});

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process withdrawal from an account
   */
  async withdraw({ accountNumber, accountId, amount, description = 'Account withdrawal' }, user, idempotencyKey = null, context = {}) {
    if (user.role !== 'ACCOUNT_HOLDER') {
      throw AppError.forbidden('Only Account Holders are authorized to withdraw funds from accounts');
    }

    const amountPaise = toPaise(amount);
    if (!isPositivePaise(amountPaise)) {
      throw AppError.badRequest('Withdrawal amount must be strictly greater than zero');
    }

    const targetIdentifier = accountNumber || accountId;
    if (!targetIdentifier) {
      throw AppError.badRequest('Account number is required');
    }

    // Fast-path lookup to verify account exists and check ownership before acquiring lock
    const targetAccount = await accountRepository.findByIdOrAccountNumber(targetIdentifier);
    if (!targetAccount) {
      throw AppError.notFound('Source account not found');
    }

    // Ownership authorization check: Account Holders can only withdraw from accounts they own
    if (targetAccount.owner_id !== user.id) {
      throw AppError.forbidden('You do not have permission to withdraw from this account');
    }

    if (targetAccount.status !== 'ACTIVE') {
      throw AppError.badRequest(`Cannot withdraw from account with status: ${targetAccount.status}`);
    }

    const resolvedAccountId = targetAccount.id;
    const resolvedAccountNumber = targetAccount.account_number;

    const requestHash = this.computeRequestHash('WITHDRAWAL', {
      accountId: resolvedAccountId,
      accountNumber: resolvedAccountNumber,
      amountPaise: amountPaise.toString(),
    });

    // Check Idempotency
    const idempotencyRecord = await this.checkIdempotency(user.id, idempotencyKey, requestHash);
    if (idempotencyRecord && idempotencyRecord.cached) {
      return idempotencyRecord.body;
    }

    const client = await getClient();
    let idempotencyEntryId = null;

    try {
      await client.query('BEGIN;');

      if (idempotencyKey) {
        try {
          const idemp = await idempotencyRepository.create(
            { idempotencyKey, userId: user.id, requestHash },
            client
          );
          idempotencyEntryId = idemp.id;
        } catch (err) {
          if (err.code === '23505') {
            throw AppError.conflict('Concurrent transaction detected with identical Idempotency-Key');
          }
          throw err;
        }
      }

      // Lock source account using resolved UUID
      const account = await accountRepository.findByIdForUpdate(resolvedAccountId, client);
      if (!account) {
        throw AppError.notFound('Source account not found');
      }

      // Ownership authorization check inside lock
      if (account.owner_id !== user.id) {
        throw AppError.forbidden('You do not have permission to withdraw from this account');
      }

      if (account.status !== 'ACTIVE') {
        throw AppError.badRequest(`Cannot withdraw from account with status: ${account.status}`);
      }

      // Concurrency-Safe Balance check AFTER acquiring row lock
      if (account.balance < amountPaise) {
        throw AppError.badRequest(
          `Insufficient funds: Available balance is ₹${formatRupees(account.balance)}, requested withdrawal is ₹${formatRupees(amountPaise)}`
        );
      }

      const initialBalance = account.balance;
      const resultingBalance = initialBalance - amountPaise;

      // 1. Create Transaction record
      const txnReference = this.generateTransactionReference('WTH');
      const transaction = await transactionRepository.create(
        {
          transactionReference: txnReference,
          transactionType: 'WITHDRAWAL',
          sourceAccountId: account.id,
          amount: amountPaise,
          status: 'SUCCESS',
          initiatedBy: user.id,
          description,
        },
        client
      );

      // 2. Create Ledger entry (DEBIT to account)
      const ledgerEntry = await ledgerRepository.create(
        {
          transactionId: transaction.id,
          accountId: account.id,
          entryType: 'DEBIT',
          amount: amountPaise,
          balanceAfter: resultingBalance,
        },
        client
      );

      // 3. Update account balance projection
      await accountRepository.updateBalance(account.id, resultingBalance, client);

      // 4. Record Audit Event
      await auditRepository.create(
        {
          actorId: user.id,
          action: 'TRANSACTION_WITHDRAW_SUCCESS',
          resourceType: 'TRANSACTION',
          resourceId: transaction.id,
          metadata: {
            accountNumber: account.account_number,
            amountPaise: amountPaise.toString(),
            resultingBalancePaise: resultingBalance.toString(),
          },
          ipAddress: context.ipAddress,
        },
        client
      );

      const responseData = {
        transactionId: transaction.id,
        transactionReference: transaction.transaction_reference,
        type: 'WITHDRAWAL',
        status: 'SUCCESS',
        accountId: account.id,
        accountNumber: account.account_number,
        amountPaise: amountPaise.toString(),
        amountFormatted: formatRupees(amountPaise),
        balanceAfterPaise: resultingBalance.toString(),
        balanceAfterFormatted: formatRupees(resultingBalance),
        ledgerEntryId: ledgerEntry.id,
        createdAt: transaction.created_at,
      };

      // 5. Complete Idempotency record
      if (idempotencyEntryId) {
        await idempotencyRepository.complete(
          idempotencyEntryId,
          { transactionId: transaction.id, responseStatus: 200, responseBody: responseData },
          client
        );
      }

      await client.query('COMMIT;');
      return responseData;
    } catch (error) {
      await client.query('ROLLBACK;');

      if (idempotencyKey) {
        await idempotencyRepository.deleteByKey(user.id, idempotencyKey).catch(() => {});
      }

      await auditRepository.create({
        actorId: user.id,
        action: 'TRANSACTION_WITHDRAW_REFUSED',
        resourceType: 'ACCOUNT',
        resourceId: resolvedAccountId || accountId || null,
        metadata: {
          accountNumber: resolvedAccountNumber || accountNumber || null,
          amount: amount.toString(),
          refusalReason: error.message,
        },
        ipAddress: context.ipAddress,
      }).catch(() => {});

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process double-entry internal transfer between two accounts
   * Supports primary account-number based transfers and backward-compatible UUID transfers
   */
  async transfer(
    {
      sourceAccountNumber,
      destinationAccountNumber,
      sourceAccountId,
      destinationAccountId,
      amount,
      description = 'Account transfer',
    },
    user,
    idempotencyKey = null,
    context = {}
  ) {
    if (user.role !== 'ACCOUNT_HOLDER') {
      throw AppError.forbidden('Only Account Holders are authorized to transfer funds');
    }

    const rawSourceAccNum = typeof sourceAccountNumber === 'string' ? sourceAccountNumber.trim() : null;
    const rawDestAccNum = typeof destinationAccountNumber === 'string' ? destinationAccountNumber.trim() : null;

    if (rawSourceAccNum && rawDestAccNum && rawSourceAccNum === rawDestAccNum) {
      throw AppError.badRequest('Source and destination accounts must be different');
    }

    if (sourceAccountId && destinationAccountId && sourceAccountId === destinationAccountId) {
      throw AppError.badRequest('Source and destination accounts must be different');
    }

    const amountPaise = toPaise(amount);
    if (!isPositivePaise(amountPaise)) {
      throw AppError.badRequest('Transfer amount must be strictly greater than zero');
    }

    // 1. Resolve accounts securely using indexed columns
    let resolvedSourceAccount = null;
    let resolvedDestAccount = null;

    if (rawSourceAccNum && rawDestAccNum) {
      resolvedSourceAccount = await accountRepository.findByAccountNumber(rawSourceAccNum);
      if (!resolvedSourceAccount) {
        throw AppError.notFound('Source account not found');
      }

      resolvedDestAccount = await accountRepository.findByAccountNumber(rawDestAccNum);
      if (!resolvedDestAccount) {
        throw AppError.notFound('Destination account not found');
      }
    } else if (sourceAccountId && destinationAccountId) {
      resolvedSourceAccount = await accountRepository.findById(sourceAccountId);
      if (!resolvedSourceAccount) {
        throw AppError.notFound('Source account not found');
      }

      resolvedDestAccount = await accountRepository.findById(destinationAccountId);
      if (!resolvedDestAccount) {
        throw AppError.notFound('Destination account not found');
      }
    } else {
      throw AppError.badRequest('Source and destination account numbers are required');
    }

    if (resolvedSourceAccount.id === resolvedDestAccount.id) {
      throw AppError.badRequest('Source and destination accounts must be different');
    }

    const resolvedSourceId = resolvedSourceAccount.id;
    const resolvedDestId = resolvedDestAccount.id;
    const resolvedSourceAccNum = resolvedSourceAccount.account_number;
    const resolvedDestAccNum = resolvedDestAccount.account_number;

    // Fast-path security check: Source account ownership
    if (resolvedSourceAccount.owner_id !== user.id) {
      await auditRepository
        .create({
          actorId: user.id,
          action: 'TRANSACTION_TRANSFER_REFUSED',
          resourceType: 'TRANSACTION',
          metadata: {
            sourceAccountId: resolvedSourceId,
            destinationAccountId: resolvedDestId,
            sourceAccountNumber: resolvedSourceAccNum,
            destinationAccountNumber: resolvedDestAccNum,
            amount: amount?.toString() || '0',
            refusalReason: 'You do not have permission to transfer funds from this source account',
          },
          ipAddress: context.ipAddress,
        })
        .catch(() => {});

      throw AppError.forbidden('You do not have permission to transfer funds from this source account');
    }

    // Fast-path security check: Active status
    if (resolvedSourceAccount.status !== 'ACTIVE') {
      await auditRepository
        .create({
          actorId: user.id,
          action: 'TRANSACTION_TRANSFER_REFUSED',
          resourceType: 'TRANSACTION',
          metadata: {
            sourceAccountId: resolvedSourceId,
            destinationAccountId: resolvedDestId,
            sourceAccountNumber: resolvedSourceAccNum,
            destinationAccountNumber: resolvedDestAccNum,
            amount: amount?.toString() || '0',
            refusalReason: `Source account is not active (status: ${resolvedSourceAccount.status})`,
          },
          ipAddress: context.ipAddress,
        })
        .catch(() => {});

      throw AppError.badRequest(`Source account is not active (status: ${resolvedSourceAccount.status})`);
    }

    if (resolvedDestAccount.status !== 'ACTIVE') {
      await auditRepository
        .create({
          actorId: user.id,
          action: 'TRANSACTION_TRANSFER_REFUSED',
          resourceType: 'TRANSACTION',
          metadata: {
            sourceAccountId: resolvedSourceId,
            destinationAccountId: resolvedDestId,
            sourceAccountNumber: resolvedSourceAccNum,
            destinationAccountNumber: resolvedDestAccNum,
            amount: amount?.toString() || '0',
            refusalReason: `Destination account is not active (status: ${resolvedDestAccount.status})`,
          },
          ipAddress: context.ipAddress,
        })
        .catch(() => {});

      throw AppError.badRequest(`Destination account is not active (status: ${resolvedDestAccount.status})`);
    }

    // 2. Canonical Idempotency Request Hash based on resolved logical transfer
    const requestHash = this.computeRequestHash('TRANSFER', {
      sourceAccountId: resolvedSourceId,
      destinationAccountId: resolvedDestId,
      sourceAccountNumber: resolvedSourceAccNum,
      destinationAccountNumber: resolvedDestAccNum,
      amountPaise: amountPaise.toString(),
    });

    // Check Idempotency
    const idempotencyRecord = await this.checkIdempotency(user.id, idempotencyKey, requestHash);
    if (idempotencyRecord && idempotencyRecord.cached) {
      return idempotencyRecord.body;
    }

    const client = await getClient();
    let idempotencyEntryId = null;
    let inTransaction = false;

    try {
      await client.query('BEGIN;');
      inTransaction = true;

      if (idempotencyKey) {
        try {
          const idemp = await idempotencyRepository.create(
            { idempotencyKey, userId: user.id, requestHash },
            client
          );
          idempotencyEntryId = idemp.id;
        } catch (err) {
          if (err.code === '23505') {
            throw AppError.conflict('Concurrent transaction detected with identical Idempotency-Key');
          }
          throw err;
        }
      }

      // Concurrency Safety: Lock both accounts in deterministic order (by UUID) to eliminate deadlocks
      const [sourceAccount, destAccount] = await accountRepository.findTwoForUpdate(
        resolvedSourceId,
        resolvedDestId,
        client
      );

      if (!sourceAccount) {
        throw AppError.notFound('Source account not found');
      }

      if (!destAccount) {
        throw AppError.notFound('Destination account not found');
      }

      // Re-verify ownership inside transaction lock boundary
      if (sourceAccount.owner_id !== user.id) {
        throw AppError.forbidden('You do not have permission to transfer funds from this source account');
      }

      if (sourceAccount.status !== 'ACTIVE') {
        throw AppError.badRequest(`Source account is not active (status: ${sourceAccount.status})`);
      }

      if (destAccount.status !== 'ACTIVE') {
        throw AppError.badRequest(`Destination account is not active (status: ${destAccount.status})`);
      }

      if (sourceAccount.currency !== destAccount.currency) {
        throw AppError.badRequest(
          `Currency mismatch: source is ${sourceAccount.currency}, destination is ${destAccount.currency}`
        );
      }

      // Concurrency-Safe Balance check AFTER acquiring row locks
      if (sourceAccount.balance < amountPaise) {
        throw AppError.badRequest(
          `Insufficient funds: Source balance is ₹${formatRupees(sourceAccount.balance)}, required ₹${formatRupees(amountPaise)}`
        );
      }

      const newSourceBalance = sourceAccount.balance - amountPaise;
      const newDestBalance = destAccount.balance + amountPaise;

      // 1. Create Transaction record
      const txnReference = this.generateTransactionReference('TRF');
      const transaction = await transactionRepository.create(
        {
          transactionReference: txnReference,
          transactionType: 'TRANSFER',
          sourceAccountId: sourceAccount.id,
          destinationAccountId: destAccount.id,
          amount: amountPaise,
          status: 'SUCCESS',
          initiatedBy: user.id,
          description,
        },
        client
      );

      // 2. Double-Entry Bookkeeping Ledger Postings
      // Invariant: Debit sender, Credit receiver for the exact same amount
      const debitEntry = await ledgerRepository.create(
        {
          transactionId: transaction.id,
          accountId: sourceAccount.id,
          entryType: 'DEBIT',
          amount: amountPaise,
          balanceAfter: newSourceBalance,
        },
        client
      );

      const creditEntry = await ledgerRepository.create(
        {
          transactionId: transaction.id,
          accountId: destAccount.id,
          entryType: 'CREDIT',
          amount: amountPaise,
          balanceAfter: newDestBalance,
        },
        client
      );

      // 3. Update account balance projections
      await accountRepository.updateBalance(sourceAccount.id, newSourceBalance, client);
      await accountRepository.updateBalance(destAccount.id, newDestBalance, client);

      // 4. Record Audit Event
      await auditRepository.create(
        {
          actorId: user.id,
          action: 'TRANSACTION_TRANSFER_SUCCESS',
          resourceType: 'TRANSACTION',
          resourceId: transaction.id,
          metadata: {
            sourceAccount: sourceAccount.account_number,
            destAccount: destAccount.account_number,
            amountPaise: amountPaise.toString(),
            newSourceBalancePaise: newSourceBalance.toString(),
            newDestBalancePaise: newDestBalance.toString(),
          },
          ipAddress: context.ipAddress,
        },
        client
      );

      const responseData = {
        transactionId: transaction.id,
        transactionReference: transaction.transaction_reference,
        type: 'TRANSFER',
        status: 'SUCCESS',
        sourceAccountId: sourceAccount.id,
        sourceAccountNumber: sourceAccount.account_number,
        destinationAccountId: destAccount.id,
        destinationAccountNumber: destAccount.account_number,
        amountPaise: amountPaise.toString(),
        amountFormatted: formatRupees(amountPaise),
        sourceBalanceAfterPaise: newSourceBalance.toString(),
        sourceBalanceAfterFormatted: formatRupees(newSourceBalance),
        destinationBalanceAfterPaise: newDestBalance.toString(),
        destinationBalanceAfterFormatted: formatRupees(newDestBalance),
        ledgerEntries: [debitEntry.id, creditEntry.id],
        createdAt: transaction.created_at,
      };

      // 5. Complete Idempotency record atomically
      if (idempotencyEntryId) {
        await idempotencyRepository.complete(
          idempotencyEntryId,
          { transactionId: transaction.id, responseStatus: 200, responseBody: responseData },
          client
        );
      }

      await client.query('COMMIT;');
      return responseData;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK;').catch(() => {});
      }

      if (idempotencyKey) {
        await idempotencyRepository.deleteByKey(user.id, idempotencyKey).catch(() => {});
      }

      await auditRepository
        .create({
          actorId: user.id,
          action: 'TRANSACTION_TRANSFER_REFUSED',
          resourceType: 'TRANSACTION',
          metadata: {
            sourceAccountId: resolvedSourceId || sourceAccountId || null,
            destinationAccountId: resolvedDestId || destinationAccountId || null,
            sourceAccountNumber: resolvedSourceAccNum || rawSourceAccNum || null,
            destinationAccountNumber: resolvedDestAccNum || rawDestAccNum || null,
            amount: amount?.toString() || '0',
            refusalReason: error.message,
          },
          ipAddress: context.ipAddress,
        })
        .catch(() => {});

      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get transaction details by ID or Reference
   */
  async getTransactionById(transactionId, user) {
    let txn = null;
    if (accountRepository.isUuid(transactionId)) {
      txn = await transactionRepository.findById(transactionId);
    }
    if (!txn) {
      txn = await transactionRepository.findByReference(transactionId);
    }
    if (!txn) {
      throw AppError.notFound('Transaction not found');
    }

    let userAccountIds = null;
    if (user.role !== 'ADMIN' && user.role !== 'AUDITOR') {
      // Check if user is owner of either source or destination account
      const userAccounts = await accountRepository.findByOwnerId(user.id);
      userAccountIds = new Set(userAccounts.map((a) => a.id));

      const isParticipant =
        (txn.source_account_id && userAccountIds.has(txn.source_account_id)) ||
        (txn.destination_account_id && userAccountIds.has(txn.destination_account_id));

      if (!isParticipant) {
        throw AppError.forbidden('You do not have permission to view this transaction');
      }
    }

    const ledgerEntries = await ledgerRepository.findByTransactionId(txn.id);

    return {
      ...txn,
      amountPaise: txn.amount.toString(),
      amountFormatted: formatRupees(txn.amount),
      ledgerEntries: ledgerEntries.map((le) => {
        const canViewBalanceAfter =
          user.role === 'ADMIN' ||
          user.role === 'AUDITOR' ||
          (userAccountIds && userAccountIds.has(le.account_id));

        return {
          ...le,
          amountPaise: le.amount.toString(),
          amountFormatted: formatRupees(le.amount),
          balanceAfterPaise: canViewBalanceAfter ? le.balance_after.toString() : null,
          balanceAfterFormatted: canViewBalanceAfter ? formatRupees(le.balance_after) : '—',
        };
      }),
    };
  }

  /**
   * Get transactions with filtering (role-based)
   */
  async getTransactions(user, query = {}) {
    let filterAccountId = query.accountId || null;
    if (query.accountNumber) {
      const acc = await accountRepository.findByAccountNumber(query.accountNumber);
      if (!acc) {
        return { transactions: [], total: 0 };
      }
      filterAccountId = acc.id;
    }

    if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
      const result = await transactionRepository.findAll({
        ...query,
        accountId: filterAccountId,
      });
      return {
        ...result,
        transactions: result.transactions.map((t) => ({
          ...t,
          amountPaise: t.amount.toString(),
          amountFormatted: formatRupees(t.amount),
        })),
      };
    }

    // For account holders, restrict to transactions involving their accounts
    const userAccounts = await accountRepository.findByOwnerId(user.id);
    const userAccountIds = userAccounts.map((a) => a.id);

    if (userAccountIds.length === 0) {
      return { transactions: [], total: 0 };
    }

    // If filterAccountId is specified, ensure user owns it
    if (filterAccountId && !userAccountIds.includes(filterAccountId)) {
      throw AppError.forbidden('You do not have permission to inspect transactions for this account');
    }

    // Enforce account filtering at the SQL level so pagination and totals are accurate
    const result = await transactionRepository.findAll({
      ...query,
      accountId: filterAccountId,
      accountIds: filterAccountId ? null : userAccountIds,
    });

    return {
      ...result,
      transactions: result.transactions.map((t) => ({
        ...t,
        amountPaise: t.amount.toString(),
        amountFormatted: formatRupees(t.amount),
      })),
    };
  }
}

export const transactionService = new TransactionService();

