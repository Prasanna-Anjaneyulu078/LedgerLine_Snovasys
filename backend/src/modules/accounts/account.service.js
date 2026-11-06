import crypto from 'crypto';
import { accountRepository } from '../../repositories/account.repository.js';
import { ledgerRepository } from '../../repositories/ledger.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/appError.js';
import { formatRupees } from '../../utils/money.js';

export class AccountService {
  generateAccountNumber() {
    const random = crypto.randomInt(1000, 9999);
    return `LL-ACC-${Date.now().toString().slice(-4)}${random}`;
  }

  /**
   * Create a new bank account
   */
  async createAccount(ownerId, { accountType = 'SAVINGS', currency = 'INR' } = {}, context = {}) {
    const accountNumber = this.generateAccountNumber();

    const account = await accountRepository.create({
      accountNumber,
      ownerId,
      accountType,
      currency,
      initialBalance: 0n,
    });

    await auditRepository.create({
      actorId: ownerId,
      action: 'ACCOUNT_CREATED',
      resourceType: 'ACCOUNT',
      resourceId: account.id,
      metadata: { accountNumber: account.account_number, accountType },
      ipAddress: context.ipAddress,
    });

    return {
      ...account,
      balancePaise: account.balance.toString(),
      balanceFormatted: formatRupees(account.balance),
    };
  }

  /**
   * Retrieve accounts based on role and ownership
   */
  async getAccounts(user, query = {}) {
    if (user.role === 'ADMIN' || user.role === 'AUDITOR') {
      const result = await accountRepository.findAll(query);
      return {
        ...result,
        accounts: result.accounts.map((acc) => ({
          ...acc,
          balancePaise: acc.balance.toString(),
          balanceFormatted: formatRupees(acc.balance),
        })),
      };
    }

    const accounts = await accountRepository.findByOwnerId(user.id);
    return {
      accounts: accounts.map((acc) => ({
        ...acc,
        balancePaise: acc.balance.toString(),
        balanceFormatted: formatRupees(acc.balance),
      })),
      total: accounts.length,
    };
  }

  /**
   * Get single account details
   */
  async getAccountById(accountId, user) {
    const account = await accountRepository.findByIdOrAccountNumber(accountId);
    if (!account) {
      throw AppError.notFound('Account not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'AUDITOR' && account.owner_id !== user.id) {
      throw AppError.forbidden('You do not have permission to view this account');
    }

    return {
      ...account,
      balancePaise: account.balance.toString(),
      balanceFormatted: formatRupees(account.balance),
    };
  }

  /**
   * Get current balance for an account
   */
  async getAccountBalance(accountId, user) {
    const account = await this.getAccountById(accountId, user);
    return {
      accountId: account.id,
      accountNumber: account.account_number,
      currency: account.currency,
      balancePaise: account.balance.toString(),
      balanceFormatted: formatRupees(account.balance),
      status: account.status,
    };
  }

  /**
   * Get account statement (ledger history with running balances)
   */
  async getAccountStatement(accountId, user, query = {}) {
    await this.getAccountById(accountId, user);

    const statement = await ledgerRepository.findByAccountId(accountId, query);

    return {
      accountId,
      totalEntries: statement.total,
      entries: statement.entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transaction_id,
        transactionReference: entry.transaction_reference,
        transactionType: entry.transaction_type,
        transactionStatus: entry.transaction_status,
        entryType: entry.entry_type,
        amountPaise: entry.amount.toString(),
        amountFormatted: formatRupees(entry.amount),
        balanceAfterPaise: entry.balance_after.toString(),
        balanceAfterFormatted: formatRupees(entry.balance_after),
        description: entry.description,
        initiatorName: entry.initiator_name,
        createdAt: entry.created_at,
      })),
    };
  }
}

export const accountService = new AccountService();

