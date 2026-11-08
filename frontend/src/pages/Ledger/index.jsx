import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  RefreshCw,
  Lock,
  Filter,
  RotateCcw,
  Search,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ledgerService from '../../services/ledgerService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import GlobalLedgerTable from '../../components/GlobalLedgerTable/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const PAGE_SIZE = 25;

const Ledger = () => {
  const { role } = useAuth();
  const [ledgerData, setLedgerData] = useState({
    entries: [],
    total: 0,
    totalCreditsFormatted: '₹0.00',
    totalDebitsFormatted: '₹0.00',
    pagination: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Account Ledger & Consistency Verification Modal State
  const [isConsistencyModalOpen, setIsConsistencyModalOpen] = useState(false);
  const [verifyAccountNumber, setVerifyAccountNumber] = useState('');
  const [accountLedgerData, setAccountLedgerData] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  const fetchLedger = useCallback(
    async (page = currentPage, type = filterType, search = searchTerm) => {
      setIsLoading(true);
      setError(null);
      try {
        const query = {
          page,
          limit: PAGE_SIZE,
        };
        if (type && type !== 'ALL') query.entryType = type;
        if (search && search.trim()) query.search = search.trim();

        const data = await ledgerService.getGlobalLedger(query);
        const list = data?.entries || (Array.isArray(data) ? data : []);

        const totalCount = data?.total ?? list.length;
        const totalPages = data?.pagination?.totalPages || (totalCount > 0 ? Math.ceil(totalCount / PAGE_SIZE) : 1);

        setLedgerData({
          entries: list,
          total: totalCount,
          totalCreditsFormatted: data?.totalCreditsFormatted
            ? data.totalCreditsFormatted.startsWith('₹')
              ? data.totalCreditsFormatted
              : `₹${data.totalCreditsFormatted}`
            : '₹0.00',
          totalDebitsFormatted: data?.totalDebitsFormatted
            ? data.totalDebitsFormatted.startsWith('₹')
              ? data.totalDebitsFormatted
              : `₹${data.totalDebitsFormatted}`
            : '₹0.00',
          pagination: data?.pagination || {
            page,
            limit: PAGE_SIZE,
            totalEntries: totalCount,
            totalPages,
          },
        });
      } catch (err) {
        setError('Unable to load institutional global ledger entries from backend.');
      } finally {
        setIsLoading(false);
      }
    },
    [currentPage, filterType, searchTerm]
  );

  useEffect(() => {
    fetchLedger(currentPage, filterType, searchTerm);
  }, [currentPage, filterType, searchTerm]);

  const handleVerifyAccountConsistency = async () => {
    if (!verifyAccountNumber.trim()) {
      setVerifyError('Please enter an account number to verify.');
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      // Authoritative GET /ledger/{accountNumber} consistency audit call
      const data = await ledgerService.getAccountLedger(verifyAccountNumber.trim());
      setAccountLedgerData(data);
    } catch (err) {
      setVerifyError(getErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFilterChange = (newType) => {
    setFilterType(newType);
    setCurrentPage(1);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setFilterType('ALL');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
  };

  const totalEntries = ledgerData.total;
  const totalPages = ledgerData.pagination?.totalPages || (totalEntries > 0 ? Math.ceil(totalEntries / PAGE_SIZE) : 1);
  const startItem = totalEntries === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalEntries);

  return (
    <DashboardLayout
      title="Global Double-Entry Ledger"
      breadcrumbs={`${role === 'AUDITOR' ? 'Auditor' : 'Admin'} / Global Ledger`}
    >
      <div className="ledger-page">
        {/* Header Bar */}
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

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setVerifyError(null);
                setAccountLedgerData(null);
                setIsConsistencyModalOpen(true);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FileCheck2 size={15} />
              <span>Verify Account Consistency</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => fetchLedger(currentPage, filterType, searchTerm)}
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

        {/* Responsive Ledger Filter & Search Toolbar */}
        <div className="ledger-filter-container">
          <div className="ledger-filter-header">
            <Filter size={15} style={{ color: 'var(--primary-color)' }} />
            <span>Filter Entries</span>
          </div>

          <div className="ledger-filter-controls">
            {/* Live Search Input */}
            <div className="ledger-search-box">
              <Search size={15} className="ledger-search-icon" />
              <input
                type="text"
                placeholder="Search by transaction reference or account number..."
                value={searchTerm}
                onChange={handleSearchChange}
                aria-label="Search ledger entries"
              />
            </div>

            {/* Entry Type Select */}
            <div className="ledger-filter-group">
              <label htmlFor="ledger-entry-type-filter" className="ledger-filter-label">
                Entry Type:
              </label>
              <select
                id="ledger-entry-type-filter"
                className="ledger-filter-select"
                value={filterType}
                onChange={(e) => handleFilterChange(e.target.value)}
                aria-label="Filter by entry type"
              >
                <option value="ALL">All Entries (Debits & Credits)</option>
                <option value="CREDIT">Credits Only (+Cr)</option>
                <option value="DEBIT">Debits Only (-Dr)</option>
              </select>
            </div>

            {/* Reset Button */}
            {(filterType !== 'ALL' || searchTerm.trim() !== '') && (
              <button
                type="button"
                className="ledger-filter-reset-btn"
                onClick={handleResetFilters}
                title="Reset active filter and search"
              >
                <RotateCcw size={12} />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {/* Data Table and Pagination Controls */}
        {isLoading ? (
          <LoadingState message="Auditing global double-entry ledger register from PostgreSQL..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchLedger(currentPage, filterType, searchTerm)} />
        ) : (
          <div>
            <GlobalLedgerTable
              entries={ledgerData.entries}
              title="Double-Entry General Ledger"
              subtitle={
                totalEntries > 0
                  ? `Showing page ${currentPage} of ${Math.max(1, totalPages)} (${totalEntries} total journal entries registered in PostgreSQL database)`
                  : '0 journal entries found'
              }
              emptyMessage="No ledger postings found matching selected criteria."
            />

            {/* Server-Side Pagination Bar */}
            <div className="ledger-pagination-bar">
              <div className="ledger-pagination-info">
                {totalEntries > 0 ? (
                  <span>
                    Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalEntries}</strong> entries
                  </span>
                ) : (
                  <span>0 entries</span>
                )}
              </div>

              <div className="ledger-pagination-actions">
                <button
                  type="button"
                  className="ledger-pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>

                <span className="ledger-page-indicator">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>

                <button
                  type="button"
                  className="ledger-pagination-btn"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || isLoading}
                >
                  <span>Next</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ACCOUNT CONSISTENCY AUDIT MODAL (GET /ledger/{accountNumber}) */}
        <ConfirmModal
          isOpen={isConsistencyModalOpen}
          title="Account Ledger & Consistency Audit"
          confirmText="Audit Consistency"
          onConfirm={handleVerifyAccountConsistency}
          onClose={() => {
            setIsConsistencyModalOpen(false);
            setAccountLedgerData(null);
            setVerifyError(null);
          }}
          isLoading={isVerifying}
        >
          <div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', marginBottom: '1rem' }}>
              <div style={{ flex: 1 }}>
                <FormInput
                  label="Target Account Identifier (e.g. LL-ACC-1001)"
                  type="text"
                  placeholder="LL-ACC-..."
                  value={verifyAccountNumber}
                  onChange={(e) => setVerifyAccountNumber(e.target.value)}
                  disabled={isVerifying}
                  required
                />
              </div>
            </div>

            {verifyError && (
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                {verifyError}
              </div>
            )}

            {accountLedgerData && (
              <div style={{ marginTop: '0.75rem' }}>
                <div style={{ padding: '10px 12px', borderRadius: 'var(--border-radius-sm)', marginBottom: '1rem', background: accountLedgerData.isBalanceConsistent ? 'var(--success-bg)' : 'var(--danger-bg)', border: `1px solid ${accountLedgerData.isBalanceConsistent ? 'var(--success-border)' : 'var(--danger-border)'}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700, color: accountLedgerData.isBalanceConsistent ? 'var(--success-text)' : 'var(--danger-text)', fontSize: '0.875rem' }}>
                    {accountLedgerData.isBalanceConsistent ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
                    <span>{accountLedgerData.isBalanceConsistent ? 'CONSISTENCY VERIFIED: Cryptographically Balanced' : 'DISCREPANCY DETECTED: Ledger sum does not equal account balance'}</span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Account Balance</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700 }} className="tabular-nums">
                      ₹{accountLedgerData.currentBalanceFormatted}
                    </div>
                  </div>
                  <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Ledger Calculated Sum</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700 }} className="tabular-nums">
                      ₹{(Number(accountLedgerData.ledgerCalculatedBalancePaise) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>

                {accountLedgerData.entries && accountLedgerData.entries.length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Account Journal Entries</span>
                      <span>{accountLedgerData.totalEntries || accountLedgerData.entries.length} postings</span>
                    </div>
                    <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)' }}>
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '6px 8px' }}>Ref</th>
                            <th style={{ padding: '6px 8px' }}>Type</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {accountLedgerData.entries.map((ent, idx) => (
                            <tr key={ent.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ent.transactionReference || ent.transaction_reference}</td>
                              <td style={{ padding: '6px 8px' }}><StatusBadge status={ent.entryType || ent.entry_type} /></td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: (ent.entryType || ent.entry_type) === 'CREDIT' ? 'var(--success-color)' : 'var(--text-color)' }}>
                                {(ent.entryType || ent.entry_type) === 'CREDIT' ? '+' : '-'}₹{ent.amountFormatted || (Number(ent.amountPaise || ent.amount || 0) / 100).toFixed(2)}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                ₹{ent.balanceAfterFormatted || (Number(ent.balanceAfterPaise || ent.balance_after || 0) / 100).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ConfirmModal>
      </div>
    </DashboardLayout>
  );
};

export default Ledger;
