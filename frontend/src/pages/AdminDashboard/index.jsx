import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Wallet,
  ShieldAlert,
  CheckCircle2,
} from 'lucide-react';
import adminService from '../../services/adminService.js';
import ledgerService from '../../services/ledgerService.js';
import transactionService from '../../services/transactionService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatCard from '../../components/StatCard/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [u, a, t, aud] = await Promise.all([
        adminService.getUsers(),
        adminService.getAccounts(),
        transactionService.getTransactions(),
        ledgerService.getAuditEvents(),
      ]);
      setUsers(u || []);
      setAccounts(a || []);
      setTransactions(t || []);
      setAuditEvents(aud || []);
    } catch (err) {
      setError('Unable to load institutional administrative overview.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalVaultBalance = accounts.reduce(
    (sum, acc) => sum + (acc.balance || 0),
    0
  );

  const auditColumns = [
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.timestamp)}
        </span>
      ),
    },
    {
      header: 'Actor',
      accessor: 'actorEmail',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.actorEmail}
        </span>
      ),
    },
    {
      header: 'Role',
      accessor: 'actorRole',
      render: (row) => <StatusBadge status={row.actorRole} />,
    },
    {
      header: 'Action',
      accessor: 'action',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>
          {row.action}
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
      header: 'Details',
      accessor: 'details',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.details}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="System Administration"
      breadcrumbs="Admin / System Overview"
    >
      {isLoading ? (
        <LoadingState message="Compiling administrative ledger telemetry..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <div className="admin-dashboard-container">
          <div className="admin-header-banner">
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
                Operational & Regulatory Control Panel
              </h2>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                System-wide oversight for accounts, users, access roles, and immutable transaction ledgers.
              </p>
            </div>
          </div>

          {/* Metric Cards */}
          <div className="admin-stats-grid">
            <StatCard
              title="Total System Users"
              value={users.length.toString()}
              icon={Users}
              subtitle="Provisioned identity records"
            />
            <StatCard
              title="Total Accounts"
              value={accounts.length.toString()}
              icon={Wallet}
              subtitle="Active & frozen institutional accounts"
            />
            <StatCard
              title="Total Ledger Assets"
              value={formatCurrency(totalVaultBalance)}
              icon={CheckCircle2}
              subtitle="Aggregate balances across all accounts"
              trend="RECONCILED"
              trendType="positive"
            />
            <StatCard
              title="Audit Logs"
              value={auditEvents.length.toString()}
              icon={ShieldAlert}
              subtitle="Recorded tamper-evident events"
            />
          </div>



          {/* Recent Audit Stream */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                Recent Security & Compliance Stream
              </h3>
              <Link
                to="/admin/audit-events"
                style={{ fontSize: '0.8125rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}
              >
                View Full Audit Register &rarr;
              </Link>
            </div>

            <DataTable
              columns={auditColumns}
              data={auditEvents.slice(0, 5)}
              emptyMessage="No audit events logged yet."
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminDashboard;
