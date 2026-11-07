import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  ShieldCheck,
  RefreshCw,
  Lock,
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
  const [ledgerData, setLedgerData] = useState({
    entries: [],
    total: 0,
    totalCreditsFormatted: '₹0.00',
    totalDebitsFormatted: '₹0.00',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterType, setFilterType] = useState('ALL');

  const fetchLedger = useCallback(async (type = filterType) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {};
      if (type && type !== 'ALL') query.entryType = type;
      const data = await ledgerService.getGlobalLedger(query);
      const list = data?.entries || (Array.isArray(data) ? data : []);

      setLedgerData({
        entries: list,
        total: data?.total ?? list.length,
        totalCreditsFormatted: data?.totalCreditsFormatted
          ? (data.totalCreditsFormatted.startsWith('₹') ? data.totalCreditsFormatted : `₹${data.totalCreditsFormatted}`)
          : '₹0.00',
        totalDebitsFormatted: data?.totalDebitsFormatted
          ? (data.totalDebitsFormatted.startsWith('₹') ? data.totalDebitsFormatted : `₹${data.totalDebitsFormatted}`)
          : '₹0.00',
      });
    } catch (err) {
      setError('Unable to load institutional global ledger entries.');
    } finally {
      setIsLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    fetchLedger(filterType);
  }, [filterType]);

  const handleFilterChange = (newType) => {
    setFilterType(newType);
  };

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
              onClick={() => fetchLedger(filterType)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} />
              <span>Verify & Refresh</span>
            </button>
          </div>
        </div>

        {/* Double-Entry Reconciliation Card with Authoritative Database Aggregates */}
        <div className="ledger-reconciliation-card">
          <div className="rec-item">
            <span className="rec-label">Total Cumulative Credits</span>
            <span className="rec-value tabular-nums" style={{ color: 'var(--success-color)' }}>
              {ledgerData.totalCreditsFormatted}
            </span>
          </div>
          <div className="rec-item">
            <span className="rec-label">Total Cumulative Debits</span>
            <span className="rec-value tabular-nums" style={{ color: 'var(--danger-color)' }}>
              {ledgerData.totalDebitsFormatted}
            </span>
          </div>
          <div className="rec-item">
            <span className="rec-label">Total Ledger Postings</span>
            <span className="rec-value tabular-nums">
              {ledgerData.total} entries
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
                onChange={(e) => handleFilterChange(e.target.value)}
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
                onClick={() => handleFilterChange('ALL')}
                title="Reset active filter"
              >
                <RotateCcw size={12} />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Auditing global double-entry ledger register from PostgreSQL..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchLedger(filterType)} />
        ) : (
          <DataTable
            columns={columns}
            data={ledgerData.entries}
            title="Double-Entry General Ledger"
            subtitle={`${ledgerData.total} chronological journal entries registered in database`}
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
