import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import transactionService from '../../services/transactionService.js';
import accountService from '../../services/accountService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const Transactions = () => {
  const { user, role } = useAuth();
  const location = useLocation();

  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Transaction Modals: 'deposit', 'withdraw', 'transfer', or null
  const [activeModal, setActiveModal] = useState(null);
  const [selectedTxForDetails, setSelectedTxForDetails] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [formSuccess, setFormSuccess] = useState(null);

  // Form states
  const [formAccountId, setFormAccountId] = useState('');
  const [formDestAccountId, setFormDestAccountId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [txs, accs] = await Promise.all([
        transactionService.getTransactions(),
        accountService.getAccounts(),
      ]);
      setTransactions(txs || []);
      setAccounts(accs || []);

      if (accs && accs.length > 0) {
        setFormAccountId(accs[0].id);
        if (accs.length > 1) {
          setFormDestAccountId(accs[1].id);
        }
      }
    } catch (err) {
      setError('Unable to load transactions from ledger.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Check URL query parameters for action
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get('action');
    const acc = params.get('account');
    if (action && ['deposit', 'withdraw', 'transfer'].includes(action) && role !== 'AUDITOR') {
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
  };

  const closeModal = () => {
    setActiveModal(null);
    resetForm();
  };

  const handleDepositSubmit = async () => {
    if (!formAccountId || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid target account and positive amount.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await transactionService.deposit({
        accountId: formAccountId,
        amount: parseFloat(formAmount),
        description: formDescription || 'Account deposit',
      });
      setFormSuccess('Deposit successfully executed and posted to ledger.');
      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWithdrawSubmit = async () => {
    if (!formAccountId || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please enter a valid source account and positive amount.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await transactionService.withdraw({
        accountId: formAccountId,
        amount: parseFloat(formAmount),
        description: formDescription || 'Account withdrawal',
      });
      setFormSuccess('Withdrawal verified, balance updated and posted to ledger.');
      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (!formAccountId || !formDestAccountId || !formAmount || parseFloat(formAmount) <= 0) {
      setFormError('Please specify source, destination, and a valid amount.');
      return;
    }
    if (formAccountId === formDestAccountId) {
      setFormError('Source and destination accounts must be distinct.');
      return;
    }
    setIsSubmitting(true);
    setFormError(null);
    try {
      await transactionService.transfer({
        sourceAccountId: formAccountId,
        destinationAccountId: formDestAccountId,
        amount: parseFloat(formAmount),
        description: formDescription || 'Inter-account transfer',
      });
      setFormSuccess('Double-entry transfer completed and verified in ledger.');
      setTimeout(() => {
        closeModal();
        loadData();
      }, 1200);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    if (typeFilter !== 'ALL' && tx.type !== typeFilter) return false;
    if (statusFilter !== 'ALL' && tx.status !== statusFilter) return false;
    return true;
  });

  const columns = [
    {
      header: 'Reference',
      accessor: 'reference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.reference}
        </span>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.type} />,
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (row) => <span>{row.description || '—'}</span>,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const isCredit = row.type === 'DEPOSIT';
        const color =
          row.status === 'REFUSED'
            ? 'var(--text-secondary)'
            : isCredit
            ? 'var(--success-color)'
            : 'var(--text-color)';
        const prefix = row.status === 'REFUSED' ? '' : isCredit ? '+' : '-';
        return (
          <span style={{ fontWeight: 700, color }}>
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
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      header: 'Action',
      align: 'center',
      render: (row) => (
        <button
          type="button"
          className="btn-secondary"
          style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          onClick={() => setSelectedTxForDetails(row)}
        >
          <Eye size={12} />
          <span>Details</span>
        </button>
      ),
    },
  ];

  const accountOptions = accounts.map((acc) => ({
    value: acc.id,
    label: `${acc.accountNumber} (${acc.accountType} - ${formatCurrency(acc.balance)})`,
  }));

  const allDestOptions = accounts.map((acc) => ({
    value: acc.id,
    label: `${acc.accountNumber} - ${acc.holderName} (${acc.accountType})`,
  }));

  return (
    <DashboardLayout
      title="Transaction Management"
      breadcrumbs="LedgerLine / Transactions"
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

          {/* Action Buttons: strictly hidden for AUDITOR */}
          {role !== 'AUDITOR' && (
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
                onChange={(e) => setTypeFilter(e.target.value)}
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
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="REFUSED">Refused</option>
              </select>
            </div>

            {(typeFilter !== 'ALL' || statusFilter !== 'ALL') && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={() => {
                  setTypeFilter('ALL');
                  setStatusFilter('ALL');
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
            data={filteredTransactions}
            title="Transaction Journal"
            subtitle={`${filteredTransactions.length} transaction entries on record`}
            searchPlaceholder="Search by ref or description..."
            searchField="reference"
            emptyMessage="No transactions matched the selected filters."
          />
        )}

        {/* DEPOSIT MODAL */}
        <ConfirmModal
          isOpen={activeModal === 'deposit'}
          title="Deposit Funds"
          confirmText="Execute Deposit"
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
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                  {formError}
                </div>
              )}
              <FormInput
                label="Target Credit Account"
                type="select"
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                options={accountOptions}
                required
              />
              <FormInput
                label="Deposit Amount"
                type="number"
                step="0.01"
                min="1"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                prefix="₹"
                required
              />
              <FormInput
                label="Transaction Description / Reference Note"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Inward institutional deposit"
              />
            </div>
          )}
        </ConfirmModal>

        {/* WITHDRAW MODAL */}
        <ConfirmModal
          isOpen={activeModal === 'withdraw'}
          title="Withdraw Funds"
          confirmText="Confirm Withdrawal"
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
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                  {formError}
                </div>
              )}
              <FormInput
                label="Source Debit Account"
                type="select"
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                options={accountOptions}
                required
              />
              <FormInput
                label="Withdrawal Amount"
                type="number"
                step="0.01"
                min="1"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                prefix="₹"
                required
              />
              <FormInput
                label="Disbursement Description"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Vendor operational payout"
              />
            </div>
          )}
        </ConfirmModal>

        {/* TRANSFER MODAL */}
        <ConfirmModal
          isOpen={activeModal === 'transfer'}
          title="Inter-Account Transfer"
          confirmText="Execute Transfer"
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
              {formError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                  {formError}
                </div>
              )}
              <FormInput
                label="Source (Debit) Account"
                type="select"
                value={formAccountId}
                onChange={(e) => setFormAccountId(e.target.value)}
                options={accountOptions}
                required
              />
              <FormInput
                label="Destination (Credit) Account"
                type="select"
                value={formDestAccountId}
                onChange={(e) => setFormDestAccountId(e.target.value)}
                options={allDestOptions}
                required
              />
              <FormInput
                label="Transfer Amount"
                type="number"
                step="0.01"
                min="1"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
                placeholder="0.00"
                prefix="₹"
                required
              />
              <FormInput
                label="Transfer Purpose / Ledger Note"
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="e.g. Liquidity balancing"
              />
            </div>
          )}
        </ConfirmModal>

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
                    <StatusBadge status={selectedTxForDetails.type} />
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Transacted Amount</div>
                  <div className="tx-detail-value tabular-nums" style={{ color: selectedTxForDetails.type === 'DEPOSIT' ? 'var(--success-color)' : 'var(--text-color)' }}>
                    {formatCurrency(selectedTxForDetails.amount)}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Posting Status</div>
                  <div className="tx-detail-value">
                    <StatusBadge status={selectedTxForDetails.status} />
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
            </div>
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Transactions;
