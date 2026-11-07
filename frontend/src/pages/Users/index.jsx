import React, { useState, useEffect } from 'react';
import { Users as UsersIcon, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';
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

const Users = () => {
  const { user: currentAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status Change Modal
  const [selectedUserForStatus, setSelectedUserForStatus] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminService.getUsers();
      setUsers(data || []);
    } catch (err) {
      setError('Unable to fetch administrative user accounts.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

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
      await fetchUsers();
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
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Member Since',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt, false)}
        </span>
      ),
    },
    {
      header: 'Action',
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
            onClick={fetchUsers}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh Users</span>
          </button>
        </div>

        {isLoading ? (
          <LoadingState message="Retrieving institutional user register..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchUsers} />
        ) : (
          <DataTable
            columns={columns}
            data={users}
            title="Registered Institutional Identities"
            subtitle={`${users.length} total users enrolled in LedgerLine`}
            searchPlaceholder="Search by name or email..."
            searchField="email"
          />
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
