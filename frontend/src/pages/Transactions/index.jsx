import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Filter,
  Eye,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  RefreshCw,
  UserCheck,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import transactionService from '../../services/transactionService.js';
import accountService from '../../services/accountService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage, generateIdempotencyKey } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import Pagination from '../../components/Pagination/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import { getStoredPageSize, setStoredPageSize, PAGE_SIZE_OPTIONS } from '../../utils/pagination.js';
import './index.css';

const Transactions = () => {
  const { user, role } = useAuth();
  const location = useLocation();

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Server-Side Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filters
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Debounce search input to prevent rapid duplicate queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Transaction Modals: 'deposit', 'withdraw', 'transfer', or null
  const [activeModal, setActiveModal] = useState(null);
  const [selectedTxForDetails, setSelectedTxForDetails] = useState(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  // Idempotency & safe retry state
  const [idempotencyKey, setIdempotencyKey] = useState(null);
  const [isRetryAttempt, setIsRetryAttempt] = useState(false);
  const [uncertainOutcome, setUncertainOutcome] = useState(false);

  // Form states
  const [formAccountId, setFormAccountId] = useState('');
  const [formDestAccountId, setFormDestAccountId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');

  // Inter-user & Inter-account transfer states
  const [transferMode, setTransferMode] = useState('EXTERNAL'); // 'EXTERNAL' (recipient user) or 'INTERNAL' (own accounts)
  const [recipientAccountNumber, setRecipientAccountNumber] = useState('');
  const [recipientInfo, setRecipientInfo] = useState(null);
  const [isVerifyingRecipient, setIsVerifyingRecipient] = useState(false);
  const [recipientLookupError, setRecipientLookupError] = useState(null);

  // Fetch accounts on mount for action modals
  useEffect(() => {
    accountService.getAccounts()
      .then((accs) => {
        setAccounts(accs || []);
        if (accs && accs.length > 0) {
          setFormAccountId(accs[0].accountNumber || accs[0].id);
          if (accs.length > 1) {
            setFormDestAccountId(accs[1].accountNumber || accs[1].id);
          }
        }
      })
      .catch(() => {});
  }, []);

  // Server-side transaction fetching with filters, search, and pagination
  const fetchTransactions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page: currentPage,
        limit: pageSize,
      };
      if (typeFilter !== 'ALL') {
        query.type = typeFilter;
      }
      if (statusFilter !== 'ALL') {
        query.status = statusFilter;
      }
      if (debouncedSearch && debouncedSearch.trim() !== '') {
        query.search = debouncedSearch.trim();
      }

      const res = await transactionService.getTransactions(query);
      const list = res?.transactions || (Array.isArray(res) ? res : []);
      setTransactions(list);

      const total = res?.pagination?.totalTransactions ?? res?.total ?? list.length;
      setTotalTransactions(total);
      const pages = res?.pagination?.totalPages ?? (total > 0 ? Math.ceil(total / pageSize) : 1);
      const validPages = Math.max(1, pages);
      setTotalPages(validPages);
      if (currentPage > validPages) {
        setCurrentPage(validPages);
      }
    } catch (err) {
      setError('Unable to load transactions from ledger.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, typeFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  const loadData = useCallback(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Check URL query parameters for action (strictly restricted to ACCOUNT_HOLDER)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const acc = params.get('account');
    if (action && ['deposit', 'withdraw', 'transfer'].includes(action) && role === 'ACCOUNT_HOLDER') {
      setActiveModal(action);
      if (acc) {
        setFormAccountId(acc);
      }
    }
  }, [location.search, role]);

  const resetForm = () => {
    setFormAmount('');
    setFormDescription('');
    setFormError(null);
    setFormSuccess(null);
    setIdempotencyKey(null);
    setIsRetryAttempt(false);
    setUncertainOutcome(false);
    setTransferMode('EXTERNAL');
    setRecipientAccountNumber('');
    setRecipientInfo(null);
    setIsVerifyingRecipient(false);
    setRecipientLookupError(null);
  };

  const closeModal = () => {
    if (isSubmitting) return; // Prevent closing mid-flight
    setActiveModal(null);
    resetForm();
  };

  // Safe Recipient Verification for Inter-User Transfers
  const verifyRecipient = useCallback(
    async (accNum) => {
      const clean = String(accNum || '').trim();
      if (!clean) {
        setRecipientInfo(null);
        setRecipientLookupError(null);
        return;
      }

      setIsVerifyingRecipient(true);
      setRecipientLookupError(null);

      try {
        const data = await accountService.validateRecipientAccount(clean);
        setRecipientInfo(data);
        if (data.accountNumber === formAccountId) {
          setRecipientLookupError('Source and recipient accounts must be different.');
        } else if (!data.isEligible) {
          setRecipientLookupError(`Account is currently ${data.status} and cannot receive transfers.`);
        } else {
          setRecipientLookupError(null);
        }
      } catch (err) {
        setRecipientInfo(null);
        const msg =
          err?.response?.data?.message ||
          err?.message ||
          'Recipient account not found. Please verify the account number.';
        setRecipientLookupError(msg);
      } finally {
        setIsVerifyingRecipient(false);
      }
    },
    [formAccountId]
  );

  const handleRecipientNumberChange = (e) => {
    const val = e.target.value.toUpperCase();
    setRecipientAccountNumber(val);
    setFormDestAccountId(val);
    setRecipientInfo(null);
    setRecipientLookupError(null);
    if (idempotencyKey) {
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);
    }
    if (formError) setFormError(null);
  };

  // Debounced auto-verification of recipient account number
  useEffect(() => {
    if (activeModal !== 'transfer' || transferMode !== 'EXTERNAL') return;
    const trimmed = recipientAccountNumber.trim();
    if (trimmed.length < 5) {
      setRecipientInfo(null);
      setRecipientLookupError(null);
      return;
    }

    const timer = setTimeout(() => {
      verifyRecipient(trimmed);
    }, 450);

    return () => clearTimeout(timer);
  }, [recipientAccountNumber, activeModal, transferMode, verifyRecipient]);

  // Form field modification handlers: any change treats the submission as a new logical operation
  // and invalidates the cached idempotency key to prevent payload tampering conflicts (HTTP 409).
  const handleAccountIdChange = (e) => {
    setFormAccountId(e.target.value);
    if (idempotencyKey) {
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);
    }
    if (formError) setFormError(null);
  };

  const handleDestAccountIdChange = (e) => {
    setFormDestAccountId(e.target.value);
    if (idempotencyKey) {
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);
    }
    if (formError) setFormError(null);
  };

  const handleAmountChange = (e) => {
    setFormAmount(e.target.value);
    if (idempotencyKey) {
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);
    }
    if (formError) setFormError(null);
  };

  const handleDescriptionChange = (e) => {
    setFormDescription(e.target.value);
    if (idempotencyKey) {
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);
    }
    if (formError) setFormError(null);
  };

  const handleDepositSubmit = async () => {
    if (isSubmitting) return;

    if (role !== 'ACCOUNT_HOLDER') {
      setFormError('Financial operations are restricted to Account Holders only.');
      return;
    }

    if (!formAccountId || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid target account and positive amount.');
      return;
    }

    // Reuse existing key if retrying the same operation; otherwise generate a fresh UUID key
    const activeKey = idempotencyKey || generateIdempotencyKey();
    if (!idempotencyKey) {
      setIdempotencyKey(activeKey);
    }

    setIsSubmitting(true);
    setFormError(null);
    setUncertainOutcome(false);

    try {
      await transactionService.deposit(
        {
          accountNumber: formAccountId,
          amount: parseFloat(formAmount),
          description: formDescription || 'Account deposit',
        },
        activeKey
      );
      setFormSuccess('Deposit successfully executed and posted to ledger.');
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);

      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      const errMsg = getErrorMessage(err);
      const isTimeout =
        err?.code === 'ECONNABORTED' ||
        String(err?.message || '').toLowerCase().includes('timeout');
      const isNetworkErr = err?.code === 'ERR_NETWORK' || !err?.response;
      const status = err?.response?.status;

      if (isTimeout || isNetworkErr || status === 408 || status === 504) {
        setUncertainOutcome(true);
        setIsRetryAttempt(true);
        setFormError(
          'Network timeout or connection interrupted. The server may have already processed this deposit. Check your Transaction Journal to verify, or click "Retry Deposit" below to safely re-verify with duplicate protection.'
        );
      } else if (status >= 500 || status === 429) {
        setIsRetryAttempt(true);
        setFormError(`${errMsg} You may safely click "Retry Deposit" to attempt completion.`);
      } else {
        setIdempotencyKey(null);
        setIsRetryAttempt(false);
        setFormError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async () => {
    if (isSubmitting) return;

    if (role !== 'ACCOUNT_HOLDER') {
      setFormError('Financial operations are restricted to Account Holders only.');
      return;
    }

    if (!formAccountId || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid source account and positive amount.');
      return;
    }

    // Reuse existing key if retrying the same operation; otherwise generate a fresh UUID key
    const activeKey = idempotencyKey || generateIdempotencyKey();
    if (!idempotencyKey) {
      setIdempotencyKey(activeKey);
    }

    setIsSubmitting(true);
    setFormError(null);
    setUncertainOutcome(false);

    try {
      await transactionService.withdraw(
        {
          accountNumber: formAccountId,
          amount: parseFloat(formAmount),
          description: formDescription || 'Account withdrawal',
        },
        activeKey
      );
      setFormSuccess('Withdrawal verified, balance updated and posted to ledger.');
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);

      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      const errMsg = getErrorMessage(err);
      const isTimeout =
        err?.code === 'ECONNABORTED' ||
        String(err?.message || '').toLowerCase().includes('timeout');
      const isNetworkErr = err?.code === 'ERR_NETWORK' || !err?.response;
      const status = err?.response?.status;

      if (isTimeout || isNetworkErr || status === 408 || status === 504) {
        setUncertainOutcome(true);
        setIsRetryAttempt(true);
        setFormError(
          'Network timeout or connection interrupted. The server may have already processed this withdrawal. Check your Transaction Journal to verify, or click "Retry Withdrawal" below to safely re-verify with duplicate protection.'
        );
      } else if (status >= 500 || status === 429) {
        setIsRetryAttempt(true);
        setFormError(`${errMsg} You may safely click "Retry Withdrawal" to attempt completion.`);
      } else {
        setIdempotencyKey(null);
        setIsRetryAttempt(false);
        setFormError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (isSubmitting) return;

    if (role !== 'ACCOUNT_HOLDER') {
      setFormError('Financial operations are restricted to Account Holders only.');
      return;
    }

    const targetDest = transferMode === 'EXTERNAL' ? recipientAccountNumber.trim() : formDestAccountId;

    if (!formAccountId || !targetDest || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please specify source, valid recipient account, and a positive amount.');
      return;
    }
    if (formAccountId === targetDest) {
      setFormError('Source and destination accounts must be distinct.');
      return;
    }

    if (transferMode === 'EXTERNAL' && !recipientInfo) {
      setFormError('Please verify the recipient account before executing the transfer.');
      return;
    }

    if (transferMode === 'EXTERNAL' && recipientInfo && !recipientInfo.isEligible) {
      setFormError(`Recipient account is currently ${recipientInfo.status} and cannot receive transfers.`);
      return;
    }

    // Client-side balance pre-check
    const selectedSourceAcc = accounts.find((a) => (a.accountNumber || a.id) === formAccountId);
    if (selectedSourceAcc && selectedSourceAcc.balance !== undefined && parseFloat(formAmount) > selectedSourceAcc.balance) {
      setFormError(`Insufficient funds in source account (Balance: ₹${selectedSourceAcc.balance.toFixed(2)}, required ₹${parseFloat(formAmount).toFixed(2)}).`);
      return;
    }

    // Reuse existing key if retrying the same operation; otherwise generate a fresh UUID key
    const activeKey = idempotencyKey || generateIdempotencyKey();
    if (!idempotencyKey) {
      setIdempotencyKey(activeKey);
    }

    setIsSubmitting(true);
    setFormError(null);
    setUncertainOutcome(false);

    try {
      await transactionService.transfer(
        {
          sourceAccountNumber: formAccountId,
          destinationAccountNumber: targetDest,
          amount: parseFloat(formAmount),
          description: formDescription || 'Inter-account transfer',
        },
        activeKey
      );
      setFormSuccess('Double-entry transfer completed and verified in ledger.');
      setIdempotencyKey(null);
      setIsRetryAttempt(false);
      setUncertainOutcome(false);

      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      const errMsg = getErrorMessage(err);
      const isTimeout =
        err?.code === 'ECONNABORTED' ||
        String(err?.message || '').toLowerCase().includes('timeout');
      const isNetworkErr = err?.code === 'ERR_NETWORK' || !err?.response;
      const status = err?.response?.status;

      if (isTimeout || isNetworkErr || status === 408 || status === 504) {
        setUncertainOutcome(true);
        setIsRetryAttempt(true);
        setFormError(
          'Network timeout or connection interrupted. The server may have already processed this transfer. Check your Transaction Journal to verify, or click "Retry Transfer" below to safely re-verify with duplicate protection.'
        );
      } else if (status >= 500 || status === 429) {
        setIsRetryAttempt(true);
        setFormError(`${errMsg} You may safely click "Retry Transfer" to attempt completion.`);
      } else {
        setIdempotencyKey(null);
        setIsRetryAttempt(false);
        setFormError(errMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenTransactionDetails = async (row) => {
    setSelectedTxForDetails(row);
    setIsLoadingDetails(true);
    try {
      // Authoritative GET /transactions/{transactionId} call carrying double-entry ledger postings
      const fullTx = await transactionService.getTransactionById(row.id || row.reference);
      if (fullTx) {
        setSelectedTxForDetails(fullTx);
      }
    } catch (err) {
      console.warn('Failed to load transaction ledger details:', err);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const columns = [
    {
      header: 'Reference',
      accessor: 'reference',
      render: (row) => (
        <button
          type="button"
          className="table-link-btn"
          onClick={() => handleOpenTransactionDetails(row)}
          title="Click to view full transaction and double-entry ledger postings"
          style={{
            fontWeight: 600,
            fontFamily: 'monospace',
            textAlign: 'left',
          }}
        >
          {row.reference || row.transactionReference || '—'}
        </button>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.displayType || row.type || row.transactionType} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const rowType = row.displayType || row.type || row.transactionType;
        const userAccountIdentifiers = new Set(accounts.map((a) => a.accountNumber || a.id));
        const isIncoming =
          row.isCredit === true ||
          rowType === 'TRANSFER IN' ||
          rowType === 'DEPOSIT' ||
          (rowType === 'TRANSFER' &&
            userAccountIdentifiers.has(row.destinationAccountNumber || row.destinationAccountId) &&
            !userAccountIdentifiers.has(row.sourceAccountNumber || row.sourceAccountId));

        const isCredit = isIncoming;
        const isOutgoing =
          row.isCredit === false ||
          rowType === 'TRANSFER OUT' ||
          rowType === 'WITHDRAWAL' ||
          (rowType === 'TRANSFER' &&
            userAccountIdentifiers.has(row.sourceAccountNumber || row.sourceAccountId) &&
            !userAccountIdentifiers.has(row.destinationAccountNumber || row.destinationAccountId));

        const isRefused = row.status === 'REFUSED';
        const color = isRefused
          ? 'var(--text-secondary)'
          : isCredit
          ? 'var(--success-color)'
          : 'var(--danger-color)';

        const prefix = isRefused ? '' : isCredit ? '+' : isOutgoing ? '-' : '';
        return (
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color }}>
            {prefix}
            {formatCurrency(row.amount)}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Timestamp',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  const accountOptions = accounts.map((acc) => ({
    value: acc.accountNumber || acc.id,
    label: `${acc.accountNumber} (${acc.accountType} - ${formatCurrency(acc.balance)})`,
  }));

  const ownDestOptions = accounts
    .filter((acc) => (acc.accountNumber || acc.id) !== formAccountId)
    .map((acc) => ({
      value: acc.accountNumber || acc.id,
      label: `${acc.accountNumber} (${acc.accountType} - ${formatCurrency(acc.balance)})`,
    }));

  const allDestOptions = accounts.map((acc) => ({
    value: acc.accountNumber || acc.id,
    label: `${acc.accountNumber} - ${acc.holderName} (${acc.accountType})`,
  }));

  return (
    <DashboardLayout
      title="Transaction Management"
      breadcrumbs={`${role === 'ADMIN' ? 'Admin' : role === 'AUDITOR' ? 'Auditor' : 'Account'} / Transactions`}
    >
      <div className="transactions-page">
        {/* Header Bar */}
        <div className="transactions-header-bar">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              Financial Transactions
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Idempotent transaction execution with immutable double-entry ledger postings.
            </p>
          </div>

          {/* Action Buttons: exclusively for ACCOUNT_HOLDER */}
          {role === 'ACCOUNT_HOLDER' && (
            <div className="transactions-action-buttons">
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  resetForm();
                  setActiveModal('deposit');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowDownLeft size={16} />
                <span>Deposit Funds</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetForm();
                  setActiveModal('withdraw');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowUpRight size={16} />
                <span>Withdraw</span>
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  resetForm();
                  setActiveModal('transfer');
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeftRight size={16} />
                <span>Transfer Funds</span>
              </button>
            </div>
          )}
        </div>

        {/* Responsive Filter Dropdown Section */}
        <div className="filters-container">
          <div className="filters-header">
            <Filter size={15} style={{ color: 'var(--primary-color)' }} />
            <span>Filter Transactions</span>
          </div>

          <div className="filters-controls">
            <div className="filter-group">
              <label htmlFor="tx-type-filter" className="filter-label">
                Type:
              </label>
              <select
                id="tx-type-filter"
                className="filter-select"
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Types</option>
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAWAL">Withdrawal</option>
                <option value="TRANSFER">Transfer</option>
              </select>
            </div>

            <div className="filter-group">
              <label htmlFor="tx-status-filter" className="filter-label">
                Status:
              </label>
              <select
                id="tx-status-filter"
                className="filter-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="REFUSED">Refused</option>
              </select>
            </div>

            {(typeFilter !== 'ALL' || statusFilter !== 'ALL' || searchTerm.trim() !== '') && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={() => {
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                title="Reset active filters"
              >
                <RotateCcw size={12} />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Data Table */}
        {isLoading ? (
          <LoadingState message="Loading financial transaction history..." />
        ) : error ? (
          <ErrorState message={error} onRetry={loadData} />
        ) : (
          <DataTable
            columns={columns}
            data={transactions}
            title="Transaction Journal"
            subtitle={`${totalTransactions} total transaction entries in database`}
            searchPlaceholder="Search by ref, description, or account..."
            searchValue={searchTerm}
            onSearchChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            pagination={
              <Pagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalRecords={totalTransactions}
                totalPages={totalPages}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setStoredPageSize(size);
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                disabled={isLoading}
              />
            }
            emptyMessage="No transactions matched the selected filters."
          />
        )}

        {/* FINANCIAL TRANSACTION MODALS: ACCOUNT_HOLDER ONLY */}
        {role === 'ACCOUNT_HOLDER' && (
          <>
            {/* DEPOSIT MODAL */}
            <ConfirmModal
              isOpen={activeModal === 'deposit'}
              title="Deposit Funds"
              confirmText={isRetryAttempt ? 'Retry Deposit' : 'Execute Deposit'}
              onConfirm={handleDepositSubmit}
              onClose={closeModal}
              isLoading={isSubmitting}
            >
              {formSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--success-color)' }}>
                  <CheckCircle2 size={36} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontWeight: 600 }}>{formSuccess}</p>
                </div>
              ) : (
                <div>
                  {/* Idempotency Protection Indicator Badge */}
                  <div className="idempotency-badge">
                    <ShieldCheck size={16} className="idempotency-icon" />
                    <span>Duplicate transaction protection is enabled.</span>
                  </div>

                  {/* Uncertain Outcome Alert */}
                  {uncertainOutcome && (
                    <div className="tx-uncertain-alert">
                      <div className="tx-uncertain-alert-header">
                        <AlertTriangle size={16} />
                        <span>Uncertain Transaction Outcome</span>
                      </div>
                      <p>
                        A network timeout or connection interruption occurred before the server response was received.
                        The ledger may have completed this operation. Please verify your <strong>Transaction Journal</strong>.
                        If you choose to retry, duplicate protection guarantees no double-charging.
                      </p>
                    </div>
                  )}

                  {/* Retry with Same Key Notice */}
                  {isRetryAttempt && !uncertainOutcome && (
                    <div className="idempotency-retry-notice">
                      <RefreshCw size={14} className="retry-icon" />
                      <span>Safe Retry Active: Resubmitting with original transaction key to prevent duplicate ledger postings.</span>
                    </div>
                  )}

                  {formError && !uncertainOutcome && (
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                      {formError}
                    </div>
                  )}

                  <FormInput
                    label="Target Credit Account"
                    type="select"
                    value={formAccountId}
                    onChange={handleAccountIdChange}
                    options={accountOptions}
                    required
                    disabled={isSubmitting}
                  />
                  <FormInput
                    label="Deposit Amount"
                    type="number"
                    step="0.01"
                    min="1"
                    value={formAmount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    prefix="₹"
                    required
                    disabled={isSubmitting}
                  />
                  <FormInput
                    label="Transaction Description / Reference Note"
                    type="text"
                    value={formDescription}
                    onChange={handleDescriptionChange}
                    placeholder="e.g. Inward institutional deposit"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </ConfirmModal>

            {/* WITHDRAW MODAL */}
            <ConfirmModal
              isOpen={activeModal === 'withdraw'}
              title="Withdraw Funds"
              confirmText={isRetryAttempt ? 'Retry Withdrawal' : 'Confirm Withdrawal'}
              onConfirm={handleWithdrawSubmit}
              onClose={closeModal}
              isLoading={isSubmitting}
            >
              {formSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--success-color)' }}>
                  <CheckCircle2 size={36} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontWeight: 600 }}>{formSuccess}</p>
                </div>
              ) : (
                <div>
                  {/* Idempotency Protection Indicator Badge */}
                  <div className="idempotency-badge">
                    <ShieldCheck size={16} className="idempotency-icon" />
                    <span>Duplicate transaction protection is enabled.</span>
                  </div>

                  {/* Uncertain Outcome Alert */}
                  {uncertainOutcome && (
                    <div className="tx-uncertain-alert">
                      <div className="tx-uncertain-alert-header">
                        <AlertTriangle size={16} />
                        <span>Uncertain Transaction Outcome</span>
                      </div>
                      <p>
                        A network timeout or connection interruption occurred before the server response was received.
                        The ledger may have completed this operation. Please verify your <strong>Transaction Journal</strong>.
                        If you choose to retry, duplicate protection guarantees no double-charging.
                      </p>
                    </div>
                  )}

                  {/* Retry with Same Key Notice */}
                  {isRetryAttempt && !uncertainOutcome && (
                    <div className="idempotency-retry-notice">
                      <RefreshCw size={14} className="retry-icon" />
                      <span>Safe Retry Active: Resubmitting with original transaction key to prevent duplicate ledger postings.</span>
                    </div>
                  )}

                  {formError && !uncertainOutcome && (
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                      {formError}
                    </div>
                  )}

                  <FormInput
                    label="Source Debit Account"
                    type="select"
                    value={formAccountId}
                    onChange={handleAccountIdChange}
                    options={accountOptions}
                    required
                    disabled={isSubmitting}
                  />
                  <FormInput
                    label="Withdrawal Amount"
                    type="number"
                    step="0.01"
                    min="1"
                    value={formAmount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    prefix="₹"
                    required
                    disabled={isSubmitting}
                  />
                  <FormInput
                    label="Disbursement Description"
                    type="text"
                    value={formDescription}
                    onChange={handleDescriptionChange}
                    placeholder="e.g. Vendor operational payout"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </ConfirmModal>

            {/* TRANSFER MODAL */}
            <ConfirmModal
              isOpen={activeModal === 'transfer'}
              title="Inter-Account & Inter-User Transfer"
              confirmText={isRetryAttempt ? 'Retry Transfer' : 'Execute Transfer'}
              onConfirm={handleTransferSubmit}
              onClose={closeModal}
              isLoading={isSubmitting}
            >
              {formSuccess ? (
                <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--success-color)' }}>
                  <CheckCircle2 size={36} style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontWeight: 600 }}>{formSuccess}</p>
                </div>
              ) : (
                <div>
                  {/* Idempotency Protection Indicator Badge */}
                  <div className="idempotency-badge">
                    <ShieldCheck size={16} className="idempotency-icon" />
                    <span>Duplicate transaction protection is enabled.</span>
                  </div>

                  {/* Uncertain Outcome Alert */}
                  {uncertainOutcome && (
                    <div className="tx-uncertain-alert">
                      <div className="tx-uncertain-alert-header">
                        <AlertTriangle size={16} />
                        <span>Uncertain Transaction Outcome</span>
                      </div>
                      <p>
                        A network timeout or connection interruption occurred before the server response was received.
                        The ledger may have completed this operation. Please verify your <strong>Transaction Journal</strong>.
                        If you choose to retry, duplicate protection guarantees no double-charging.
                      </p>
                    </div>
                  )}

                  {/* Retry with Same Key Notice */}
                  {isRetryAttempt && !uncertainOutcome && (
                    <div className="idempotency-retry-notice">
                      <RefreshCw size={14} className="retry-icon" />
                      <span>Safe Retry Active: Resubmitting with original transaction key to prevent duplicate ledger postings.</span>
                    </div>
                  )}

                  {formError && !uncertainOutcome && (
                    <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                      {formError}
                    </div>
                  )}

                  {/* Destination Mode Selector */}
                  <div className="transfer-mode-selector">
                    <button
                      type="button"
                      className={`transfer-mode-btn ${transferMode === 'EXTERNAL' ? 'active' : ''}`}
                      onClick={() => {
                        setTransferMode('EXTERNAL');
                        setFormDestAccountId(recipientAccountNumber.trim());
                        if (idempotencyKey) setIdempotencyKey(null);
                      }}
                      disabled={isSubmitting}
                    >
                      <UserCheck size={14} />
                      <span>Transfer to Another User</span>
                    </button>
                    {accounts.length > 1 && (
                      <button
                        type="button"
                        className={`transfer-mode-btn ${transferMode === 'INTERNAL' ? 'active' : ''}`}
                        onClick={() => {
                          setTransferMode('INTERNAL');
                          const other = accounts.find((a) => (a.accountNumber || a.id) !== formAccountId);
                          if (other) {
                            setFormDestAccountId(other.accountNumber || other.id);
                          }
                          setRecipientInfo(null);
                          setRecipientLookupError(null);
                          if (idempotencyKey) setIdempotencyKey(null);
                        }}
                        disabled={isSubmitting}
                      >
                        <ArrowLeftRight size={14} />
                        <span>Between My Accounts</span>
                      </button>
                    )}
                  </div>

                  {/* Source (Debit) Account */}
                  <FormInput
                    label="Source (Debit) Account"
                    type="select"
                    value={formAccountId}
                    onChange={handleAccountIdChange}
                    options={accountOptions}
                    required
                    disabled={isSubmitting}
                  />

                  {/* Destination / Recipient Account */}
                  {transferMode === 'EXTERNAL' ? (
                    <div className="form-group recipient-section">
                      <label htmlFor="recipient-account-input" className="form-label">
                        <span>
                          Recipient Account Number <span className="form-required">*</span>
                        </span>
                      </label>
                      <div className="recipient-input-row">
                        <input
                          id="recipient-account-input"
                          type="text"
                          className="form-input recipient-account-input"
                          value={recipientAccountNumber}
                          onChange={handleRecipientNumberChange}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (recipientAccountNumber.trim() && !isVerifyingRecipient && !isSubmitting) {
                                verifyRecipient(recipientAccountNumber);
                              }
                            }
                          }}
                          placeholder="e.g. LL-ACC-2001"
                          required
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="btn-verify-recipient"
                          onClick={() => verifyRecipient(recipientAccountNumber)}
                          disabled={isSubmitting || isVerifyingRecipient || !recipientAccountNumber.trim()}
                        >
                          {isVerifyingRecipient ? (
                            <>
                              <RefreshCw size={13} className="spin-icon" />
                              <span>Verifying...</span>
                            </>
                          ) : (
                            <>
                              <Search size={13} />
                              <span>Verify</span>
                            </>
                          )}
                        </button>
                      </div>

                      {/* Recipient Verifying Indicator */}
                      {isVerifyingRecipient && (
                        <div className="recipient-verifying-indicator">
                          <RefreshCw size={12} className="spin-icon" />
                          <span>Checking recipient account in registry...</span>
                        </div>
                      )}

                      {/* Recipient Lookup Error */}
                      {recipientLookupError && (
                        <div className="recipient-lookup-error">
                          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
                          <span>{recipientLookupError}</span>
                        </div>
                      )}

                      {/* Verified Recipient Details Card */}
                      {recipientInfo && (
                        <div className="recipient-verification-card">
                          <div className="recipient-verified-header">
                            <CheckCircle2 size={16} />
                            <span style={{ fontWeight: 700 }}>Recipient Verified & Eligible</span>
                          </div>
                          <div className="recipient-verified-grid">
                            <div>
                              <span className="recipient-detail-label">Account Holder</span>
                              <span className="recipient-detail-value">
                                {recipientInfo.holderName} {recipientInfo.isOwnAccount ? '(Your Account)' : ''}
                              </span>
                            </div>
                            <div>
                              <span className="recipient-detail-label">Account Number</span>
                              <span className="recipient-detail-value tabular-nums">
                                {recipientInfo.accountNumber}
                              </span>
                            </div>
                            <div>
                              <span className="recipient-detail-label">Account Type</span>
                              <span className="recipient-detail-value">
                                {recipientInfo.accountType}
                              </span>
                            </div>
                            <div>
                              <span className="recipient-detail-label">Status</span>
                              <div>
                                <StatusBadge status={recipientInfo.status} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      {ownDestOptions.length > 0 ? (
                        <FormInput
                          label="Destination (Credit) Account"
                          type="select"
                          value={formDestAccountId}
                          onChange={handleDestAccountIdChange}
                          options={ownDestOptions}
                          required
                          disabled={isSubmitting}
                        />
                      ) : (
                        <div style={{ padding: '8px 12px', backgroundColor: 'var(--surface-secondary)', borderRadius: '4px', marginBottom: '1rem', fontSize: '0.8125rem' }}>
                          No secondary account found. Please use "Transfer to Another User" above.
                        </div>
                      )}
                    </div>
                  )}

                  <FormInput
                    label="Transfer Amount"
                    type="number"
                    step="0.01"
                    min="1"
                    value={formAmount}
                    onChange={handleAmountChange}
                    placeholder="0.00"
                    prefix="₹"
                    required
                    disabled={isSubmitting}
                  />
                  <FormInput
                    label="Transfer Purpose / Ledger Note"
                    type="text"
                    value={formDescription}
                    onChange={handleDescriptionChange}
                    placeholder="e.g. Liquidity balancing or invoice payment"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </ConfirmModal>
          </>
        )}

        {/* TRANSACTION DETAILS MODAL */}
        {selectedTxForDetails && (
          <ConfirmModal
            isOpen={!!selectedTxForDetails}
            title={`Transaction Details: ${selectedTxForDetails.reference}`}
            confirmText="Close Inspector"
            cancelText="Print Record"
            onConfirm={() => setSelectedTxForDetails(null)}
            onClose={() => setSelectedTxForDetails(null)}
          >
            <div>
              {selectedTxForDetails.refusalReason && (
                <div className="tx-refusal-alert">
                  <strong>Refusal Notification:</strong> {selectedTxForDetails.refusalReason}
                </div>
              )}

              <div className="tx-details-grid">
                <div className="tx-detail-box">
                  <div className="tx-detail-label">Reference Number</div>
                  <div className="tx-detail-value tabular-nums">
                    {selectedTxForDetails.reference}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Transaction Type</div>
                  <div className="tx-detail-value">
                    <StatusBadge status={selectedTxForDetails.displayType || selectedTxForDetails.type} />
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Transacted Amount</div>
                  <div
                    className="tx-detail-value tabular-nums"
                    style={{
                      color: selectedTxForDetails.isCredit || selectedTxForDetails.displayType === 'TRANSFER IN' || selectedTxForDetails.type === 'DEPOSIT'
                        ? 'var(--success-color)'
                        : 'var(--danger-color)'
                    }}
                  >
                    {(selectedTxForDetails.isCredit || selectedTxForDetails.displayType === 'TRANSFER IN' || selectedTxForDetails.type === 'DEPOSIT' ? '+' : '-')}{formatCurrency(selectedTxForDetails.amount)}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Posting Status</div>
                  <div className="tx-detail-value">
                    <StatusBadge status={selectedTxForDetails.status} />
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Source Account</div>
                  <div className="tx-detail-value tabular-nums">
                    {selectedTxForDetails.sourceAccountNumber || selectedTxForDetails.source_account_number || 'External Liquidity / Cash Vault'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Destination Account</div>
                  <div className="tx-detail-value tabular-nums">
                    {selectedTxForDetails.destinationAccountNumber || selectedTxForDetails.destination_account_number || 'External Payout / Cash Vault'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Initiator</div>
                  <div className="tx-detail-value">
                    {selectedTxForDetails.initiatorName || 'Authorized User'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Timestamp</div>
                  <div className="tx-detail-value tabular-nums">
                    {formatDate(selectedTxForDetails.createdAt)}
                  </div>
                </div>
              </div>

              <div className="tx-detail-box" style={{ width: '100%' }}>
                <div className="tx-detail-label">Description / Remarks</div>
                <div className="tx-detail-value" style={{ fontWeight: 400 }}>
                  {selectedTxForDetails.description || 'No additional remarks.'}
                </div>
              </div>

              {/* Authoritative Double-Entry Ledger Postings from GET /transactions/{id} */}
              {selectedTxForDetails.ledgerEntries && selectedTxForDetails.ledgerEntries.length > 0 && (
                <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Associated Double-Entry Ledger Postings</span>
                    <span>{selectedTxForDetails.ledgerEntries.length} entries</span>
                  </div>
                  <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={{ padding: '6px 8px' }}>Account Number</th>
                          <th style={{ padding: '6px 8px' }}>Entry Type</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                          <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance After</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedTxForDetails.ledgerEntries.map((le, idx) => (
                          <tr key={le.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '6px 8px', fontWeight: 600 }}>{le.account_number || le.accountNumber}</td>
                            <td style={{ padding: '6px 8px' }}><StatusBadge status={le.entry_type || le.entryType} /></td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: (le.entry_type || le.entryType) === 'CREDIT' ? 'var(--success-color)' : 'var(--text-color)' }}>
                              {(le.entry_type || le.entryType) === 'CREDIT' ? '+' : '-'}₹{le.amountFormatted || (Number(le.amountPaise || le.amount || 0) / 100).toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{le.balanceAfterFormatted || (Number(le.balanceAfterPaise || le.balance_after || 0) / 100).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
