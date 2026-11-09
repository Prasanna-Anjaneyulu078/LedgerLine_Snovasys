import { accountRepository } from '../../repositories/account.repository.js';
import { ledgerRepository } from '../../repositories/ledger.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/appError.js';
import { formatRupees } from '../../utils/money.js';

export class StatementService {
  /**
   * Generates a comprehensive account statement with running balances and refused attempts
   */
  async getStatement(accountId, user, query = {}) {
    const account = await accountRepository.findByIdOrAccountNumber(accountId);
    if (!account) {
      throw AppError.notFound('Account not found');
    }

    if (user.role !== 'ADMIN' && user.role !== 'AUDITOR' && account.owner_id !== user.id) {
      throw AppError.forbidden('You do not have permission to view the statement for this account');
    }

    // 1. Fetch committed ledger entries
    const ledgerData = await ledgerRepository.findByAccountId(account.id, query);

    // 2. Fetch refused attempts from audit events for this account
    const auditData = await auditRepository.findAll({
      resourceType: 'ACCOUNT',
      limit: 20,
    });

    const refusedAttempts = auditData.events
      .filter((ev) => (ev.resource_id === account.id || ev.metadata?.accountNumber === account.account_number) && ev.action.includes('REFUSED'))
      .map((ev) => ({
        id: ev.id,
        action: ev.action,
        attemptedAt: ev.created_at,
        refusalReason: ev.metadata?.refusalReason || 'Operation refused by policy',
        attemptedAmount: ev.metadata?.amount || null,
        status: 'REFUSED',
      }));

    return {
      account: {
        id: account.id,
        accountNumber: account.account_number,
        accountType: account.account_type,
        currency: account.currency,
        currentBalancePaise: account.balance.toString(),
        currentBalanceFormatted: formatRupees(account.balance),
        status: account.status,
      },
      pagination: {
        totalCommittedEntries: ledgerData.total,
        limit: query.limit || 50,
        offset: query.offset || 0,
      },
      committedPostings: ledgerData.entries.map((entry) => {
        const isCredit = entry.entry_type === 'CREDIT';
        const displayType = entry.transaction_type === 'TRANSFER'
          ? (isCredit ? 'TRANSFER IN' : 'TRANSFER OUT')
          : entry.transaction_type;

        return {
          ledgerEntryId: entry.id,
          transactionReference: entry.transaction_reference,
          transactionType: entry.transaction_type,
          displayType,
          display_type: displayType,
          transactionStatus: entry.transaction_status,
          date: entry.created_at,
          debitAmountFormatted: entry.entry_type === 'DEBIT' ? formatRupees(entry.amount) : null,
          creditAmountFormatted: entry.entry_type === 'CREDIT' ? formatRupees(entry.amount) : null,
          amountPaise: entry.amount.toString(),
          entryType: entry.entry_type,
          entry_type: entry.entry_type,
          direction: isCredit ? 'INCOMING' : 'OUTGOING',
          isCredit,
          is_credit: isCredit,
          resultingRunningBalanceFormatted: formatRupees(entry.balance_after),
          resultingRunningBalancePaise: entry.balance_after.toString(),
          description: entry.description,
          initiator: entry.initiator_name,
        };
      }),
      refusedAttempts,
    };
  }
}

export const statementService = new StatementService();

