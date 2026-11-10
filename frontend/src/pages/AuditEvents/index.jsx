import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ShieldAlert, RefreshCw, Filter, RotateCcw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ledgerService from '../../services/ledgerService.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import Pagination from '../../components/Pagination/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import { getStoredPageSize, setStoredPageSize, PAGE_SIZE_OPTIONS } from '../../utils/pagination.js';
import './index.css';

// Sensitive keys that must NEVER be rendered in UI or audit inspector
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
  } else if (typeof row.details === 'string' && row.details.trim().startsWith('{')) {
    try {
      metaObj = JSON.parse(row.details);
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
      return `₹${(Number(val) / 100).toFixed(2)}`;
    }
    if ((lowerKey.includes('amount') || lowerKey.includes('balance')) && /^\d+$/.test(String(val))) {
      return `₹${(Number(val) / 100).toFixed(2)}`;
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

const ALL_AUDIT_ACTIONS = [
  'AUTH_LOGIN_SUCCESS',
  'AUTH_LOGIN_FAILURE',
  'AUTH_LOGIN_REFUSED',
  'AUTH_REGISTER_SUCCESS',
  'AUTH_REGISTER_FAILURE',
  'AUTH_LOGOUT_SUCCESS',
  'AUTH_REFRESH_SUCCESS',
  'AUTH_REFRESH_TOKEN_INVALID',
  'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
  'AUTH_REFRESH_REFUSED',
  'AUTH_REFRESH_RESPONSE_LOST',
  'AUTH_REFRESH_RECOVERY_SUCCESS',
  'ACCOUNT_CREATED',
  'ADMIN_USER_STATUS_UPDATED',
  'ADMIN_ACCOUNT_STATUS_UPDATED',
  'INITIAL_SEED_DEPOSIT',
  'TRANSACTION_DEPOSIT_SUCCESS',
  'TRANSACTION_DEPOSIT_REFUSED',
  'TRANSACTION_WITHDRAW_SUCCESS',
  'TRANSACTION_WITHDRAW_REFUSED',
  'TRANSACTION_TRANSFER_SUCCESS',
  'TRANSACTION_TRANSFER_REFUSED',
];

const AuditEvents = () => {
  const { role } = useAuth();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Server-Side Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(getStoredPageSize);
  const [totalEvents, setTotalEvents] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filters
  const [actionFilter, setActionFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Debounce search input to avoid duplicate queries
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Inspector Modal
  const [selectedEventForDetails, setSelectedEventForDetails] = useState(null);

  const fetchEvents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const query = {
        page: currentPage,
        limit: pageSize,
      };
      if (actionFilter !== 'ALL') {
        query.action = actionFilter;
      }
      if (statusFilter !== 'ALL') {
        query.status = statusFilter;
      }
      if (debouncedSearch && debouncedSearch.trim() !== '') {
        query.search = debouncedSearch.trim();
      }

      const res = await ledgerService.getAuditEvents(query);
      const list = res?.events || (Array.isArray(res) ? res : []);
      setEvents(list);

      const total = res?.pagination?.totalEvents ?? res?.total ?? list.length;
      setTotalEvents(total);
      const pages = res?.pagination?.totalPages ?? (total > 0 ? Math.ceil(total / pageSize) : 1);
      const validPages = Math.max(1, pages);
      setTotalPages(validPages);
      if (currentPage > validPages) {
        setCurrentPage(validPages);
      }
    } catch (err) {
      setError('Unable to load institutional audit trails.');
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, actionFilter, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const uniqueActions = useMemo(() => {
    const set = new Set([...ALL_AUDIT_ACTIONS, ...events.map((e) => e.action).filter(Boolean)]);
    return Array.from(set).sort();
  }, [events]);

  const uniqueStatuses = ['SUCCESS', 'FAILURE'];

  const hasActiveFilters = actionFilter !== 'ALL' || statusFilter !== 'ALL' || searchTerm.trim() !== '';

  const resetFilters = () => {
    setActionFilter('ALL');
    setStatusFilter('ALL');
    setSearchTerm('');
    setCurrentPage(1);
  };

  const columns = [
    {
      header: 'Actor',
      accessor: 'actorEmail',
      render: (row) => (
        <button
          type="button"
          className="table-link-btn"
          onClick={() => setSelectedEventForDetails(row)}
          title="Click to inspect complete audit trail and metadata"
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
      header: 'Status',
      accessor: 'status',
      align: 'center',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
          {formatDate(row.timestamp || row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Security & Audit Events"
      breadcrumbs={`${role === 'AUDITOR' ? 'Auditor' : 'Admin'} / Audit Register`}
    >
      <div className="audit-events-page">
        <div className="audit-events-header-bar">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              System Compliance & Security Trail
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              Non-repudiable log of all user logins, transaction submissions, and administrative status alterations.
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={fetchEvents}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} />
            <span>Refresh Events</span>
          </button>
        </div>

        {/* Action and Status Filtering Toolbar */}
        <div className="filters-container">
          <div className="filters-header">
            <Filter size={14} />
            <span>Filters</span>
          </div>

          <div className="filters-controls">
            <div className="filter-group">
              <label className="filter-label">Action</label>
              <select
                className="filter-select"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Actions</option>
                {uniqueActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label className="filter-label">Status</label>
              <select
                className="filter-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
              >
                <option value="ALL">All Statuses</option>
                {uniqueStatuses.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                type="button"
                className="filter-reset-btn"
                onClick={resetFilters}
                title="Reset all filters"
              >
                <RotateCcw size={12} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Scanning cryptographic audit registers..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEvents} />
        ) : (
          <DataTable
            columns={columns}
            data={events}
            title="Institutional Event Register"
            subtitle={`${totalEvents} total chronological security events`}
            searchPlaceholder="Search by actor, action, or resource..."
            searchValue={searchTerm}
            onSearchChange={(val) => {
              setSearchTerm(val);
              setCurrentPage(1);
            }}
            pagination={
              <Pagination
                currentPage={currentPage}
                pageSize={pageSize}
                totalRecords={totalEvents}
                totalPages={totalPages}
                onPageChange={(page) => setCurrentPage(page)}
                onPageSizeChange={(size) => {
                  setStoredPageSize(size);
                  setPageSize(size);
                  setCurrentPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                disabled={isLoading}
              />
            }
            emptyMessage="No audit events matched the selected filters."
          />
        )}

        {/* AUDIT DETAILS INSPECTOR MODAL */}
        {selectedEventForDetails && (
          <ConfirmModal
            isOpen={!!selectedEventForDetails}
            title={`Audit Event Inspection: ${selectedEventForDetails.action || 'Security Log'}`}
            confirmText="Close Inspector"
            cancelText="Dismiss"
            onConfirm={() => setSelectedEventForDetails(null)}
            onClose={() => setSelectedEventForDetails(null)}
          >
            <div>
              <div className="tx-details-grid">
                <div className="tx-detail-box">
                  <div className="tx-detail-label">Actor</div>
                  <div className="tx-detail-value">
                    {selectedEventForDetails.actorEmail || 'System / Automated'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Actor Role</div>
                  <div className="tx-detail-value">
                    <StatusBadge status={selectedEventForDetails.actorRole || 'SYSTEM'} />
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Action Executed</div>
                  <div className="tx-detail-value" style={{ fontFamily: 'monospace' }}>
                    {selectedEventForDetails.action || '—'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Event Status</div>
                  <div className="tx-detail-value">
                    <StatusBadge status={selectedEventForDetails.status || 'SUCCESS'} />
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">Target Resource</div>
                  <div className="tx-detail-value" style={{ fontFamily: 'monospace', fontSize: '0.8125rem' }}>
                    {selectedEventForDetails.resource || '—'}
                  </div>
                </div>

                <div className="tx-detail-box">
                  <div className="tx-detail-label">IP Address</div>
                  <div className="tx-detail-value tabular-nums" style={{ fontFamily: 'monospace' }}>
                    {selectedEventForDetails.ipAddress || 'Internal / Direct'}
                  </div>
                </div>

                <div className="tx-detail-box" style={{ gridColumn: 'span 2' }}>
                  <div className="tx-detail-label">Timestamp</div>
                  <div className="tx-detail-value tabular-nums">
                    {formatDate(selectedEventForDetails.timestamp || selectedEventForDetails.createdAt)}
                  </div>
                </div>
              </div>

              <div className="tx-detail-box" style={{ width: '100%', boxSizing: 'border-box' }}>
                <div className="tx-detail-label">Sanitized Event Details & Metadata</div>
                <div style={{ marginTop: '6px' }}>
                  <SanitizedAuditInspector row={selectedEventForDetails} />
                </div>
              </div>
            </div>
          </ConfirmModal>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AuditEvents;
