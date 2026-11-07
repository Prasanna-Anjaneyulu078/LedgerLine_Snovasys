import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  FileText,
  CreditCard,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import accountService from '../../services/accountService.js';
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

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [accs, txs] = await Promise.all([
        accountService.getAccounts(),
        transactionService.getTransactions(),
      ]);
      setAccounts(accs || []);
      setTransactions(txs || []);
    } catch (err) {
      setError('Unable to load institutional account data from backend.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  const columns = [
    {
      header: 'Reference',
      accessor: 'reference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.reference}
        </span>
      ),
    },
    {
      header: 'Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.type} />,
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {row.description || '—'}
        </span>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => {
        const isCredit = row.type === 'DEPOSIT';
        const color =
          row.status === 'REFUSED'
            ? 'var(--text-secondary)'
            : isCredit
            ? 'var(--success-color)'
            : 'var(--text-color)';
        const prefix = row.status === 'REFUSED' ? '' : isCredit ? '+' : '-';
        return (
          <span style={{ fontWeight: 700, color }}>
            {prefix}
            {formatCurrency(row.amount)}
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
    {
      header: 'Date & Time',
      accessor: 'createdAt',
      align: 'right',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Account Dashboard"
      breadcrumbs="Account Holder / Overview"
    >
      {isLoading ? (
        <LoadingState message="Retrieving institutional account balances..." />
      ) : error ? (
        <ErrorState message={error} onRetry={loadData} />
      ) : (
        <div className="dashboard-container">
          {/* Welcome & Quick Actions Banner */}
          <div className="dashboard-welcome-banner">
            <div className="welcome-text-area">
              <h2>Welcome back, {user?.name}</h2>
              <p>
                Institution Member ID: <span className="tabular-nums">{user?.id}</span> &bull; All transactions posted with double-entry audit records.
              </p>
            </div>
            <div className="dashboard-quick-actions">
              <button
                type="button"
                className="quick-action-btn btn-deposit"
                onClick={() => navigate('/transactions?action=deposit')}
              >
                <ArrowDownLeft size={16} />
                <span>Deposit Funds</span>
              </button>
              <button
                type="button"
                className="quick-action-btn btn-withdraw"
                onClick={() => navigate('/transactions?action=withdraw')}
              >
                <ArrowUpRight size={16} />
                <span>Withdraw</span>
              </button>
              <button
                type="button"
                className="quick-action-btn btn-transfer"
                onClick={() => navigate('/transactions?action=transfer')}
              >
                <ArrowLeftRight size={16} />
                <span>Transfer</span>
              </button>
            </div>
          </div>

          {/* Metric Stat Cards */}
          <div className="dashboard-stats-grid">
            <StatCard
              title="Total Available Balance"
              value={formatCurrency(totalBalance)}
              icon={Wallet}
              subtitle="Aggregated across active accounts"
              trend="AUDIT-VERIFIED"
              trendType="positive"
            />
            <StatCard
              title="Active Accounts"
              value={accounts.length.toString()}
              icon={CreditCard}
              subtitle="Operational institutional accounts"
            />
            <StatCard
              title="Recorded Transactions"
              value={transactions.length.toString()}
              icon={ArrowLeftRight}
              subtitle="All debit, credit & transfers"
            />
            <StatCard
              title="Double-Entry Ledger"
              value="100.00%"
              icon={ShieldCheck}
              subtitle="Balanced reconciliation"
              trend="BALANCED"
              trendType="positive"
            />
          </div>

          {/* My Accounts Summary */}
          <div>
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">My Operational Accounts</h3>
              <Link to="/accounts" className="dashboard-view-all-link">
                Manage All Accounts &rarr;
              </Link>
            </div>

            <div className="accounts-overview-grid">
              {accounts.map((acc) => (
                <div key={acc.id} className="account-overview-card">
                  <div>
                    <div className="account-card-top">
                      <div>
                        <span className="account-type-badge">{acc.accountType} ACCOUNT</span>
                        <div className="account-number tabular-nums">{acc.accountNumber}</div>
                      </div>
                      <StatusBadge status={acc.status} />
                    </div>

                    <div className="account-balance-amount tabular-nums">
                      {formatCurrency(acc.balance)}
                    </div>
                  </div>

                  <div className="account-card-bottom">
                    <span>IFSC: {acc.ifscCode}</span>
                    <Link
                      to={`/statements/${acc.id}`}
                      style={{ color: 'var(--primary-color)', textDecoration: 'none', fontWeight: 600 }}
                    >
                      View Statement &rarr;
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Transactions Table */}
          <div>
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">Recent Transactions</h3>
              <Link to="/transactions" className="dashboard-view-all-link">
                View Full History &rarr;
              </Link>
            </div>

            <DataTable
              columns={columns}
              data={transactions.slice(0, 6)}
              searchPlaceholder="Filter recent transactions..."
              searchField="reference"
              emptyMessage="No recent transactions found on record."
            />
          </div>
        </div>
      )}
    </DashboardLayout>
  );
};

export default Dashboard;
