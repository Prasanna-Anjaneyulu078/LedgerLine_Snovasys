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
import transactionService from '../../services/transactionService.js';
import { formatDate } from '../../utils/formatDate.js';
import { formatCurrency, formatPaise } from '../../utils/formatCurrency.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatCard from '../../components/StatCard/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
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
function AuditDetailsCell({ row, initialExpanded = false }) {
  const [expanded, setExpanded] = useState(initialExpanded);

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

  // Inspector Modals
  const [selectedTxForDetails, setSelectedTxForDetails] = useState(null);
  const [isLoadingTxDetails, setIsLoadingTxDetails] = useState(false);
  const [selectedAuditEventForDetails, setSelectedAuditEventForDetails] = useState(null);

  const handleOpenTransactionDetails = async (row) => {
    const refOrId = row.id || row.transactionReference || row.reference;
    setSelectedTxForDetails(row);
    setIsLoadingTxDetails(true);
    try {
      const fullTx = await transactionService.getTransactionById(refOrId);
      if (fullTx) {
        setSelectedTxForDetails(fullTx);
      }
    } catch (err) {
      console.warn('Failed to load transaction ledger details:', err);
    } finally {
      setIsLoadingTxDetails(false);
    }
  };

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
  const recentUsers = dashboardData?.recentUsers || [];

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
        <button
          type="button"
          className="table-link-btn"
          onClick={() => handleOpenTransactionDetails(row)}
          title="Click to view full transaction and double-entry ledger postings"
          style={{
            fontWeight: 600,
            fontFamily: 'monospace',
            textAlign: 'left',
          }}
        >
          {row.transactionReference || row.reference || '—'}
        </button>
      ),
    },
    {
      header: 'Type',
      accessor: 'transactionType',
      render: (row) => <StatusBadge status={row.transactionType || row.type} />,
    },
    {
      header: 'Amount',
      accessor: 'amountFormatted',
      align: 'right',
      render: (row) => {
        const type = row.transactionType || row.type;
        const isDeposit = type === 'DEPOSIT';
        const isWithdrawal = type === 'WITHDRAWAL';
        const isRefused = row.status === 'REFUSED';
        const color = isRefused
          ? 'var(--text-secondary)'
          : isDeposit
          ? 'var(--success-color)'
          : isWithdrawal
          ? 'var(--danger-color)'
          : 'var(--text-color)';
        const prefix = isRefused ? '' : isDeposit ? '+' : isWithdrawal ? '-' : '';
        const amt = row.amountFormatted || (row.amount !== undefined ? formatCurrency(row.amount) : '0.00');
        return (
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color }}>
            {prefix}{formatCurrency(amt)}
          </span>
        );
      },
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
  ];

  const auditColumns = [
    {
      header: 'Actor',
      accessor: 'actorEmail',
      render: (row) => (
        <button
          type="button"
          className="table-link-btn"
          onClick={() => setSelectedAuditEventForDetails(row)}
          title="Click to inspect audit event details"
          style={{
            fontWeight: 600,
            textAlign: 'left',
          }}
        >
          {row.actorEmail || 'System / Automated'}
        </button>
      ),
    },
    {
      header: 'Action',
      accessor: 'action',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-color)' }}>
          {row.action}
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {formatDate(row.timestamp || row.createdAt)}
        </span>
      ),
    },
  ];

  const recentUserColumns = [
    {
      header: 'User Identity',
      accessor: 'name',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.name || row.fullName || '—'}
        </span>
      ),
    },
    {
      header: 'Email Address',
      accessor: 'email',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
          {row.email}
        </span>
      ),
    },
    {
      header: 'Role',
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
      header: 'Registration Date',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {formatDate(row.createdAt, false)}
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
                      systemHealth?.status === 'UP'
                        ? 'operational-status-optimal'
                        : 'operational-status-normal'
                    }`}
                  >
                    {systemHealth?.status === 'UP' ? 'ONLINE (UP)' : 'UNAVAILABLE'}
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
                    <span className="operational-metric-value" style={{ color: systemHealth?.database?.connected ? 'var(--success-color)' : 'var(--text-secondary)' }}>
                      {systemHealth?.database?.connected ? 'Connected' : 'Unavailable'}
                    </span>
                    <span className="operational-metric-sub">
                      {systemHealth?.uptime ? `PostgreSQL (${(systemHealth.uptime / 60).toFixed(0)}m uptime)` : (systemHealth ? 'PostgreSQL' : 'Telemetry offline')}
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

          {/* Recent Registered Users Section */}
          <div className="admin-data-section">
            <div className="admin-data-section-header">
              <div>
                <h3 className="admin-data-section-title">
                  Recent Registered Identities
                </h3>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                  Database-backed user identities ({overview.totalUsers} registered in PostgreSQL)
                </p>
              </div>
              <Link to="/admin/users" className="admin-data-section-link">
                Manage All Users &rarr;
              </Link>
            </div>

            <DataTable
              columns={recentUserColumns}
              data={recentUsers}
              emptyMessage="No registered user records found in the database."
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

          {/* TRANSACTION DETAILS MODAL */}
          {selectedTxForDetails && (
            <ConfirmModal
              isOpen={!!selectedTxForDetails}
              title={`Transaction Record: ${selectedTxForDetails.transactionReference || selectedTxForDetails.reference || 'Details'}`}
              confirmText="Close Inspector"
              cancelText="Dismiss"
              onConfirm={() => setSelectedTxForDetails(null)}
              onClose={() => setSelectedTxForDetails(null)}
            >
              <div>
                {selectedTxForDetails.refusalReason && (
                  <div className="tx-refusal-alert">
                    <strong>Refusal Notification:</strong> {selectedTxForDetails.refusalReason}
                  </div>
                )}

                <div className="tx-details-grid">
                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Reference Number</div>
                    <div className="tx-detail-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                      {selectedTxForDetails.transactionReference || selectedTxForDetails.reference}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Transaction Type</div>
                    <div className="tx-detail-value">
                      <StatusBadge status={selectedTxForDetails.transactionType || selectedTxForDetails.type} />
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Posting Status</div>
                    <div className="tx-detail-value">
                      <StatusBadge status={selectedTxForDetails.status} />
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Transacted Amount</div>
                    <div
                      className="tx-detail-value tabular-nums"
                      style={{
                        color:
                          (selectedTxForDetails.transactionType || selectedTxForDetails.type) === 'DEPOSIT'
                            ? 'var(--success-color)'
                            : 'var(--text-color)',
                      }}
                    >
                      {formatCurrency(selectedTxForDetails.amountFormatted || selectedTxForDetails.amount)}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Source Account</div>
                    <div className="tx-detail-value tabular-nums">
                      {selectedTxForDetails.sourceAccountNumber || selectedTxForDetails.source_account_number || 'External Liquidity / Cash Vault'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Destination Account</div>
                    <div className="tx-detail-value tabular-nums">
                      {selectedTxForDetails.destinationAccountNumber || selectedTxForDetails.destination_account_number || 'External Payout / Cash Vault'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Initiator</div>
                    <div className="tx-detail-value">
                      {selectedTxForDetails.initiatorName || selectedTxForDetails.initiator_name || 'Authorized User / System'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Timestamp</div>
                    <div className="tx-detail-value tabular-nums">
                      {formatDate(selectedTxForDetails.createdAt || selectedTxForDetails.timestamp)}
                    </div>
                  </div>
                </div>

                <div className="tx-detail-box" style={{ width: '100%', boxSizing: 'border-box' }}>
                  <div className="tx-detail-label">Full Description / Remarks</div>
                  <div className="tx-detail-value" style={{ fontWeight: 400, marginTop: '4px' }}>
                    {selectedTxForDetails.description || 'No additional remarks.'}
                  </div>
                </div>

                {/* Authoritative Double-Entry Ledger Postings */}
                {selectedTxForDetails.ledgerEntries && selectedTxForDetails.ledgerEntries.length > 0 && (
                  <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>Associated Double-Entry Ledger Postings</span>
                      <span>{selectedTxForDetails.ledgerEntries.length} entries</span>
                    </div>
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden' }}>
                      <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                            <th style={{ padding: '6px 8px' }}>Account Number</th>
                            <th style={{ padding: '6px 8px' }}>Entry Type</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Amount</th>
                            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedTxForDetails.ledgerEntries.map((le, idx) => (
                            <tr key={le.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{le.account_number || le.accountNumber}</td>
                              <td style={{ padding: '6px 8px' }}><StatusBadge status={le.entry_type || le.entryType} /></td>
                              <td
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: (le.entry_type || le.entryType) === 'CREDIT' ? 'var(--success-color)' : 'var(--text-color)',
                                }}
                              >
                                {(le.entry_type || le.entryType) === 'CREDIT' ? '+' : '-'}
                                {le.amountFormatted
                                  ? (le.amountFormatted.startsWith('₹') ? le.amountFormatted : `₹${le.amountFormatted}`)
                                  : formatPaise(le.amountPaise ?? le.amount ?? 0)}
                              </td>
                              <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                                {le.balanceAfterFormatted
                                  ? (le.balanceAfterFormatted.startsWith('₹') ? le.balanceAfterFormatted : `₹${le.balanceAfterFormatted}`)
                                  : formatPaise(le.balanceAfterPaise ?? le.balance_after ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </ConfirmModal>
          )}

          {/* AUDIT EVENT DETAILS MODAL */}
          {selectedAuditEventForDetails && (
            <ConfirmModal
              isOpen={!!selectedAuditEventForDetails}
              title={`Audit Event: ${selectedAuditEventForDetails.action || 'Security Log'}`}
              confirmText="Close Inspector"
              cancelText="Dismiss"
              onConfirm={() => setSelectedAuditEventForDetails(null)}
              onClose={() => setSelectedAuditEventForDetails(null)}
            >
              <div>
                <div className="tx-details-grid">
                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Actor</div>
                    <div className="tx-detail-value">
                      {selectedAuditEventForDetails.actorEmail || 'System / Automated'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Actor Role</div>
                    <div className="tx-detail-value">
                      <StatusBadge status={selectedAuditEventForDetails.actorRole || 'SYSTEM'} />
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Action Executed</div>
                    <div className="tx-detail-value" style={{ fontFamily: 'monospace' }}>
                      {selectedAuditEventForDetails.action || '—'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Event Status</div>
                    <div className="tx-detail-value">
                      <StatusBadge status={selectedAuditEventForDetails.status || 'SUCCESS'} />
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">Target Resource</div>
                    <div className="tx-detail-value" style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                      {selectedAuditEventForDetails.resource || '—'}
                    </div>
                  </div>

                  <div className="tx-detail-box">
                    <div className="tx-detail-label">IP Address</div>
                    <div className="tx-detail-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                      {selectedAuditEventForDetails.ipAddress || 'Internal / Direct'}
                    </div>
                  </div>

                  <div className="tx-detail-box" style={{ gridColumn: 'span 2' }}>
                    <div className="tx-detail-label">Timestamp</div>
                    <div className="tx-detail-value tabular-nums">
                      {formatDate(selectedAuditEventForDetails.timestamp || selectedAuditEventForDetails.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="tx-detail-box" style={{ width: '100%', boxSizing: 'border-box' }}>
                  <div className="tx-detail-label">Sanitized Event Details & Metadata</div>
                  <div style={{ marginTop: '6px' }}>
                    <AuditDetailsCell row={selectedAuditEventForDetails} initialExpanded={true} />
                  </div>
                </div>
              </div>
            </ConfirmModal>
          )}
        </div>
      )}
    </DashboardLayout>
  );
};

export default AdminDashboard;
