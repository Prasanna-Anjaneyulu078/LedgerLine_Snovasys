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

    // 1. Fetch committed ledger entries with accurate integer paise summary calculations
    const ledgerData = await ledgerRepository.findByAccountId(account.id, query);

    const openingBalancePaise = BigInt(ledgerData.openingBalancePaise || '0');
    const closingBalancePaise = BigInt(ledgerData.closingBalancePaise || '0');
    const totalDebitsPaise = BigInt(ledgerData.totalDebitsPaise || '0');
    const totalCreditsPaise = BigInt(ledgerData.totalCreditsPaise || '0');
    const netChangePaise = totalCreditsPaise - totalDebitsPaise;

    // Statement period description
    let periodDescription = `All Transactions (as of ${new Date().toISOString().slice(0, 10)})`;
    if (query.startDate && query.endDate) {
      periodDescription = `${new Date(query.startDate).toISOString().slice(0, 10)} to ${new Date(query.endDate).toISOString().slice(0, 10)}`;
    } else if (query.startDate) {
      periodDescription = `From ${new Date(query.startDate).toISOString().slice(0, 10)} to Present`;
    } else if (query.endDate) {
      periodDescription = `Up to ${new Date(query.endDate).toISOString().slice(0, 10)}`;
    } else if (ledgerData.firstEntryDate && ledgerData.lastEntryDate) {
      periodDescription = `${new Date(ledgerData.firstEntryDate).toISOString().slice(0, 10)} to ${new Date(ledgerData.lastEntryDate).toISOString().slice(0, 10)}`;
    }

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

    const committedPostings = ledgerData.entries.map((entry) => {
      const isCredit = entry.entry_type === 'CREDIT';
      const displayType = entry.transaction_type === 'TRANSFER'
        ? (isCredit ? 'TRANSFER IN' : 'TRANSFER OUT')
        : entry.transaction_type;

      return {
        ledgerEntryId: entry.id,
        transactionId: entry.transaction_id,
        transactionReference: entry.transaction_reference,
        transactionType: entry.transaction_type,
        displayType,
        display_type: displayType,
        transactionStatus: entry.transaction_status,
        date: entry.created_at,
        debitAmountFormatted: entry.entry_type === 'DEBIT' ? formatRupees(entry.amount) : null,
        creditAmountFormatted: entry.entry_type === 'CREDIT' ? formatRupees(entry.amount) : null,
        amountPaise: entry.amount.toString(),
        amountFormatted: formatRupees(entry.amount),
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
    });

    return {
      account: {
        id: account.id,
        accountNumber: account.account_number,
        accountType: account.account_type,
        currency: account.currency,
        currentBalancePaise: account.balance.toString(),
        currentBalanceFormatted: formatRupees(account.balance),
        status: account.status,
        holderName: account.owner_name,
      },
      statementPeriod: {
        startDate: query.startDate || ledgerData.firstEntryDate || null,
        endDate: query.endDate || ledgerData.lastEntryDate || null,
        periodDescription,
        formatted: periodDescription,
      },
      summary: {
        openingBalancePaise: openingBalancePaise.toString(),
        openingBalanceFormatted: formatRupees(openingBalancePaise),
        closingBalancePaise: closingBalancePaise.toString(),
        closingBalanceFormatted: formatRupees(closingBalancePaise),
        totalDebitsPaise: totalDebitsPaise.toString(),
        totalDebitsFormatted: formatRupees(totalDebitsPaise),
        totalCreditsPaise: totalCreditsPaise.toString(),
        totalCreditsFormatted: formatRupees(totalCreditsPaise),
        debitCount: ledgerData.debitCount || 0,
        creditCount: ledgerData.creditCount || 0,
        netChangePaise: netChangePaise.toString(),
        netChangeFormatted: formatRupees(netChangePaise),
      },
      pagination: {
        page: ledgerData.pagination.page,
        limit: ledgerData.pagination.limit,
        offset: ledgerData.pagination.offset,
        totalEntries: ledgerData.total,
        totalCommittedEntries: ledgerData.total,
        totalPages: ledgerData.pagination.totalPages,
        hasNextPage: ledgerData.pagination.page < ledgerData.pagination.totalPages,
        hasPrevPage: ledgerData.pagination.page > 1,
      },
      committedPostings,
      entries: committedPostings,
      refusedAttempts,
    };
  }
}

export const statementService = new StatementService();

