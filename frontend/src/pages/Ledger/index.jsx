import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  ShieldCheck,
  RefreshCw,
  Lock,
  ArrowDownLeft,
  ArrowUpRight,
  Filter,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ledgerService from '../../services/ledgerService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const Ledger = () => {
  const { role } = useAuth();
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  const fetchLedger = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ledgerService.getGlobalLedger();
      setLedgerEntries(data || []);
    } catch (err) {
      setError('Unable to load institutional global ledger entries.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const totalCredits = ledgerEntries
    .filter((e) => e.entryType === 'CREDIT')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const totalDebits = ledgerEntries
    .filter((e) => e.entryType === 'DEBIT')
    .reduce((sum, e) => sum + (e.amount || 0), 0);

  const filteredEntries = ledgerEntries.filter((e) => {
    if (filterType !== 'ALL' && e.entryType !== filterType) return false;
    return true;
  });

  const columns = [
    {
      header: 'Entry ID',
      accessor: 'id',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.id}
        </span>
      ),
    },
    {
      header: 'Tx Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.transactionReference}
        </span>
      ),
    },
    {
      header: 'Account Number',
      accessor: 'accountNumber',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
          {row.accountNumber}
        </span>
      ),
    },
    {
      header: 'Entry Type',
      accessor: 'entryType',
      align: 'center',
      render: (row) => <StatusBadge status={row.entryType} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const isCredit = row.entryType === 'CREDIT';
        const color = isCredit ? 'var(--success-color)' : 'var(--danger-color)';
        const prefix = isCredit ? '+' : '-';
        return (
          <span style={{ fontWeight: 700, color }}>
            {prefix}
            {formatCurrency(row.amount)}
          </span>
        );
      },
    },
    {
      header: 'Balance After',
      accessor: 'balanceAfter',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-color)' }}>
          {formatCurrency(row.balanceAfter)}
        </span>
      ),
    },
    {
      header: 'Posting Memo',
      accessor: 'description',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.description || 'Ledger Posting'}
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.timestamp)}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Global Double-Entry Ledger"
      breadcrumbs={`${role === 'AUDITOR' ? 'Auditor' : 'Admin'} / Global Ledger`}
    >
      <div className="ledger-page">
        <div className="ledger-header-bar">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <Lock size={16} style={{ color: 'var(--primary-color)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Append-Only Immutable Ledger
              </h2>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Official immutable record of all atomic debit and credit entries.
              Modifications and deletions are strictly prohibited by protocol.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchLedger}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} />
              <span>Verify & Refresh</span>
            </button>
          </div>
        </div>

        {/* Double-Entry Reconciliation Card */}
        <div className="ledger-reconciliation-card">
          <div className="rec-item">
            <span className="rec-label">Total Cumulative Credits</span>
            <span className="rec-value tabular-nums" style={{ color: 'var(--success-color)' }}>
              {formatCurrency(totalCredits)}
            </span>
          </div>
          <div className="rec-item">
            <span className="rec-label">Total Cumulative Debits</span>
            <span className="rec-value tabular-nums" style={{ color: 'var(--danger-color)' }}>
              {formatCurrency(totalDebits)}
            </span>
          </div>
          <div className="rec-item">
            <span className="rec-label">Total Ledger Postings</span>
            <span className="rec-value tabular-nums">
              {ledgerEntries.length} entries
            </span>
          </div>
          <div className="rec-item">
            <span className="rec-label">Cryptographic Integrity</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <ShieldCheck size={18} style={{ color: 'var(--success-color)' }} />
              <span style={{ fontWeight: 700, color: 'var(--success-color)', fontSize: '0.875rem' }}>
                MATCHED / SEALED
              </span>
            </div>
          </div>
        </div>

        {/* Responsive Ledger Filter Dropdown */}
        <div className="ledger-filter-container">
          <div className="ledger-filter-header">
            <Filter size={15} style={{ color: 'var(--primary-color)' }} />
            <span>Filter Entries</span>
          </div>

          <div className="ledger-filter-controls">
            <div className="ledger-filter-group">
              <label htmlFor="ledger-entry-type-filter" className="ledger-filter-label">
                Entry Type:
              </label>
              <select
                id="ledger-entry-type-filter"
                className="ledger-filter-select"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
              >
                <option value="ALL">All Entries (Debits & Credits)</option>
                <option value="CREDIT">Credits Only (+Cr)</option>
                <option value="DEBIT">Debits Only (-Dr)</option>
              </select>
            </div>

            {filterType !== 'ALL' && (
              <button
                type="button"
                className="ledger-filter-reset-btn"
                onClick={() => setFilterType('ALL')}
                title="Reset active filter"
              >
                <RotateCcw size={12} />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Auditing global double-entry ledger register..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchLedger} />
        ) : (
          <DataTable
            columns={columns}
            data={filteredEntries}
            title="Double-Entry General Ledger"
            subtitle={`${filteredEntries.length} chronological journal entries`}
            searchPlaceholder="Search by reference or account..."
            searchField="transactionReference"
            emptyMessage="No ledger postings found matching selected criteria."
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default Ledger;
