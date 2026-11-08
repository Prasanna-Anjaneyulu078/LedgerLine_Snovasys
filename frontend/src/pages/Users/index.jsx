import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, RefreshCw, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import adminService from '../../services/adminService.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const PAGE_SIZE = 4;

const Users = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalUsers: 0,
    totalPages: 0,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status Change Modal
  const [selectedUserForStatus, setSelectedUserForStatus] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchUsers = useCallback(async (page = currentPage, search = searchTerm, role = roleFilter, status = statusFilter) => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page,
        limit: PAGE_SIZE,
      };
      if (search && search.trim()) query.search = search.trim();
      if (role) query.role = role;
      if (status) query.status = status;

      const data = await adminService.getUsers(query);
      setUsers(data?.users || data || []);
      if (data?.pagination) {
        setPagination(data.pagination);
      } else {
        const total = data?.total ?? (data?.length || 0);
        setPagination({
          page,
          limit: PAGE_SIZE,
          totalUsers: total,
          totalPages: total > 0 ? Math.ceil(total / PAGE_SIZE) : 0,
        });
      }
    } catch (err) {
      setError('Unable to fetch administrative user accounts.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, searchTerm, roleFilter, statusFilter]);

  // Initial load and filter effect
  useEffect(() => {
    fetchUsers(currentPage, searchTerm, roleFilter, statusFilter);
  }, [currentPage, searchTerm, roleFilter, statusFilter]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchTerm(val);
    setCurrentPage(1);
  };

  const handleRoleChange = (e) => {
    setRoleFilter(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setCurrentPage(1);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || (pagination.totalPages > 0 && newPage > pagination.totalPages)) return;
    setCurrentPage(newPage);
  };

  const handleOpenStatusModal = (userItem, newStatus) => {
    setSelectedUserForStatus(userItem);
    setTargetStatus(newStatus);
    setModalError(null);
  };

  const handleConfirmStatusChange = async () => {
    if (!selectedUserForStatus || !targetStatus) return;

    setIsUpdating(true);
    setModalError(null);
    try {
      await adminService.updateUserStatus(selectedUserForStatus.id, targetStatus);
      setSelectedUserForStatus(null);
      await fetchUsers(currentPage, searchTerm, roleFilter, statusFilter);
    } catch (err) {
      setModalError(getErrorMessage(err));
    } finally {
      setIsUpdating(false);
    }
  };

  const columns = [
    {
      header: 'Full Legal Name',
      accessor: 'name',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.name}
        </span>
      ),
    },
    {
      header: 'Email Address',
      accessor: 'email',
      render: (row) => <span>{row.email}</span>,
    },
    {
      header: 'Institutional Role',
      accessor: 'role',
      render: (row) => <StatusBadge status={row.role} />,
    },
    {
      header: 'Account Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Registration Date',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt, false)}
        </span>
      ),
    },
    {
      header: 'Actions',
      align: 'center',
      render: (row) => {
        const isSelf = row.id === currentAdmin?.id;
        if (isSelf) {
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              Current Session
            </span>
          );
        }

        if (row.status === 'ACTIVE') {
          return (
            <button
              type="button"
              className="btn-secondary"
              style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', color: 'var(--danger-color)' }}
              onClick={() => handleOpenStatusModal(row, 'SUSPENDED')}
            >
              Suspend
            </button>
          );
        }

        return (
          <button
            type="button"
            className="btn-secondary"
            style={{ height: '30px', padding: '0 8px', fontSize: '0.75rem', color: 'var(--success-color)' }}
            onClick={() => handleOpenStatusModal(row, 'ACTIVE')}
          >
            Activate
          </button>
        );
      },
    },
  ];

  const totalUsers = Number(pagination?.totalUsers ?? 0);
  const totalPages = Number(pagination?.totalPages ?? 0);
  const startItem = totalUsers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalUsers);

  return (
    <DashboardLayout
      title="User Management"
      breadcrumbs="Admin / User Governance"
    >
      <div className="users-page">
        <div className="users-header-bar">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              User Identity & Access Management
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Authorize institutional accounts, govern active permissions, and enforce administrative suspensions.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => fetchUsers(currentPage, searchTerm, roleFilter, statusFilter)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh Users</span>
          </button>
        </div>

        {/* Filter and Search Bar */}
        <div className="users-filter-bar">
          <div className="users-search-container">
            <Search size={15} className="users-search-icon" />
            <input
              type="text"
              className="users-search-input"
              placeholder="Search by user name or email..."
              value={searchTerm}
              onChange={handleSearchChange}
            />
          </div>

          <div className="users-filter-selects">
            <select
              value={roleFilter}
              onChange={handleRoleChange}
              className="users-select"
              aria-label="Filter by role"
            >
              <option value="">All Roles</option>
              <option value="ACCOUNT_HOLDER">Account Holder</option>
              <option value="ADMIN">System Administrator</option>
              <option value="AUDITOR">Compliance Auditor</option>
            </select>

            <select
              value={statusFilter}
              onChange={handleStatusChange}
              className="users-select"
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Retrieving institutional user register..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => fetchUsers(currentPage, searchTerm, roleFilter, statusFilter)} />
        ) : (
          <div>
            <DataTable
              columns={columns}
              data={users}
              title="Registered Institutional Identities"
              subtitle={
                totalUsers > 0
                  ? `Showing page ${currentPage} of ${Math.max(1, totalPages)} (${totalUsers} total registered users in PostgreSQL database)`
                  : '0 users found'
              }
              emptyMessage="No registered database users found matching criteria."
            />

            {/* Pagination Controls */}
            <div className="users-pagination-bar">
              <div className="users-pagination-info">
                {totalUsers > 0 ? (
                  <span>
                    Showing <strong>{startItem}</strong> to <strong>{endItem}</strong> of <strong>{totalUsers}</strong> registered users
                  </span>
                ) : (
                  <span>0 users</span>
                )}
              </div>

              <div className="users-pagination-actions">
                <button
                  type="button"
                  className="users-pagination-btn"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1 || isLoading}
                >
                  <ChevronLeft size={16} />
                  <span>Previous</span>
                </button>
                <span className="users-page-indicator">
                  Page {currentPage} of {Math.max(1, totalPages)}
                </span>
                <button
                  type="button"
                  className="users-pagination-btn"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages || totalPages === 0 || isLoading}
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
          isOpen={!!selectedUserForStatus}
          title={`Update Status: ${selectedUserForStatus?.name}`}
          confirmText={`Confirm ${targetStatus}`}
          isDestructive={targetStatus === 'SUSPENDED'}
          onConfirm={handleConfirmStatusChange}
          onClose={() => setSelectedUserForStatus(null)}
          isLoading={isUpdating}
        >
          <div>
            {modalError && (
              <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                {modalError}
              </div>
            )}
            <p style={{ marginBottom: '12px' }}>
              Are you sure you want to change the status of <strong>{selectedUserForStatus?.name}</strong> ({selectedUserForStatus?.email}) to <strong>{targetStatus}</strong>?
            </p>
            {targetStatus === 'SUSPENDED' && (
              <div style={{ padding: '10px 12px', backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '4px', fontSize: '0.8125rem', color: '#991B1B' }}>
                <ShieldAlert size={16} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'text-bottom' }} />
                Suspended users are immediately denied access to authenticated endpoints and cannot initiate financial transactions.
              </div>
            )}
          </div>
        </ConfirmModal>
      </div>
    </DashboardLayout>
  );
};

export default Users;
