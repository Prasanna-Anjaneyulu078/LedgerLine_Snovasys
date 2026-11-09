import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ShieldAlert, RefreshCw, Search, Eye, User, CreditCard, Activity, AlertCircle } from 'lucide-react';
import adminService from '../../services/adminService.js';
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
import Pagination from '../../components/Pagination/index.jsx';
import { getStoredPageSize, setStoredPageSize, PAGE_SIZE_OPTIONS } from '../../utils/pagination.js';
import './index.css';

const AccountManagement = () => {
  const [accounts, setAccounts] = useState([]);
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: getStoredPageSize(),
    totalAccounts: 0,
    totalPages: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status Change Modal
  const [selectedAccountForStatus, setSelectedAccountForStatus] = useState(null);
  const [targetStatus, setTargetStatus] = useState('ACTIVE');
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalError, setModalError] = useState(null);

  // Account Inspector Modal
  const [selectedAccountForInspect, setSelectedAccountForInspect] = useState(null);
  const [inspectedAccountDetails, setInspectedAccountDetails] = useState(null);
  const [inspectedStatement, setInspectedStatement] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectError, setInspectError] = useState(null);

  const fetchAccounts = useCallback(async (
    page = currentPage,
    currentLimit = pageSize,
    search = searchTerm,
    status = statusFilter,
    type = typeFilter
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page,
        limit: currentLimit,
      };
      if (search && search.trim()) query.search = search.trim();
      if (status) query.status = status;
      if (type) query.accountType = type;

      const data = await adminService.getAccounts(query);
      const list = data?.accounts || (Array.isArray(data) ? data : []);
      setAccounts(list);

      const total = Number(data?.pagination?.totalAccounts ?? data?.total ?? list.length);
      const pages = Number(data?.pagination?.totalPages ?? (total > 0 ? Math.ceil(total / currentLimit) : 0));

      setPagination({
        page,
        limit: currentLimit,
        totalAccounts: total,
        totalPages: pages,
      });

      if (pages > 0 && page > pages) {
        setCurrentPage(pages);
      }
    } catch (err) {
      setError('Unable to fetch institutional accounts from backend database.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    fetchAccounts(currentPage, pageSize, searchTerm, statusFilter, typeFilter);
  }, [currentPage, pageSize, searchTerm, statusFilter, typeFilter]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleTypeFilterChange = (e) => {
    setTypeFilter(e.target.value);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || (pagination.totalPages > 0 && newPage > pagination.totalPages)) return;
    setCurrentPage(newPage);
  };

  const handlePageSizeChange = (newSize) => {
    setStoredPageSize(newSize);
    setPageSize(newSize);
    setCurrentPage(1);
  };

  const handleOpenStatusModal = (acc) => {
    setSelectedAccountForStatus(acc);
    setTargetStatus(acc.status);
    setModalError(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedAccountForStatus || !targetStatus) return;

    setIsUpdating(true);
    setModalError(null);
    try {
      await adminService.updateAccountStatus(selectedAccountForStatus.id, targetStatus);
      setSelectedAccountForStatus(null);
      await fetchAccounts(currentPage, pageSize, searchTerm, statusFilter, typeFilter);
    } catch (err) {
      setModalError(getErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const handleInspectAccount = async (acc) => {
    if (!acc) return;
    const identifier = acc.accountNumber || acc.id;
    setSelectedAccountForInspect(acc);
    setInspectedAccountDetails(acc);
    setInspectedStatement(null);
    setIsInspecting(true);
    setInspectError(null);

    try {
      const [fullAccount, stmt] = await Promise.all([
        accountService.getAccount(identifier).catch((err) => {
          console.warn('Extended account details fetch error, falling back to row data:', err);
          return acc;
        }),
        accountService.getAccountStatement(identifier, { limit: 10 }).catch((err) => {
          console.warn('Recent account statement fetch error:', err);
          return { entries: [] };
        }),
      ]);

      setInspectedAccountDetails(fullAccount || acc);
      setInspectedStatement(stmt || { entries: [] });
    } catch (err) {
      setInspectError(getErrorMessage(err));
    } finally {
      setIsInspecting(false);
    }
  };

  const handleCloseInspectModal = () => {
    setSelectedAccountForInspect(null);
    setInspectedAccountDetails(null);
    setInspectedStatement(null);
    setInspectError(null);
  };

  const columns = [
    {
      header: 'Account Number',
      accessor: 'accountNumber',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-color)' }}>
          {row.accountNumber}
        </span>
      ),
    },
    {
      header: 'Account Holder',
      accessor: 'holderName',
      render: (row) => <span>{row.holderName}</span>,
    },
    {
      header: 'Account Type',
      accessor: 'accountType',
      render: (row) => <StatusBadge status={row.accountType} />,
    },
    {
      header: 'Current Balance',
      accessor: 'balance',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-color)' }}>
          {formatCurrency(row.balance)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Created Date',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt, false)}
        </span>
      ),
    },
    {
      header: 'Action',
      align: 'center',
      render: (row) => (
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            onClick={() => handleInspectAccount(row)}
            title="Inspect complete account details"
            aria-label={`Inspect account ${row.accountNumber}`}
          >
            <Eye size={12} />
            <span>Inspect</span>
          </button>
          <button
            type="button"
            className="btn-secondary"
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
            onClick={() => handleOpenStatusModal(row)}
          >
            Change Status
          </button>
          <Link
            to={`/admin/statements/${row.accountNumber || row.id}`}
            className="btn-secondary"
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Statement
          </Link>
        </div>
      ),
    },
  ];

  const statusOptions = [
    { value: 'ACTIVE', label: 'ACTIVE — Unrestricted operational transactions' },
    { value: 'FROZEN', label: 'FROZEN — Regulatory hold, debits blocked' },
    { value: 'CLOSED', label: 'CLOSED — Terminated account ledger' },
  ];

  const totalAccounts = pagination.totalAccounts;
  const totalPages = pagination.totalPages;

  return (
    <DashboardLayout
      title="Account Management"
      breadcrumbs="Admin / Account Governance"
    >
      <div className="account-mgmt-page">
        <div className="account-mgmt-header-bar">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              Institutional Account Governance
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Inspect all depository balances, enforce regulatory holds, and manage account operational status.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchAccounts(currentPage, searchTerm, statusFilter, typeFilter)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh Accounts</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="account-mgmt-filter-bar">
          <div className="account-mgmt-search-container">
            <Search size={15} className="account-mgmt-search-icon" />
            <input
              type="text"
              className="account-mgmt-search-input"
              placeholder="Search by account number or holder..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>

          <div className="account-mgmt-filter-selects">
            <select
              value={statusFilter}
              onChange={handleStatusFilterChange}
              className="account-mgmt-select"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="FROZEN">Frozen (Held)</option>
              <option value="CLOSED">Closed</option>
            </select>

            <select
              value={typeFilter}
              onChange={handleTypeFilterChange}
              className="account-mgmt-select"
              aria-label="Filter by account type"
            >
              <option value="">All Types</option>
              <option value="SAVINGS">Savings</option>
              <option value="CHECKING">Checking</option>
              <option value="OPERATIONAL">Operational</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Retrieving institutional accounts from PostgreSQL..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchAccounts(currentPage, pageSize, statusFilter, typeFilter)} />
        ) : (
          <DataTable
            columns={columns}
            data={accounts}
            title="Institutional Account Portfolio"
            subtitle={
              totalAccounts > 0
                ? `Showing page ${currentPage} of ${Math.max(1, totalPages)} (${totalAccounts} total registered accounts in PostgreSQL database)`
                : '0 accounts found'
            }
            pagination={
              <Pagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalRecords={totalAccounts}
                totalPages={totalPages}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                disabled={isLoading}
              />
            }
            emptyMessage="No institutional accounts found matching criteria."
          />
        )}

        {/* STATUS CHANGE CONFIRMATION MODAL */}
        <ConfirmModal
          isOpen={!!selectedAccountForStatus}
          title={`Update Account Status: ${selectedAccountForStatus?.accountNumber}`}
          confirmText="Apply Status Change"
          isDestructive={targetStatus === 'FROZEN' || targetStatus === 'CLOSED'}
          onConfirm={handleConfirmStatusChange}
          onClose={() => setSelectedAccountForStatus(null)}
          isLoading={isUpdating}
        >
          <div>
            {modalError && (
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                {modalError}
              </div>
            )}
            <p style={{ marginBottom: '12px' }}>
              Modify operational status for account{' '}
              <strong>{selectedAccountForStatus?.accountNumber}</strong> (
              {selectedAccountForStatus?.holderName}):
            </p>

            <FormInput
              label="Select New Status"
              type="select"
              value={targetStatus}
              onChange={(e) => setTargetStatus(e.target.value)}
              options={statusOptions}
            />

            {targetStatus === 'FROZEN' && (
              <div style={{ padding: '10px 12px', backgroundColor: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '4px', fontSize: '0.8125rem', color: '#92400E', marginTop: '12px' }}>
                <ShieldAlert size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                When an account is FROZEN, any attempted withdrawal or transfer out is automatically refused by the ledger engine.
              </div>
            )}
          </div>
        </ConfirmModal>

        {/* ACCOUNT INSPECTOR MODAL */}
        {selectedAccountForInspect && (
          <ConfirmModal
            isOpen={!!selectedAccountForInspect}
            title={`Account Inspector: ${selectedAccountForInspect?.accountNumber || selectedAccountForInspect?.id}`}
            confirmText="Close Inspector"
            hideCancel={true}
            maxWidth="760px"
            onConfirm={handleCloseInspectModal}
            onClose={handleCloseInspectModal}
          >
            {isInspecting && !inspectedAccountDetails ? (
              <LoadingState message="Retrieving institutional account record from PostgreSQL database..." />
            ) : (
              <div className="account-inspector-modal">
                {inspectError && (
                  <div className="account-inspect-error-banner">
                    <AlertCircle size={16} />
                    <span>{inspectError}</span>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '24px', padding: '0 8px', fontSize: '0.7rem', marginLeft: 'auto' }}
                      onClick={() => handleInspectAccount(selectedAccountForInspect)}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* Section A: Account Overview */}
                <div className="account-inspect-section">
                  <h4 className="account-inspect-section-title">
                    <CreditCard size={14} />
                    <span>Account Overview</span>
                  </h4>
                  <div className="account-inspect-grid">
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Account Number</div>
                      <div className="account-inspect-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                        {inspectedAccountDetails?.accountNumber || inspectedAccountDetails?.account_number || selectedAccountForInspect?.accountNumber}
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Current / Available Balance</div>
                      <div className="account-inspect-value tabular-nums" style={{ color: 'var(--primary-color)', fontSize: '1rem' }}>
                        {formatCurrency(inspectedAccountDetails?.balance ?? selectedAccountForInspect?.balance)}
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Account Type</div>
                      <div className="account-inspect-value">
                        <StatusBadge status={inspectedAccountDetails?.accountType || inspectedAccountDetails?.account_type || selectedAccountForInspect?.accountType} />
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Operational Status</div>
                      <div className="account-inspect-value">
                        <StatusBadge status={inspectedAccountDetails?.status || selectedAccountForInspect?.status} />
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Currency</div>
                      <div className="account-inspect-value">
                        {inspectedAccountDetails?.currency || selectedAccountForInspect?.currency || 'INR'} (Indian Rupee)
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Provisioned Date</div>
                      <div className="account-inspect-value" style={{ fontSize: '0.8125rem' }}>
                        {formatDate(inspectedAccountDetails?.createdAt || selectedAccountForInspect?.createdAt)}
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Last Updated Date</div>
                      <div className="account-inspect-value" style={{ fontSize: '0.8125rem' }}>
                        {formatDate(inspectedAccountDetails?.updatedAt || inspectedAccountDetails?.updated_at || inspectedAccountDetails?.createdAt || selectedAccountForInspect?.createdAt)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section B: Account Holder Information */}
                <div className="account-inspect-section">
                  <h4 className="account-inspect-section-title">
                    <User size={14} />
                    <span>Account Holder Information</span>
                  </h4>
                  <div className="account-inspect-grid">
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Account Holder Name</div>
                      <div className="account-inspect-value" style={{ fontWeight: 600 }}>
                        {inspectedAccountDetails?.holderName || inspectedAccountDetails?.owner_name || selectedAccountForInspect?.holderName || '—'}
                      </div>
                    </div>
                    <div className="account-inspect-box">
                      <div className="account-inspect-label">Email Address</div>
                      <div className="account-inspect-value">
                        {inspectedAccountDetails?.ownerEmail || inspectedAccountDetails?.owner_email || '—'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section C: Recent Account Activity */}
                <div className="account-inspect-section">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <h4 className="account-inspect-section-title" style={{ marginBottom: 0 }}>
                      <Activity size={14} />
                      <span>Recent Account Activity</span>
                    </h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {inspectedStatement?.entries?.length || 0} recent postings
                    </span>
                  </div>

                  {inspectedStatement?.entries && inspectedStatement.entries.length > 0 ? (
                    <div className="account-inspect-table-wrapper">
                      <table className="account-inspect-table">
                        <thead>
                          <tr>
                            <th>Transaction Ref</th>
                            <th>Type</th>
                            <th style={{ textAlign: 'right' }}>Debit</th>
                            <th style={{ textAlign: 'right' }}>Credit</th>
                            <th style={{ textAlign: 'center' }}>Status</th>
                            <th style={{ textAlign: 'right' }}>Timestamp</th>
                          </tr>
                        </thead>
                        <tbody>
                          {inspectedStatement.entries.map((entry, idx) => {
                            const isDebit = (entry.entryType || entry.entry_type) === 'DEBIT';
                            const isCredit = (entry.entryType || entry.entry_type) === 'CREDIT';
                            const formattedAmt = entry.amountFormatted
                              ? `₹${entry.amountFormatted}`
                              : formatCurrency(Number(entry.amountPaise || entry.amount || 0) / 100);

                            return (
                              <tr key={entry.id || idx}>
                                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                  {entry.transactionReference || entry.transaction_reference || '—'}
                                </td>
                                <td>
                                  <StatusBadge status={entry.transactionType || entry.transaction_type || entry.entryType} />
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: isDebit ? 'var(--danger-color, #DC2626)' : 'var(--text-secondary)' }}>
                                  {isDebit ? formattedAmt : '—'}
                                </td>
                                <td style={{ textAlign: 'right', fontWeight: 600, color: isCredit ? 'var(--success-color, #16A34A)' : 'var(--text-secondary)' }}>
                                  {isCredit ? formattedAmt : '—'}
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                  <StatusBadge status={entry.transactionStatus || entry.transaction_status || 'COMMITTED'} />
                                </td>
                                <td style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                  {formatDate(entry.createdAt || entry.created_at)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="account-inspect-empty">
                      No recent ledger postings found for this account.
                    </div>
                  )}
                </div>

                {/* Read-Only Notice */}
                <div className="account-inspect-readonly-notice">
                  <ShieldAlert size={14} />
                  <span>Read-Only Administrative Inspection. No financial operations or balance mutations permitted from this view.</span>
                </div>
              </div>
            )}
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AccountManagement;
