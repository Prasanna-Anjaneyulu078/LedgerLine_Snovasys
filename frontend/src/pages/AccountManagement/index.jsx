import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ShieldAlert, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import adminService from '../../services/adminService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const PAGE_SIZE = 6;

const AccountManagement = () => {
  const [accounts, setAccounts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
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

  const fetchAccounts = useCallback(async (
    page = currentPage,
    search = searchTerm,
    status = statusFilter,
    type = typeFilter
  ) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page,
        limit: PAGE_SIZE,
      };
      if (search && search.trim()) query.search = search.trim();
      if (status) query.status = status;
      if (type) query.accountType = type;

      const data = await adminService.getAccounts(query);
      const list = data?.accounts || (Array.isArray(data) ? data : []);
      setAccounts(list);

      if (data?.pagination) {
        setPagination(data.pagination);
      } else {
        const total = data?.total ?? list.length;
        setPagination({
          page,
          limit: PAGE_SIZE,
          totalAccounts: total,
          totalPages: total > 0 ? Math.ceil(total / PAGE_SIZE) : 0,
        });
      }
    } catch (err) {
      setError('Unable to fetch institutional accounts from backend database.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm, statusFilter, typeFilter]);

  useEffect(() => {
    fetchAccounts(currentPage, searchTerm, statusFilter, typeFilter);
  }, [currentPage, searchTerm, statusFilter, typeFilter]);

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
      await fetchAccounts(currentPage, searchTerm, statusFilter, typeFilter);
    } catch (err) {
      setModalError(getErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
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
      header: 'Branch & IFSC',
      accessor: 'branchName',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.branchName} ({row.ifscCode})
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
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem' }}
            onClick={() => handleOpenStatusModal(row)}
          >
            Change Status
          </button>
          <Link
            to={`/admin/statements/${row.id}`}
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
  const startItem = totalAccounts === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalAccounts);

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
          <ErrorState message={error} onRetry={() => fetchAccounts(currentPage, searchTerm, statusFilter, typeFilter)} />
        ) : (
          <div>
            <DataTable
              columns={columns}
              data={accounts}
              title="Institutional Account Portfolio"
              subtitle={
                totalAccounts > 0
                  ? `Showing page ${currentPage} of ${Math.max(1, totalPages)} (${totalAccounts} total registered accounts in PostgreSQL database)`
                  : '0 accounts found'
              }
              emptyMessage="No institutional accounts found matching criteria."
            />

            {/* Pagination Controls */}
            <div className="account-mgmt-pagination-bar">
              <div className="account-mgmt-pagination-info">
                {totalAccounts > 0 ? (
                  <span>
                    Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalAccounts}</strong> accounts
                  </span>
                ) : (
                  <span>0 accounts</span>
                )}
              </div>

              <div className="account-mgmt-pagination-actions">
                <button
                  type="button"
                  className="account-mgmt-pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>

                <span className="account-mgmt-page-indicator">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>

                <button
                  type="button"
                  className="account-mgmt-pagination-btn"
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
      </div>
    </DashboardLayout>
  );
};

export default AccountManagement;
