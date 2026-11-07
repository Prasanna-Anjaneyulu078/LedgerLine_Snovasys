import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, ShieldAlert, RefreshCw, FileText } from 'lucide-react';
import adminService from '../../services/adminService.js';
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

const AccountManagement = () => {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Status Change Modal
  const [selectedAccountForStatus, setSelectedAccountForStatus] = useState(null);
  const [targetStatus, setTargetStatus] = useState('ACTIVE');
  const [isUpdating, setIsUpdating] = useState(false);
  const [modalError, setModalError] = useState(null);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminService.getAccounts();
      setAccounts(data || []);
    } catch (err) {
      setError('Unable to fetch institutional accounts from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

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
      await fetchAccounts();
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
            to={`/statements/${row.id}`}
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
            onClick={fetchAccounts}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh Accounts</span>
          </button>
        </div>

        {isLoading ? (
          <LoadingState message="Retrieving institutional accounts..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAccounts} />
        ) : (
          <DataTable
            columns={columns}
            data={accounts}
            title="Institutional Account Portfolio"
            subtitle={`${accounts.length} total active and held accounts`}
            searchPlaceholder="Search by number or holder..."
            searchField="accountNumber"
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
      </div>
    </DashboardLayout>
  );
};

export default AccountManagement;
