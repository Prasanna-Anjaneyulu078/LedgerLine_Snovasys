import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ShieldCheck,
  ArrowLeftRight,
  ShieldAlert,
  FileCheck2,
  RefreshCw,
  Search,
  Filter,
  RotateCcw,
  AlertTriangle,
  Calendar,
} from 'lucide-react';
import ledgerService from '../../services/ledgerService.js';
import transactionService from '../../services/transactionService.js';
import { formatCurrency, formatPaise } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatCard from '../../components/StatCard/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import GlobalLedgerTable from '../../components/GlobalLedgerTable/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import Pagination from '../../components/Pagination/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import { getStoredPageSize, setStoredPageSize, PAGE_SIZE_OPTIONS } from '../../utils/pagination.js';
import './index.css';

// Sensitive keys masked from all compliance inspection views
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'refreshtoken',
  'refresh_token',
  'accesstoken',
  'access_token',
  'secret',
  'authorization',
  'cookie',
  'jwt',
]);

function SanitizedAuditInspector({ row }) {
  if (!row) return null;

  let metaObj = null;
  if (row.metadata && typeof row.metadata === 'object') {
    metaObj = row.metadata;
  } else if (typeof row.metadata === 'string') {
    try {
      metaObj = JSON.parse(row.metadata);
    } catch {
      metaObj = null;
    }
  }

  const formatKey = (key) =>
    key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .replace(/^\w/, (c) => c.toUpperCase())
      .trim();

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
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return String(val);
  };

  const entries =
    metaObj && typeof metaObj === 'object'
      ? Object.entries(metaObj).filter(
          ([k, v]) => !SENSITIVE_KEYS.has(k.toLowerCase()) && v !== null && v !== undefined && v !== ''
        )
      : [];

  const textDetail =
    typeof row.details === 'string' && row.details !== '—' && !row.details.trim().startsWith('{')
      ? row.details.trim()
      : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {textDetail && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-color)', lineHeight: 1.5 }}>
          {textDetail}
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
          {entries.map(([k, v]) => (
            <div
              key={k}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                padding: '6px 10px',
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-sm)',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                }}
              >
                {formatKey(k)}
              </span>
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                  color: 'var(--text-color)',
                  wordBreak: 'break-all',
                }}
              >
                {formatVal(k, v)}
              </span>
            </div>
          ))}
        </div>
      )}

      {!textDetail && entries.length === 0 && (
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
          No additional metadata payload attached to this security log.
        </span>
      )}
    </div>
  );
}

const AuditorDashboard = () => {
  // Navigation tab: 'ledger' | 'transactions' | 'audit'
  const [activeTab, setActiveTab] = useState('ledger');

  // Overall Telemetry & Reconciliation State
  const [totalLedgerEntries, setTotalLedgerEntries] = useState(0);
  const [totalCreditsFormatted, setTotalCreditsFormatted] = useState('₹0.00');
  const [totalDebitsFormatted, setTotalDebitsFormatted] = useState('₹0.00');
  const [totalTransactionsCount, setTotalTransactionsCount] = useState(0);
  const [refusedTransactionsCount, setRefusedTransactionsCount] = useState(0);
  const [totalAuditEventsCount, setTotalAuditEventsCount] = useState(0);

  // Tab 1: Ledger State
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [ledgerPage, setLedgerPage] = useState(1);
  const [ledgerPageSize, setLedgerPageSize] = useState(getStoredPageSize);
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState('ALL');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerTotal, setLedgerTotal] = useState(0);
  const [ledgerTotalPages, setLedgerTotalPages] = useState(1);

  // Tab 2: Transactions State
  const [transactions, setTransactions] = useState([]);
  const [txPage, setTxPage] = useState(1);
  const [txPageSize, setTxPageSize] = useState(getStoredPageSize);
  const [txTypeFilter, setTxTypeFilter] = useState('ALL');
  const [txStatusFilter, setTxStatusFilter] = useState('ALL');
  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [txSearch, setTxSearch] = useState('');
  const [txTotal, setTxTotal] = useState(0);
  const [txTotalPages, setTxTotalPages] = useState(1);

  // Tab 3: Audit Events State
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditPageSize, setAuditPageSize] = useState(getStoredPageSize);
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState('ALL');
  const [auditStartDate, setAuditStartDate] = useState('');
  const [auditEndDate, setAuditEndDate] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // Loading and Error States
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals State
  const [selectedTxForDetails, setSelectedTxForDetails] = useState(null);
  const [isLoadingTxDetails, setIsLoadingTxDetails] = useState(false);
  const [selectedAuditEvent, setSelectedAuditEvent] = useState(null);

  // Account Consistency Modal State
  const [isConsistencyModalOpen, setIsConsistencyModalOpen] = useState(false);
  const [verifyAccountNumber, setVerifyAccountNumber] = useState('');
  const [accountLedgerData, setAccountLedgerData] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState(null);

  // Load summary metrics once on mount
  const loadSummaryTelemetry = useCallback(async () => {
    try {
      const [lRes, txRes, refusedRes, aRes] = await Promise.all([
        ledgerService.getGlobalLedger({ limit: 1 }),
        transactionService.getTransactions({ limit: 1 }),
        transactionService.getTransactions({ status: 'REFUSED', limit: 1 }),
        ledgerService.getAuditEvents({ limit: 1 }),
      ]);

      setTotalLedgerEntries(lRes?.total ?? 0);
      setTotalCreditsFormatted(
        lRes?.totalCreditsFormatted
          ? lRes.totalCreditsFormatted.startsWith('₹')
            ? lRes.totalCreditsFormatted
            : `₹${lRes.totalCreditsFormatted}`
          : '₹0.00'
      );
      setTotalDebitsFormatted(
        lRes?.totalDebitsFormatted
          ? lRes.totalDebitsFormatted.startsWith('₹')
            ? lRes.totalDebitsFormatted
            : `₹${lRes.totalDebitsFormatted}`
          : '₹0.00'
      );
      setTotalTransactionsCount(txRes?.total ?? 0);
      setRefusedTransactionsCount(refusedRes?.total ?? 0);
      setTotalAuditEventsCount(aRes?.total ?? 0);
    } catch (err) {
      console.warn('Summary telemetry fetch error:', err);
    }
  }, []);

  // Fetch Ledger data for Tab 1
  const fetchLedgerData = useCallback(async () => {
    if (activeTab !== 'ledger') return;
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page: ledgerPage,
        limit: ledgerPageSize,
      };
      if (ledgerTypeFilter !== 'ALL') query.entryType = ledgerTypeFilter;
      if (ledgerSearch.trim()) query.search = ledgerSearch.trim();

      const data = await ledgerService.getGlobalLedger(query);
      const list = data?.entries || (Array.isArray(data) ? data : []);
      setLedgerEntries(list);

      const totalCount = data?.total ?? list.length;
      setLedgerTotal(totalCount);
      const pages = data?.pagination?.totalPages || (totalCount > 0 ? Math.ceil(totalCount / ledgerPageSize) : 1);
      setLedgerTotalPages(Math.max(1, pages));

      if (data?.totalCreditsFormatted) {
        setTotalCreditsFormatted(
          data.totalCreditsFormatted.startsWith('₹')
            ? data.totalCreditsFormatted
            : `₹${data.totalCreditsFormatted}`
        );
      }
      if (data?.totalDebitsFormatted) {
        setTotalDebitsFormatted(
          data.totalDebitsFormatted.startsWith('₹')
            ? data.totalDebitsFormatted
            : `₹${data.totalDebitsFormatted}`
        );
      }
    } catch (err) {
      setError('Unable to load institutional global ledger journal entries.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, ledgerPage, ledgerPageSize, ledgerTypeFilter, ledgerSearch]);

  // Fetch Transactions data for Tab 2
  const fetchTransactionsData = useCallback(async () => {
    if (activeTab !== 'transactions') return;
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page: txPage,
        limit: txPageSize,
      };
      if (txTypeFilter !== 'ALL') query.type = txTypeFilter;
      if (txStatusFilter !== 'ALL') query.status = txStatusFilter;
      if (txStartDate) query.startDate = txStartDate;
      if (txEndDate) query.endDate = txEndDate;
      if (txSearch.trim()) query.search = txSearch.trim();

      const data = await transactionService.getTransactions(query);
      const list = data?.transactions || (Array.isArray(data) ? data : []);
      setTransactions(list);

      const totalCount = data?.total ?? list.length;
      setTxTotal(totalCount);
      const pages = data?.pagination?.totalPages || (totalCount > 0 ? Math.ceil(totalCount / txPageSize) : 1);
      setTxTotalPages(Math.max(1, pages));
    } catch (err) {
      setError('Unable to load institutional transaction audit records.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, txPage, txPageSize, txTypeFilter, txStatusFilter, txStartDate, txEndDate, txSearch]);

  // Fetch Audit Events data for Tab 3
  const fetchAuditData = useCallback(async () => {
    if (activeTab !== 'audit') return;
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page: auditPage,
        limit: auditPageSize,
      };
      if (auditActionFilter !== 'ALL') query.action = auditActionFilter;
      if (auditStatusFilter !== 'ALL') query.status = auditStatusFilter;
      if (auditStartDate) query.startDate = auditStartDate;
      if (auditEndDate) query.endDate = auditEndDate;
      if (auditSearch.trim()) query.search = auditSearch.trim();

      const data = await ledgerService.getAuditEvents(query);
      const list = data?.events || (Array.isArray(data) ? data : []);
      setAuditEvents(list);

      const totalCount = data?.total ?? list.length;
      setAuditTotal(totalCount);
      const pages = data?.pagination?.totalPages || (totalCount > 0 ? Math.ceil(totalCount / auditPageSize) : 1);
      setAuditTotalPages(Math.max(1, pages));
    } catch (err) {
      setError('Unable to load compliance and security audit logs.');
    } finally {
      setIsLoading(false);
    }
  }, [activeTab, auditPage, auditPageSize, auditActionFilter, auditStatusFilter, auditStartDate, auditEndDate, auditSearch]);

  // Initial load
  useEffect(() => {
    loadSummaryTelemetry();
  }, [loadSummaryTelemetry]);

  // Tab switch effect
  useEffect(() => {
    if (activeTab === 'ledger') fetchLedgerData();
    else if (activeTab === 'transactions') fetchTransactionsData();
    else if (activeTab === 'audit') fetchAuditData();
  }, [activeTab, fetchLedgerData, fetchTransactionsData, fetchAuditData]);

  // Inspection Handlers
  const handleOpenTransactionDetails = async (tx) => {
    const identifier = tx.transactionReference || tx.reference || tx.id;
    setSelectedTxForDetails(tx);
    setIsLoadingTxDetails(true);
    try {
      const fullTx = await transactionService.getTransactionById(identifier);
      if (fullTx) {
        setSelectedTxForDetails(fullTx);
      }
    } catch (err) {
      console.warn('Failed to load transaction ledger postings:', err);
    } finally {
      setIsLoadingTxDetails(false);
    }
  };

  const handleVerifyAccountConsistency = async () => {
    if (!verifyAccountNumber.trim()) {
      setVerifyError('Please enter a target account number (e.g. LL-ACC-1001).');
      return;
    }
    setIsVerifying(true);
    setVerifyError(null);
    try {
      const data = await ledgerService.getAccountLedger(verifyAccountNumber.trim());
      setAccountLedgerData(data);
    } catch (err) {
      setVerifyError(getErrorMessage(err));
    } finally {
      setIsVerifying(false);
    }
  };

  // Transaction table columns
  const transactionColumns = [
    {
      header: 'Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <button
          type="button"
          className="table-link-btn"
          onClick={() => handleOpenTransactionDetails(row)}
          title="Inspect complete transaction audit trail & double-entry postings"
          style={{ fontWeight: 600, fontFamily: 'monospace', textAlign: 'left' }}
        >
          {row.transactionReference || row.reference || '—'}
        </button>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.type || row.transactionType} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const type = (row.type || row.transactionType || '').toUpperCase();
        const isRefused = row.status === 'REFUSED';
        const color = isRefused
          ? 'var(--text-secondary)'
          : type === 'DEPOSIT'
          ? 'var(--success-color)'
          : type === 'WITHDRAWAL'
          ? 'var(--danger-color)'
          : 'var(--text-color)';
        const prefix = isRefused ? '' : type === 'DEPOSIT' ? '+' : type === 'WITHDRAWAL' ? '-' : '';
        return (
          <span style={{ fontWeight: 700, fontFamily: 'monospace', color }}>
            {prefix}{formatCurrency(row.amount)}
          </span>
        );
      },
    },
    {
      header: 'Source Account',
      accessor: 'sourceAccountNumber',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
          {row.sourceAccountNumber || 'External Vault'}
        </span>
      ),
    },
    {
      header: 'Destination Account',
      accessor: 'destinationAccountNumber',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
          {row.destinationAccountNumber || 'External Vault'}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          <StatusBadge status={row.status} />
          {row.status === 'REFUSED' && row.refusalReason && (
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--danger-color)',
                maxWidth: '180px',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={row.refusalReason}
            >
              {row.refusalReason}
            </span>
          )}
        </div>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
          {formatDate(row.createdAt || row.timestamp)}
        </span>
      ),
    },
  ];

  // Audit table columns
  const auditColumns = [
    {
      header: 'Actor',
      accessor: 'actorEmail',
      render: (row) => (
        <button
          type="button"
          className="table-link-btn"
          onClick={() => setSelectedAuditEvent(row)}
          title="Inspect sanitized compliance metadata"
          style={{ fontWeight: 600, textAlign: 'left' }}
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
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Target Resource',
      accessor: 'resource',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          {row.resource || '—'}
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

  return (
    <DashboardLayout
      title="Compliance & Audit Portal"
      breadcrumbs="Auditor / Compliance Overview"
    >
      <div className="auditor-dashboard-container">
        {/* Header Banner */}
        <div className="auditor-header-banner">
          <div className="auditor-header-left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={22} style={{ color: 'var(--success-color)' }} />
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                Independent Compliance & Audit Oversight
              </h2>
            </div>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
              Read-only regulatory oversight for immutable ledgers, transaction audit trails, and refused policy attempts.
            </p>
          </div>

          <div className="auditor-header-actions">
            <span className="auditor-badge-online">
              <ShieldCheck size={14} />
              <span>{totalLedgerEntries} COMMITTED JOURNAL ENTRIES</span>
            </span>

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
              <span>Verify Invariant Consistency</span>
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                loadSummaryTelemetry();
                if (activeTab === 'ledger') fetchLedgerData();
                else if (activeTab === 'transactions') fetchTransactionsData();
                else if (activeTab === 'audit') fetchAuditData();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              title="Refresh compliance telemetry from PostgreSQL"
            >
              <RefreshCw size={14} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Authoritative Database-Aggregated Metric Cards */}
        <div className="auditor-stats-grid">
          <StatCard
            title="Total Cumulative Credits"
            value={totalCreditsFormatted}
            icon={BookOpen}
            subtitle="Authoritative journal credits"
            trend="CREDITS"
            trendType="positive"
          />
          <StatCard
            title="Total Cumulative Debits"
            value={totalDebitsFormatted}
            icon={BookOpen}
            subtitle="Authoritative journal debits"
            trend="DEBITS"
            trendType="neutral"
          />
          <StatCard
            title="Total Transactions"
            value={totalTransactionsCount.toString()}
            icon={ArrowLeftRight}
            subtitle={`${refusedTransactionsCount} refused policy attempt${refusedTransactionsCount === 1 ? '' : 's'}`}
          />
          <StatCard
            title="Security Audit Events"
            value={totalAuditEventsCount.toString()}
            icon={ShieldAlert}
            subtitle="Tamper-evident system actions"
          />
        </div>

        {/* Tab Navigation */}
        <div className="auditor-tabs-container">
          <button
            type="button"
            className={`auditor-tab-btn ${activeTab === 'ledger' ? 'active' : ''}`}
            onClick={() => setActiveTab('ledger')}
          >
            <BookOpen size={16} />
            <span>General Ledger Journal</span>
            <span className="auditor-tab-badge">{totalLedgerEntries}</span>
          </button>

          <button
            type="button"
            className={`auditor-tab-btn ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <ArrowLeftRight size={16} />
            <span>Transaction History & Refused Attempts</span>
            <span className="auditor-tab-badge">{totalTransactionsCount}</span>
          </button>

          <button
            type="button"
            className={`auditor-tab-btn ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            <ShieldAlert size={16} />
            <span>Security & Compliance Audit Logs</span>
            <span className="auditor-tab-badge">{totalAuditEventsCount}</span>
          </button>
        </div>

        {/* Error State */}
        {error && (
          <ErrorState
            message={error}
            onRetry={() => {
              if (activeTab === 'ledger') fetchLedgerData();
              else if (activeTab === 'transactions') fetchTransactionsData();
              else if (activeTab === 'audit') fetchAuditData();
            }}
          />
        )}

        {/* TAB 1: GENERAL LEDGER JOURNAL */}
        {activeTab === 'ledger' && !error && (
          <div>
            {/* Filter Toolbar for Ledger */}
            <div className="auditor-filter-bar">
              <div className="auditor-filter-row">
                <div className="auditor-search-input-wrapper">
                  <Search size={15} className="auditor-search-icon" />
                  <input
                    type="text"
                    className="auditor-search-input"
                    placeholder="Search ledger by transaction reference or account number..."
                    value={ledgerSearch}
                    onChange={(e) => {
                      setLedgerSearch(e.target.value);
                      setLedgerPage(1);
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="auditor-filter-label">Entry Type:</span>
                  <select
                    className="auditor-select"
                    value={ledgerTypeFilter}
                    onChange={(e) => {
                      setLedgerTypeFilter(e.target.value);
                      setLedgerPage(1);
                    }}
                  >
                    <option value="ALL">All Postings (Debits & Credits)</option>
                    <option value="CREDIT">Credits Only (+Cr)</option>
                    <option value="DEBIT">Debits Only (-Dr)</option>
                  </select>
                </div>

                {(ledgerTypeFilter !== 'ALL' || ledgerSearch.trim() !== '') && (
                  <button
                    type="button"
                    className="auditor-reset-btn"
                    onClick={() => {
                      setLedgerTypeFilter('ALL');
                      setLedgerSearch('');
                      setLedgerPage(1);
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>
                )}

                <Link
                  to="/auditor/ledger"
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.8125rem',
                    color: 'var(--primary-color)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Dedicated Ledger View &rarr;
                </Link>
              </div>
            </div>

            {isLoading ? (
              <LoadingState message="Auditing global double-entry ledger register from PostgreSQL..." />
            ) : (
              <GlobalLedgerTable
                entries={ledgerEntries}
                title="Double-Entry General Ledger Journal"
                subtitle={`Showing page ${ledgerPage} of ${ledgerTotalPages} (${ledgerTotal} total journal entries registered in PostgreSQL)`}
                pagination={
                  <Pagination
                    currentPage={ledgerPage}
                    pageSize={ledgerPageSize}
                    totalRecords={ledgerTotal}
                    totalPages={ledgerTotalPages}
                    onPageChange={(p) => setLedgerPage(p)}
                    onPageSizeChange={(s) => {
                      setStoredPageSize(s);
                      setLedgerPageSize(s);
                      setLedgerPage(1);
                    }}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    disabled={isLoading}
                  />
                }
                emptyMessage="No ledger journal entries matched selected criteria."
              />
            )}
          </div>
        )}

        {/* TAB 2: TRANSACTION HISTORY & REFUSED ATTEMPTS */}
        {activeTab === 'transactions' && !error && (
          <div>
            {/* Refused Attempts Alert Banner */}
            {refusedTransactionsCount > 0 && (
              <div className="auditor-refusal-alert" style={{ marginBottom: '1rem' }}>
                <AlertTriangle size={18} className="auditor-refusal-alert-icon" />
                <div>
                  <strong>Regulatory Oversight Alert:</strong> {refusedTransactionsCount} transaction attempt
                  {refusedTransactionsCount === 1 ? '' : 's'} were refused by the ledger engine.
                  Filter by status "Refused Attempts" to inspect refusal audit reasons (e.g. overdrafts, held accounts).
                </div>
              </div>
            )}

            {/* Filter Toolbar for Transactions */}
            <div className="auditor-filter-bar">
              <div className="auditor-filter-row">
                <div className="auditor-search-input-wrapper">
                  <Search size={15} className="auditor-search-icon" />
                  <input
                    type="text"
                    className="auditor-search-input"
                    placeholder="Search by reference, account number, or description..."
                    value={txSearch}
                    onChange={(e) => {
                      setTxSearch(e.target.value);
                      setTxPage(1);
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="auditor-filter-label">Type:</span>
                  <select
                    className="auditor-select"
                    value={txTypeFilter}
                    onChange={(e) => {
                      setTxTypeFilter(e.target.value);
                      setTxPage(1);
                    }}
                  >
                    <option value="ALL">All Types</option>
                    <option value="DEPOSIT">Deposits</option>
                    <option value="WITHDRAWAL">Withdrawals</option>
                    <option value="TRANSFER">Transfers</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="auditor-filter-label">Status:</span>
                  <select
                    className="auditor-select"
                    value={txStatusFilter}
                    onChange={(e) => {
                      setTxStatusFilter(e.target.value);
                      setTxPage(1);
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SUCCESS">Committed (Success)</option>
                    <option value="REFUSED">Refused Attempts</option>
                    <option value="FAILED">Failed</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="date"
                    className="auditor-date-input"
                    value={txStartDate}
                    onChange={(e) => {
                      setTxStartDate(e.target.value);
                      setTxPage(1);
                    }}
                    title="From Date"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>to</span>
                  <input
                    type="date"
                    className="auditor-date-input"
                    value={txEndDate}
                    onChange={(e) => {
                      setTxEndDate(e.target.value);
                      setTxPage(1);
                    }}
                    title="To Date"
                  />
                </div>

                {(txTypeFilter !== 'ALL' ||
                  txStatusFilter !== 'ALL' ||
                  txStartDate !== '' ||
                  txEndDate !== '' ||
                  txSearch.trim() !== '') && (
                  <button
                    type="button"
                    className="auditor-reset-btn"
                    onClick={() => {
                      setTxTypeFilter('ALL');
                      setTxStatusFilter('ALL');
                      setTxStartDate('');
                      setTxEndDate('');
                      setTxSearch('');
                      setTxPage(1);
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>
                )}

                <Link
                  to="/auditor/transactions"
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.8125rem',
                    color: 'var(--primary-color)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Dedicated Transactions View &rarr;
                </Link>
              </div>
            </div>

            {isLoading ? (
              <LoadingState message="Scanning PostgreSQL transaction repository..." />
            ) : (
              <DataTable
                columns={transactionColumns}
                data={transactions}
                title="Institutional Transaction History"
                subtitle={`Showing page ${txPage} of ${txTotalPages} (${txTotal} total transactions in database)`}
                pagination={
                  <Pagination
                    currentPage={txPage}
                    pageSize={txPageSize}
                    totalRecords={txTotal}
                    totalPages={txTotalPages}
                    onPageChange={(p) => setTxPage(p)}
                    onPageSizeChange={(s) => {
                      setStoredPageSize(s);
                      setTxPageSize(s);
                      setTxPage(1);
                    }}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    disabled={isLoading}
                  />
                }
                emptyMessage="No transactions matched the selected filters."
              />
            )}
          </div>
        )}

        {/* TAB 3: SECURITY & COMPLIANCE AUDIT LOGS */}
        {activeTab === 'audit' && !error && (
          <div>
            {/* Filter Toolbar for Audit Events */}
            <div className="auditor-filter-bar">
              <div className="auditor-filter-row">
                <div className="auditor-search-input-wrapper">
                  <Search size={15} className="auditor-search-icon" />
                  <input
                    type="text"
                    className="auditor-search-input"
                    placeholder="Search by actor, action, or resource..."
                    value={auditSearch}
                    onChange={(e) => {
                      setAuditSearch(e.target.value);
                      setAuditPage(1);
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="auditor-filter-label">Action:</span>
                  <select
                    className="auditor-select"
                    value={auditActionFilter}
                    onChange={(e) => {
                      setAuditActionFilter(e.target.value);
                      setAuditPage(1);
                    }}
                  >
                    <option value="ALL">All Actions</option>
                    <option value="AUTH_LOGIN_SUCCESS">Login Success</option>
                    <option value="AUTH_LOGIN_FAILURE">Login Failure</option>
                    <option value="AUTH_LOGIN_REFUSED">Login Refused</option>
                    <option value="ACCOUNT_CREATED">Account Created</option>
                    <option value="ADMIN_USER_STATUS_UPDATED">User Status Changed</option>
                    <option value="ADMIN_ACCOUNT_STATUS_UPDATED">Account Status Changed</option>
                    <option value="TRANSACTION_DEPOSIT_SUCCESS">Deposit Success</option>
                    <option value="TRANSACTION_DEPOSIT_REFUSED">Deposit Refused</option>
                    <option value="TRANSACTION_WITHDRAW_SUCCESS">Withdraw Success</option>
                    <option value="TRANSACTION_WITHDRAW_REFUSED">Withdraw Refused</option>
                    <option value="TRANSACTION_TRANSFER_SUCCESS">Transfer Success</option>
                    <option value="TRANSACTION_TRANSFER_REFUSED">Transfer Refused</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span className="auditor-filter-label">Status:</span>
                  <select
                    className="auditor-select"
                    value={auditStatusFilter}
                    onChange={(e) => {
                      setAuditStatusFilter(e.target.value);
                      setAuditPage(1);
                    }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="SUCCESS">Success</option>
                    <option value="FAILURE">Failure / Refused</option>
                  </select>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
                  <input
                    type="date"
                    className="auditor-date-input"
                    value={auditStartDate}
                    onChange={(e) => {
                      setAuditStartDate(e.target.value);
                      setAuditPage(1);
                    }}
                    title="From Date"
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>to</span>
                  <input
                    type="date"
                    className="auditor-date-input"
                    value={auditEndDate}
                    onChange={(e) => {
                      setAuditEndDate(e.target.value);
                      setAuditPage(1);
                    }}
                    title="To Date"
                  />
                </div>

                {(auditActionFilter !== 'ALL' ||
                  auditStatusFilter !== 'ALL' ||
                  auditStartDate !== '' ||
                  auditEndDate !== '' ||
                  auditSearch.trim() !== '') && (
                  <button
                    type="button"
                    className="auditor-reset-btn"
                    onClick={() => {
                      setAuditActionFilter('ALL');
                      setAuditStatusFilter('ALL');
                      setAuditStartDate('');
                      setAuditEndDate('');
                      setAuditSearch('');
                      setAuditPage(1);
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>
                )}

                <Link
                  to="/auditor/audit-events"
                  style={{
                    marginLeft: 'auto',
                    fontSize: '0.8125rem',
                    color: 'var(--primary-color)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  Dedicated Audit Trail View &rarr;
                </Link>
              </div>
            </div>

            {isLoading ? (
              <LoadingState message="Scanning immutable audit registers..." />
            ) : (
              <DataTable
                columns={auditColumns}
                data={auditEvents}
                title="Compliance Security Log Trail"
                subtitle={`Showing page ${auditPage} of ${auditTotalPages} (${auditTotal} total events in PostgreSQL database)`}
                pagination={
                  <Pagination
                    currentPage={auditPage}
                    pageSize={auditPageSize}
                    totalRecords={auditTotal}
                    totalPages={auditTotalPages}
                    onPageChange={(p) => setAuditPage(p)}
                    onPageSizeChange={(s) => {
                      setStoredPageSize(s);
                      setAuditPageSize(s);
                      setAuditPage(1);
                    }}
                    pageSizeOptions={PAGE_SIZE_OPTIONS}
                    disabled={isLoading}
                  />
                }
                emptyMessage="No audit logs matched the selected filters."
              />
            )}
          </div>
        )}

        {/* TRANSACTION DETAILS INSPECTOR MODAL */}
        {selectedTxForDetails && (
          <ConfirmModal
            isOpen={!!selectedTxForDetails}
            title={`Transaction Audit: ${selectedTxForDetails.transactionReference || selectedTxForDetails.reference || 'Details'}`}
            confirmText="Close Inspector"
            cancelText="Dismiss"
            onConfirm={() => setSelectedTxForDetails(null)}
            onClose={() => setSelectedTxForDetails(null)}
          >
            <div>
              {selectedTxForDetails.refusalReason && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#FEF2F2',
                    border: '1px solid #FECACA',
                    borderRadius: '4px',
                    marginBottom: '1rem',
                    fontSize: '0.8125rem',
                    color: '#991B1B',
                  }}
                >
                  <strong>Policy Refusal Reason:</strong> {selectedTxForDetails.refusalReason}
                </div>
              )}

              <div className="auditor-modal-grid">
                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Transaction Reference</div>
                  <div className="auditor-modal-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {selectedTxForDetails.transactionReference || selectedTxForDetails.reference}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Transaction Type</div>
                  <div className="auditor-modal-value">
                    <StatusBadge status={selectedTxForDetails.type || selectedTxForDetails.transactionType} />
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Posting Status</div>
                  <div className="auditor-modal-value">
                    <StatusBadge status={selectedTxForDetails.status} />
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Transacted Amount</div>
                  <div
                    className="auditor-modal-value tabular-nums"
                    style={{
                      color:
                        (selectedTxForDetails.type || selectedTxForDetails.transactionType) === 'DEPOSIT'
                          ? 'var(--success-color)'
                          : 'var(--text-color)',
                    }}
                  >
                    {formatCurrency(selectedTxForDetails.amount)}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Source Account</div>
                  <div className="auditor-modal-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {selectedTxForDetails.sourceAccountNumber || 'External Vault'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Destination Account</div>
                  <div className="auditor-modal-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {selectedTxForDetails.destinationAccountNumber || 'External Vault'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Initiator</div>
                  <div className="auditor-modal-value">
                    {selectedTxForDetails.initiatorName || selectedTxForDetails.initiator_name || 'Authorized User / System'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Timestamp</div>
                  <div className="auditor-modal-value tabular-nums">
                    {formatDate(selectedTxForDetails.createdAt || selectedTxForDetails.timestamp)}
                  </div>
                </div>
              </div>

              <div className="auditor-modal-box" style={{ width: '100%', boxSizing: 'border-box', marginBottom: '1rem' }}>
                <div className="auditor-modal-label">Transaction Description / Remarks</div>
                <div className="auditor-modal-value" style={{ fontWeight: 400, marginTop: '4px' }}>
                  {selectedTxForDetails.description || 'No additional remarks.'}
                </div>
              </div>

              {/* Authoritative Double-Entry Ledger Postings */}
              {selectedTxForDetails.ledgerEntries && selectedTxForDetails.ledgerEntries.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
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
                              {(le.entry_type || le.entryType) === 'CREDIT' ? '+' : '-'}₹{le.amountFormatted || (Number(le.amountPaise || le.amount || 0) / 100).toFixed(2)}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{le.balanceAfterFormatted || (Number(le.balanceAfterPaise || le.balance_after || 0) / 100).toFixed(2)}
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
        {selectedAuditEvent && (
          <ConfirmModal
            isOpen={!!selectedAuditEvent}
            title={`Audit Log Inspection: ${selectedAuditEvent.action || 'Security Event'}`}
            confirmText="Close Inspector"
            cancelText="Dismiss"
            onConfirm={() => setSelectedAuditEvent(null)}
            onClose={() => setSelectedAuditEvent(null)}
          >
            <div>
              <div className="auditor-modal-grid">
                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Actor</div>
                  <div className="auditor-modal-value">
                    {selectedAuditEvent.actorEmail || 'System / Automated'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Actor Role</div>
                  <div className="auditor-modal-value">
                    <StatusBadge status={selectedAuditEvent.actorRole || 'SYSTEM'} />
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Action Executed</div>
                  <div className="auditor-modal-value" style={{ fontFamily: 'monospace' }}>
                    {selectedAuditEvent.action || '—'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Event Status</div>
                  <div className="auditor-modal-value">
                    <StatusBadge status={selectedAuditEvent.status || 'SUCCESS'} />
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">Target Resource</div>
                  <div className="auditor-modal-value" style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {selectedAuditEvent.resource || '—'}
                  </div>
                </div>

                <div className="auditor-modal-box">
                  <div className="auditor-modal-label">IP Address</div>
                  <div className="auditor-modal-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {selectedAuditEvent.ipAddress || 'Internal'}
                  </div>
                </div>

                <div className="auditor-modal-box" style={{ gridColumn: 'span 2' }}>
                  <div className="auditor-modal-label">Timestamp</div>
                  <div className="auditor-modal-value tabular-nums">
                    {formatDate(selectedAuditEvent.timestamp || selectedAuditEvent.createdAt)}
                  </div>
                </div>
              </div>

              <div className="auditor-modal-box" style={{ width: '100%', boxSizing: 'border-box' }}>
                <div className="auditor-modal-label">Sanitized Compliance Details & Metadata</div>
                <div style={{ marginTop: '6px' }}>
                  <SanitizedAuditInspector row={selectedAuditEvent} />
                </div>
              </div>
            </div>
          </ConfirmModal>
        )}

        {/* ACCOUNT CONSISTENCY AUDIT MODAL (GET /api/v1/ledger/:accountNumber) */}
        <ConfirmModal
          isOpen={isConsistencyModalOpen}
          title="Account Ledger & Invariant Consistency Audit"
          confirmText="Verify Invariants"
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
                  label="Target Account Number (e.g. LL-ACC-1001 or TEST-ACC-ALICE-1)"
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
              <div
                style={{
                  padding: '8px 12px',
                  backgroundColor: 'var(--danger-bg)',
                  color: 'var(--danger-text)',
                  borderRadius: '4px',
                  marginBottom: '12px',
                  fontSize: '0.8125rem',
                }}
              >
                {verifyError}
              </div>
            )}

            {accountLedgerData && (
              <div style={{ marginTop: '0.75rem' }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--border-radius-sm)',
                    marginBottom: '1rem',
                    background: accountLedgerData.isBalanceConsistent ? 'var(--success-bg)' : 'var(--danger-bg)',
                    border: `1px solid ${accountLedgerData.isBalanceConsistent ? 'var(--success-border)' : 'var(--danger-border)'}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontWeight: 700,
                      color: accountLedgerData.isBalanceConsistent ? 'var(--success-text)' : 'var(--danger-text)',
                      fontSize: '0.875rem',
                    }}
                  >
                    {accountLedgerData.isBalanceConsistent ? (
                      <ShieldCheck size={18} />
                    ) : (
                      <AlertTriangle size={18} />
                    )}
                    <span>
                      {accountLedgerData.isBalanceConsistent
                        ? 'INVARIANT VERIFIED: Current balance equals sum of double-entry ledger postings.'
                        : 'DISCREPANCY DETECTED: Ledger sum does not equal account balance.'}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--surface-secondary)',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Current Account Balance
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700 }} className="tabular-nums">
                      ₹{accountLedgerData.currentBalanceFormatted}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: '0.75rem',
                      background: 'var(--surface-secondary)',
                      borderRadius: 'var(--border-radius-sm)',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Ledger Calculated Net Sum
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700 }} className="tabular-nums">
                      ₹{(Number(accountLedgerData.ledgerCalculatedBalancePaise) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>

                {accountLedgerData.entries && accountLedgerData.entries.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: 'var(--text-secondary)',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
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
                              <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>
                                {ent.transactionReference || ent.transaction_reference}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <StatusBadge status={ent.entryType || ent.entry_type} />
                              </td>
                              <td
                                style={{
                                  padding: '6px 8px',
                                  textAlign: 'right',
                                  fontWeight: 600,
                                  color: (ent.entryType || ent.entry_type) === 'CREDIT' ? 'var(--success-color)' : 'var(--text-color)',
                                }}
                              >
                                {(ent.entryType || ent.entry_type) === 'CREDIT' ? '+' : '-'}₹
                                {ent.amountFormatted || (Number(ent.amountPaise || ent.amount || 0) / 100).toFixed(2)}
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

export default AuditorDashboard;
