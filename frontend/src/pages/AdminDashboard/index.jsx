import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Wallet,
  ShieldAlert,
  CheckCircle2,
  ArrowDownRight,
  ArrowUpRight,
  ArrowLeftRight,
  Layers,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import adminService from '../../services/adminService.js';
import ledgerService from '../../services/ledgerService.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatCard from '../../components/StatCard/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const AdminDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, auditData] = await Promise.all([
        adminService.getDashboardOverview(),
        ledgerService.getAuditEvents({ limit: 6 }),
      ]);
      setDashboardData(overviewData);
      setAuditEvents(auditData || []);
    } catch (err) {
      setError('Unable to load institutional administrative overview from PostgreSQL database.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const overview = dashboardData?.overview || {
    totalUsers: 0,
    activeUsers: 0,
    totalAccounts: 0,
    activeAccounts: 0,
    totalVaultBalanceFormatted: '₹0.00',
    totalTransactions: 0,
    successfulTransactions: 0,
    refusedTransactions: 0,
    totalDepositsFormatted: '₹0.00',
    totalWithdrawalsFormatted: '₹0.00',
    totalTransferVolumeFormatted: '₹0.00',
    totalAuditLogs: 0,
  };

  const trends = dashboardData?.transactionTrends || [];
  const recentTransactions = dashboardData?.recentTransactions || [];

  // Compute maximum volume across trends for proportional SVG/CSS bar heights
  const maxTrendVolume = Math.max(
    1,
    ...trends.flatMap((t) => [
      Number(t.depositVolumePaise) || 0,
      Number(t.withdrawalVolumePaise) || 0,
      Number(t.transferVolumePaise) || 0,
    ])
  );

  const recentTransactionColumns = [
    {
      header: 'Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-color)' }}>
          {row.transactionReference}
        </span>
      ),
    },
    {
      header: 'Type',
      accessor: 'transactionType',
      render: (row) => <StatusBadge status={row.transactionType} />,
    },
    {
      header: 'Accounts Involved',
      render: (row) => {
        if (row.transactionType === 'TRANSFER') {
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {row.sourceAccountNumber} &rarr; {row.destinationAccountNumber}
            </span>
          );
        }
        if (row.transactionType === 'DEPOSIT') {
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              To: {row.destinationAccountNumber}
            </span>
          );
        }
        return (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            From: {row.sourceAccountNumber}
          </span>
        );
      },
    },
    {
      header: 'Amount',
      accessor: 'amountFormatted',
      align: 'right',
      render: (row) => (
        <span
          style={{
            fontWeight: 600,
            fontFamily: 'monospace',
            color:
              row.transactionType === 'DEPOSIT'
                ? 'var(--success-color)'
                : row.transactionType === 'WITHDRAWAL'
                ? 'var(--danger-color)'
                : 'var(--text-color)',
          }}
        >
          {row.amountFormatted}
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
      header: 'Timestamp',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  const auditColumns = [
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {formatDate(row.timestamp || row.createdAt)}
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
      header: 'Details',
      accessor: 'details',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.details || (row.metadata ? JSON.stringify(row.metadata) : '—')}
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
        <LoadingState message="Compiling administrative ledger telemetry from PostgreSQL..." />
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
                System-wide oversight for identities, vault assets, financial transaction volumes, and tamper-evident ledgers.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={loadData}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} />
              <span>Refresh Telemetry</span>
            </button>
          </div>

          {/* Metric Cards Grid - 8 Authoritative PostgreSQL Aggregates */}
          <div className="admin-stats-grid">
            <StatCard
              title="Total System Users"
              value={overview.totalUsers.toString()}
              icon={Users}
              subtitle={`${overview.activeUsers} active identities in PostgreSQL`}
            />
            <StatCard
              title="Total Accounts"
              value={overview.totalAccounts.toString()}
              icon={Wallet}
              subtitle={`${overview.activeAccounts} active operational vaults`}
            />
            <StatCard
              title="Total Vault Assets"
              value={overview.totalVaultBalanceFormatted}
              icon={CheckCircle2}
              subtitle="Reconciled reserve across all accounts"
              trend="RECONCILED"
              trendType="positive"
            />
            <StatCard
              title="Total Transactions"
              value={overview.totalTransactions.toString()}
              icon={Layers}
              subtitle={`${overview.successfulTransactions} successful (${overview.refusedTransactions} refused)`}
            />
            <StatCard
              title="Total Deposits"
              value={overview.totalDepositsFormatted}
              icon={ArrowDownRight}
              subtitle="Aggregate successful inward liquidity"
              trend="DEPOSITS"
              trendType="positive"
            />
            <StatCard
              title="Total Withdrawals"
              value={overview.totalWithdrawalsFormatted}
              icon={ArrowUpRight}
              subtitle="Aggregate successful outward payouts"
              trend="WITHDRAWALS"
              trendType="neutral"
            />
            <StatCard
              title="Total Transfer Volume"
              value={overview.totalTransferVolumeFormatted}
              icon={ArrowLeftRight}
              subtitle="Single-counted peer settlements"
              trend="TRANSFERS"
              trendType="neutral"
            />
            <StatCard
              title="Audit Logs"
              value={overview.totalAuditLogs.toString()}
              icon={ShieldAlert}
              subtitle="Recorded tamper-evident events"
            />
          </div>

          {/* Transaction Analytics & Activity Charts */}
          <div className="admin-analytics-grid">
            {/* Panel 1: Daily Transaction Volume Trends */}
            <div className="admin-card-panel">
              <div className="admin-card-panel-header">
                <div>
                  <h3 className="admin-card-panel-title">Transaction Volume by Date</h3>
                  <p className="admin-card-panel-subtitle">
                    Real daily financial throughput aggregated from PostgreSQL transaction records
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <TrendingUp size={14} style={{ color: 'var(--primary-color)' }} />
                  <span>Daily Breakdown</span>
                </div>
              </div>

              {trends.length === 0 ? (
                <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                  No historical transaction records available in the database.
                </div>
              ) : (
                <>
                  <div className="chart-bar-container">
                    {trends.map((day) => {
                      const depHeight = Math.max(
                        4,
                        Math.round(((Number(day.depositVolumePaise) || 0) / maxTrendVolume) * 120)
                      );
                      const withHeight = Math.max(
                        4,
                        Math.round(((Number(day.withdrawalVolumePaise) || 0) / maxTrendVolume) * 120)
                      );
                      const trfHeight = Math.max(
                        4,
                        Math.round(((Number(day.transferVolumePaise) || 0) / maxTrendVolume) * 120)
                      );

                      return (
                        <div key={day.date} className="chart-bar-group">
                          <div className="chart-bars-wrapper">
                            <div
                              className="chart-bar chart-bar-deposit"
                              style={{ height: `${depHeight}px` }}
                              title={`Deposits: ${day.depositVolumeFormatted} (${day.depositCount} txns)`}
                            />
                            <div
                              className="chart-bar chart-bar-withdrawal"
                              style={{ height: `${withHeight}px` }}
                              title={`Withdrawals: ${day.withdrawalVolumeFormatted} (${day.withdrawalCount} txns)`}
                            />
                            <div
                              className="chart-bar chart-bar-transfer"
                              style={{ height: `${trfHeight}px` }}
                              title={`Transfers: ${day.transferVolumeFormatted} (${day.transferCount} txns)`}
                            />
                          </div>
                          <span className="chart-bar-label">{day.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="chart-legend">
                    <div className="chart-legend-item">
                      <span className="chart-legend-dot" style={{ backgroundColor: 'var(--success-color)' }} />
                      <span>Deposits</span>
                    </div>
                    <div className="chart-legend-item">
                      <span className="chart-legend-dot" style={{ backgroundColor: 'var(--danger-color)' }} />
                      <span>Withdrawals</span>
                    </div>
                    <div className="chart-legend-item">
                      <span className="chart-legend-dot" style={{ backgroundColor: 'var(--primary-color)' }} />
                      <span>Transfers</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Panel 2: Volume Composition & Financial Ratios */}
            <div className="admin-card-panel">
              <div className="admin-card-panel-header">
                <div>
                  <h3 className="admin-card-panel-title">Volume Composition</h3>
                  <p className="admin-card-panel-subtitle">Authoritative liquidity distributions</p>
                </div>
              </div>

              <div className="breakdown-row">
                <div className="breakdown-item">
                  <div className="breakdown-item-label">
                    <span className="chart-legend-dot" style={{ backgroundColor: 'var(--success-color)' }} />
                    <span>Inward Deposits</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--success-color)' }}>
                    {overview.totalDepositsFormatted}
                  </span>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-item-label">
                    <span className="chart-legend-dot" style={{ backgroundColor: 'var(--danger-color)' }} />
                    <span>Outward Withdrawals</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--danger-color)' }}>
                    {overview.totalWithdrawalsFormatted}
                  </span>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-item-label">
                    <span className="chart-legend-dot" style={{ backgroundColor: 'var(--primary-color)' }} />
                    <span>Peer Transfers</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--primary-color)' }}>
                    {overview.totalTransferVolumeFormatted}
                  </span>
                </div>

                <div className="breakdown-item" style={{ backgroundColor: 'var(--primary-light)', borderColor: '#BFDBFE' }}>
                  <div className="breakdown-item-label">
                    <CheckCircle2 size={16} style={{ color: 'var(--primary-color)' }} />
                    <span>Execution Reliability</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--primary-color)' }}>
                    {overview.totalTransactions > 0
                      ? `${((overview.successfulTransactions / overview.totalTransactions) * 100).toFixed(1)}%`
                      : '100%'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Financial Transactions Section */}
          <div className="admin-data-section">
            <div className="admin-data-section-header">
              <h3 className="admin-data-section-title">
                Recent Institutional Transactions
              </h3>
              <Link to="/transactions" className="admin-data-section-link">
                View All Transactions &rarr;
              </Link>
            </div>

            <DataTable
              columns={recentTransactionColumns}
              data={recentTransactions}
              emptyMessage="No financial transactions recorded in the database yet."
            />
          </div>

          {/* Recent Audit Stream Section */}
          <div className="admin-data-section">
            <div className="admin-data-section-header">
              <h3 className="admin-data-section-title">
                Recent Security & Compliance Stream
              </h3>
              <Link to="/admin/audit-events" className="admin-data-section-link">
                View Full Audit Register &rarr;
              </Link>
            </div>

            <DataTable
              columns={auditColumns}
              data={auditEvents}
              emptyMessage="No audit events logged yet."
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminDashboard;
