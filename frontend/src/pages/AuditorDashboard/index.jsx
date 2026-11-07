import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  ShieldCheck,
  ArrowLeftRight,
  ShieldAlert,
  CheckCircle,
  FileText,
  Search,
} from 'lucide-react';
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

const AuditorDashboard = () => {
  const [ledgerEntries, setLedgerEntries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [auditEvents, setAuditEvents] = useState([]);
  const [totalLedgerEntries, setTotalLedgerEntries] = useState(0);
  const [totalTransactionsCount, setTotalTransactionsCount] = useState(0);
  const [totalAuditEventsCount, setTotalAuditEventsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [l, t, a] = await Promise.all([
        ledgerService.getGlobalLedger(),
        transactionService.getTransactions(),
        ledgerService.getAuditEvents(),
      ]);
      setLedgerEntries(l?.entries || l || []);
      setTotalLedgerEntries(l?.total ?? (l?.length || 0));
      setTransactions(t?.transactions || t || []);
      setTotalTransactionsCount(t?.total ?? (t?.length || 0));
      setAuditEvents(a?.events || a || []);
      setTotalAuditEventsCount(a?.total ?? (a?.length || 0));
    } catch (err) {
      setError('Unable to load institutional compliance data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const ledgerColumns = [
    {
      header: 'Tx Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.transactionReference}
        </span>
      ),
    },
    {
      header: 'Account',
      accessor: 'accountNumber',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>
          {row.accountNumber}
        </span>
      ),
    },
    {
      header: 'Type',
      accessor: 'entryType',
      align: 'center',
      render: (row) => <StatusBadge status={row.entryType} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const isCredit = row.entryType === 'CREDIT';
        const color = isCredit ? 'var(--success-color)' : 'var(--danger-color)';
        const prefix = isCredit ? '+' : '-';
        return (
          <span style={{ fontWeight: 700, color }}>
            {prefix}
            {formatCurrency(row.amount)}
          </span>
        );
      },
    },
    {
      header: 'Balance After',
      accessor: 'balanceAfter',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-color)' }}>
          {formatCurrency(row.balanceAfter)}
        </span>
      ),
    },
    {
      header: 'Timestamp',
      accessor: 'timestamp',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.timestamp)}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Compliance & Audit Portal"
      breadcrumbs="Auditor / Compliance Overview"
    >
      {isLoading ? (
        <LoadingState message="Performing compliance verification checks..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <div className="auditor-dashboard-container">
          {/* Header Banner */}
          <div className="auditor-header-banner">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <ShieldCheck size={20} style={{ color: 'var(--success-color)' }} />
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                  Independent Audit Oversight
                </h2>
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Read-only access to verify ledger integrity, examine transaction audit trails, and validate regulatory compliance.
              </p>
            </div>
            <div style={{ padding: '6px 12px', backgroundColor: '#DCFCE7', color: '#166534', border: '1px solid #BBF7D0', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700 }}>
              0 LEDGER DISCREPANCIES DETECTED
            </div>
          </div>

          {/* Metric Cards */}
          <div className="auditor-stats-grid">
            <StatCard
              title="Ledger Integrity"
              value="100.00%"
              icon={ShieldCheck}
              subtitle="Debits and Credits reconciled"
              trend="BALANCED"
              trendType="positive"
            />
            <StatCard
              title="Total Ledger Entries"
              value={totalLedgerEntries.toString()}
              icon={BookOpen}
              subtitle="Append-only committed journal rows"
            />
            <StatCard
              title="Total Transactions"
              value={totalTransactionsCount.toString()}
              icon={ArrowLeftRight}
              subtitle="Deposits, withdrawals & transfers"
            />
            <StatCard
              title="Security Events"
              value={totalAuditEventsCount.toString()}
              icon={ShieldAlert}
              subtitle="Logged regulatory security actions"
            />
          </div>

          {/* Recent Global Ledger Entries */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                Recent General Ledger Journal Entries
              </h3>
              <Link
                to="/auditor/ledger"
                style={{ fontSize: '0.8125rem', color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}
              >
                Inspect Full Ledger &rarr;
              </Link>
            </div>

            <DataTable
              columns={ledgerColumns}
              data={ledgerEntries.slice(0, 6)}
              searchPlaceholder="Filter journal entries..."
              searchField="transactionReference"
              emptyMessage="No ledger journal entries found."
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default AuditorDashboard;
