import React, { useState, useEffect } from 'react';
import { ShieldAlert, RefreshCw, Terminal } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import ledgerService from '../../services/ledgerService.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const AuditEvents = () => {
  const { role } = useAuth();
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchEvents = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await ledgerService.getAuditEvents();
      setEvents(data || []);
    } catch (err) {
      setError('Unable to load institutional audit trails.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const columns = [
    {
      header: 'Event ID',
      accessor: 'id',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          {row.id}
        </span>
      ),
    },
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
        <div>
          <span style={{ fontWeight: 600, color: 'var(--text-color)', display: 'block' }}>
            {row.actorEmail}
          </span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--text-secondary)' }}>
            IP: {row.ipAddress}
          </span>
        </div>
      ),
    },
    {
      header: 'Actor Role',
      accessor: 'actorRole',
      render: (row) => <StatusBadge status={row.actorRole} />,
    },
    {
      header: 'Action Executed',
      accessor: 'action',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text-color)' }}>
          {row.action}
        </span>
      ),
    },
    {
      header: 'Target Resource',
      accessor: 'resource',
      render: (row) => (
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
          {row.resource}
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
      header: 'Audit Description',
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

        {isLoading ? (
          <LoadingState message="Scanning cryptographic audit registers..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchEvents} />
        ) : (
          <DataTable
            columns={columns}
            data={events}
            title="Institutional Event Register"
            subtitle={`${events.length} chronological security events`}
            searchPlaceholder="Search by actor, action, or resource..."
          />
        )}
      </div>
    </DashboardLayout>
  );
};

export default AuditEvents;
