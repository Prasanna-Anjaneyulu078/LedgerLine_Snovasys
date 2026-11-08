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
  Activity,
} from 'lucide-react';
import adminService from '../../services/adminService.js';
import ledgerService from '../../services/ledgerService.js';
import { formatDate } from '../../utils/formatDate.js';
import { formatCurrency, formatPaise } from '../../utils/formatCurrency.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatCard from '../../components/StatCard/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

/**
 * Format ISO date string into human-readable chart label (e.g. "2026-11-05" -> "Nov 05")
 * Timezone-agnostic parsing to prevent date shifting.
 */
function formatChartDate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return dateStr || '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthIndex = parseInt(parts[1], 10) - 1;
    if (monthIndex >= 0 && monthIndex < 12) {
      return `${months[monthIndex]} ${parts[2].padStart(2, '0')}`;
    }
  }
  return dateStr;
}

/**
 * Audit Details Cell Component
 * Converts raw JSON and null values into formatted, readable key-value chips.
 * Handles paise-to-INR formatting, credential protection, and expandable overflow.
 */
function AuditDetailsCell({ row }) {
  const [expanded, setExpanded] = useState(false);

  let metaObj = null;
  if (row.metadata && typeof row.metadata === 'object') {
    metaObj = row.metadata;
  } else if (typeof row.metadata === 'string') {
    try {
      metaObj = JSON.parse(row.metadata);
    } catch {
      metaObj = null;
    }
  } else if (typeof row.details === 'string' && row.details.trim().startsWith('{')) {
    try {
      metaObj = JSON.parse(row.details);
    } catch {
      metaObj = null;
    }
  }

  // Sensitive credentials that should never be rendered in UI
  const SENSITIVE_KEYS = new Set([
    'password',
    'passwordhash',
    'password_hash',
    'token',
    'refreshtoken',
    'accesstoken',
    'secret',
    'authorization',
    'cookie',
  ]);

  if (!metaObj || typeof metaObj !== 'object') {
    const textDetail =
      typeof row.details === 'string' && row.details !== '—' && row.details.trim()
        ? row.details.trim()
        : null;
    return textDetail ? (
      <span className="audit-text-detail">{textDetail}</span>
    ) : (
      <span className="audit-no-details">No additional details</span>
    );
  }

  const entries = Object.entries(metaObj).filter(
    ([k, v]) => !SENSITIVE_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined && v !== ''
  );

  if (entries.length === 0) {
    return <span className="audit-no-details">No additional details</span>;
  }

  const formatKey = (key) => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();
  };

  const formatVal = (key, val) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('paise')) {
      return formatPaise(val);
    }
    if ((lowerKey.includes('amount') || lowerKey.includes('balance')) && /^\d+$/.test(String(val))) {
      return formatPaise(val);
    }
    if (typeof val === 'boolean') {
      return val ? 'True' : 'False';
    }
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  };

  const displayedEntries = expanded ? entries : entries.slice(0, 2);
  const hasMore = entries.length > 2;

  return (
    <div className="audit-details-cell">
      <div className="audit-meta-chips">
        {displayedEntries.map(([k, v]) => (
          <span key={k} className="audit-meta-chip">
            <span className="audit-meta-chip-key">{formatKey(k)}:</span>
            <span className="audit-meta-chip-val">{formatVal(k, v)}</span>
          </span>
        ))}
      </div>
      {hasMore && (
        <button
          type="button"
          className="audit-expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `+${entries.length - 2} more`}
        </button>
      )}
    </div>
  );
}

const AdminDashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [auditEvents, setAuditEvents] = useState([]);
  const [systemHealth, setSystemHealth] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewData, auditData, healthData] = await Promise.all([
        adminService.getDashboardOverview(),
        ledgerService.getAuditEvents({ limit: 6 }),
        adminService.getSystemHealth().catch(() => null),
      ]);
      setDashboardData(overviewData);
      setAuditEvents(auditData || []);
      setSystemHealth(healthData);
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
    inactiveUsers: 0,
    totalAccounts: 0,
    activeAccounts: 0,
    inactiveAccounts: 0,
    totalVaultBalanceFormatted: '₹0.00',
    totalTransactions: 0,
    successfulTransactions: 0,
    refusedTransactions: 0,
    failedTransactions: 0,
    unsuccessfulTransactions: 0,
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

  /**
   * Proportional height calculator with a minimum visible threshold (8px) for non-zero values.
   * Ensures smaller bars (e.g. ₹380 withdrawals beside ₹17,631 deposits) remain distinct and hoverable.
   */
  const getBarHeight = (volumePaise) => {
    const vol = Number(volumePaise) || 0;
    if (vol <= 0) return 0;
    return Math.max(8, Math.round((vol / maxTrendVolume) * 120));
  };

  const recentTransactionColumns = [
    {
      header: 'Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-color)' }}>
          {row.transactionReference || '—'}
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
              {row.sourceAccountNumber || '—'} &rarr; {row.destinationAccountNumber || '—'}
            </span>
          );
        }
        if (row.transactionType === 'DEPOSIT') {
          return (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              To: {row.destinationAccountNumber || '—'}
            </span>
          );
        }
        return (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            From: {row.sourceAccountNumber || '—'}
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
          {row.transactionType === 'DEPOSIT' ? '+' : row.transactionType === 'WITHDRAWAL' ? '-' : ''}
          {formatCurrency(row.amountFormatted)}
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
      render: (row) => <AuditDetailsCell row={row} />,
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
              subtitle={`${overview.activeUsers} active, ${overview.inactiveUsers} inactive in PostgreSQL`}
            />
            <StatCard
              title="Total Accounts"
              value={overview.totalAccounts.toString()}
              icon={Wallet}
              subtitle={`${overview.activeAccounts} active, ${overview.inactiveAccounts} inactive/held`}
            />
            <StatCard
              title="Total Vault Assets"
              value={formatCurrency(overview.totalVaultBalanceFormatted)}
              icon={CheckCircle2}
              subtitle="Reconciled reserve across all accounts"
              trend="RECONCILED"
              trendType="positive"
            />
            <StatCard
              title="Total Transactions"
              value={overview.totalTransactions.toString()}
              icon={Layers}
              subtitle={`${overview.successfulTransactions} successful (${overview.unsuccessfulTransactions} unsuccessful)`}
            />
            <StatCard
              title="Total Deposits"
              value={formatCurrency(overview.totalDepositsFormatted)}
              icon={ArrowDownRight}
              subtitle="Aggregate successful inward liquidity"
              trend="DEPOSITS"
              trendType="positive"
            />
            <StatCard
              title="Total Withdrawals"
              value={formatCurrency(overview.totalWithdrawalsFormatted)}
              icon={ArrowUpRight}
              subtitle="Aggregate successful outward payouts"
              trend="WITHDRAWALS"
              trendType="neutral"
            />
            <StatCard
              title="Total Transfer Volume"
              value={formatCurrency(overview.totalTransferVolumeFormatted)}
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
                <div className="chart-empty-state">
                  No historical transaction records available in the database.
                </div>
              ) : (
                <>
                  <div className="chart-bar-container">
                    {trends.map((day) => {
                      const depHeight = getBarHeight(day.depositVolumePaise);
                      const withHeight = getBarHeight(day.withdrawalVolumePaise);
                      const trfHeight = getBarHeight(day.transferVolumePaise);

                      return (
                        <div key={day.date} className="chart-bar-group">
                          <div className="chart-bars-wrapper">
                            <div
                              className="chart-bar chart-bar-deposit"
                              style={{ height: `${depHeight}px`, opacity: depHeight > 0 ? 1 : 0 }}
                              title={`Deposits: ${formatCurrency(day.depositVolumeFormatted)} (${day.depositCount} ${day.depositCount === 1 ? 'txn' : 'txns'})`}
                            />
                            <div
                              className="chart-bar chart-bar-withdrawal"
                              style={{ height: `${withHeight}px`, opacity: withHeight > 0 ? 1 : 0 }}
                              title={`Withdrawals: ${formatCurrency(day.withdrawalVolumeFormatted)} (${day.withdrawalCount} ${day.withdrawalCount === 1 ? 'txn' : 'txns'})`}
                            />
                            <div
                              className="chart-bar chart-bar-transfer"
                              style={{ height: `${trfHeight}px`, opacity: trfHeight > 0 ? 1 : 0 }}
                              title={`Transfers: ${formatCurrency(day.transferVolumeFormatted)} (${day.transferCount} ${day.transferCount === 1 ? 'txn' : 'txns'})`}
                            />
                          </div>
                          <span className="chart-bar-label">{formatChartDate(day.date)}</span>
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

            {/* Panel 2: Volume Composition (Strictly Financial) & Operational Health */}
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
                    {formatCurrency(overview.totalDepositsFormatted)}
                  </span>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-item-label">
                    <span className="chart-legend-dot" style={{ backgroundColor: 'var(--danger-color)' }} />
                    <span>Outward Withdrawals</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--danger-color)' }}>
                    {formatCurrency(overview.totalWithdrawalsFormatted)}
                  </span>
                </div>

                <div className="breakdown-item">
                  <div className="breakdown-item-label">
                    <span className="chart-legend-dot" style={{ backgroundColor: 'var(--primary-color)' }} />
                    <span>Peer Transfers</span>
                  </div>
                  <span className="breakdown-item-value" style={{ color: 'var(--primary-color)' }}>
                    {formatCurrency(overview.totalTransferVolumeFormatted)}
                  </span>
                </div>
              </div>

              {/* Dedicated Operational Health Section */}
              <div className="admin-operational-health-card">
                <div className="operational-health-header">
                  <div className="operational-health-title">
                    <Activity size={15} style={{ color: 'var(--primary-color)' }} />
                    <span>Operational Health</span>
                  </div>
                  <span
                    className={`operational-status-badge ${
                      systemHealth?.status === 'UP' ||
                      (overview.totalTransactions > 0 &&
                      (overview.successfulTransactions / overview.totalTransactions) >= 0.9)
                        ? 'operational-status-optimal'
                        : 'operational-status-normal'
                    }`}
                  >
                    {systemHealth?.status === 'UP' ? 'ONLINE (UP)' : 'NORMAL'}
                  </span>
                </div>
                <div className="operational-health-metrics">
                  <div className="operational-metric">
                    <span className="operational-metric-label">Execution Reliability</span>
                    <span className="operational-metric-value">
                      {overview.totalTransactions > 0
                        ? `${((overview.successfulTransactions / overview.totalTransactions) * 100).toFixed(1)}%`
                        : 'N/A'}
                    </span>
                    <span className="operational-metric-sub">
                      {overview.totalTransactions > 0
                        ? `${overview.successfulTransactions} of ${overview.totalTransactions} txns successful`
                        : 'No transactions recorded'}
                    </span>
                  </div>
                  <div className="operational-metric">
                    <span className="operational-metric-label">Database Health</span>
                    <span className="operational-metric-value" style={{ color: systemHealth?.database?.connected ? 'var(--success-color)' : 'var(--text-color)' }}>
                      {systemHealth?.database?.connected ? 'Connected' : 'Active'}
                    </span>
                    <span className="operational-metric-sub">
                      {systemHealth?.uptime ? `PostgreSQL (${(systemHealth.uptime / 60).toFixed(0)}m uptime)` : 'PostgreSQL Neon'}
                    </span>
                  </div>
                  <div className="operational-metric">
                    <span className="operational-metric-label">Audit Logs</span>
                    <span className="operational-metric-value">
                      {overview.totalAuditLogs.toLocaleString()}
                    </span>
                    <span className="operational-metric-sub">
                      Tamper-evident events
                    </span>
                  </div>
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
              <Link to="/admin/transactions" className="admin-data-section-link">
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
