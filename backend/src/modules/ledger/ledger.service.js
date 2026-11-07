import { ledgerRepository } from '../../repositories/ledger.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { AppError } from '../../utils/appError.js';
import { formatRupees } from '../../utils/money.js';

export class LedgerService {
  /**
   * Global double-entry ledger view (restricted to ADMIN, AUDITOR)
   */
  async getAllLedgerEntries(query = {}) {
    const result = await ledgerRepository.findAll(query);
    return {
      ...result,
      totalCreditsFormatted: result.totalCreditsPaise ? formatRupees(result.totalCreditsPaise) : '0.00',
      totalDebitsFormatted: result.totalDebitsPaise ? formatRupees(result.totalDebitsPaise) : '0.00',
      entries: result.entries.map((e) => ({
        ...e,
        amountPaise: e.amount.toString(),
        amountFormatted: formatRupees(e.amount),
        balanceAfterPaise: e.balance_after.toString(),
        balanceAfterFormatted: formatRupees(e.balance_after),
      })),
    };
  }

  /**
   * Account-specific ledger view with running balance verification
   */
  async getAccountLedgerEntries(accountId, user, query = {}) {
    const account = await accountRepository.findByIdOrAccountNumber(accountId);
    if (!account) {
      throw AppError.notFound('Account not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'AUDITOR' && account.owner_id !== user.id) {
      throw AppError.forbidden('You do not have permission to view the ledger for this account');
    }

    const result = await ledgerRepository.findByAccountId(account.id, query);
    const netCalculatedPaise = await ledgerRepository.calculateNetBalanceFromLedger(account.id);

    return {
      accountId: account.id,
      accountNumber: account.account_number,
      currentBalancePaise: account.balance.toString(),
      currentBalanceFormatted: formatRupees(account.balance),
      ledgerCalculatedBalancePaise: netCalculatedPaise.toString(),
      isBalanceConsistent: BigInt(account.balance) === BigInt(netCalculatedPaise),
      totalEntries: result.total,
      entries: result.entries.map((e) => ({
        ...e,
        amountPaise: e.amount.toString(),
        amountFormatted: formatRupees(e.amount),
        balanceAfterPaise: e.balance_after.toString(),
        balanceAfterFormatted: formatRupees(e.balance_after),
      })),
    };
  }
}

export const ledgerService = new LedgerService();

