import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  FileText,
  RefreshCw,
  Building,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import accountService from '../../services/accountService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const Accounts = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounts = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await accountService.getAccounts();
      setAccounts(data || []);
    } catch (err) {
      setError('Failed to fetch accounts from ledger system.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const totalBalance = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);

  return (
    <DashboardLayout
      title="Institutional Accounts"
      breadcrumbs="LedgerLine / My Accounts"
    >
      <div className="accounts-page-container">
        <div className="accounts-header-banner">
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '4px' }}>
              Managed Operational Accounts
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              All accounts are verified with double-entry ledger integration and real-time balance tracking.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={fetchAccounts}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={14} />
              <span>Refresh Balances</span>
            </button>
          </div>
        </div>

        {isLoading ? (
          <LoadingState message="Loading operational account balances..." />
        ) : error ? (
          <ErrorState message={error} onRetry={fetchAccounts} />
        ) : (
          <div className="accounts-grid">
            {accounts.map((acc) => (
              <div key={acc.id} className="account-card-detailed">
                <div>
                  <div className="account-detail-header">
                    <div>
                      <span className="account-type-tag">
                        {acc.accountType} ACCOUNT
                      </span>
                      <div className="account-full-num tabular-nums">
                        {acc.accountNumber}
                      </div>
                    </div>
                    <StatusBadge status={acc.status} />
                  </div>

                  <div className="account-balance-large">
                    <span className="balance-caption">Current Verified Balance</span>
                    <div className="balance-figure tabular-nums">
                      {formatCurrency(acc.balance)}
                    </div>
                  </div>

                  <div className="account-meta-specs">
                    <div>
                      <span className="account-spec-label">IFSC Code</span>
                      <span className="account-spec-value">{acc.ifscCode}</span>
                    </div>
                    <div>
                      <span className="account-spec-label">Branch</span>
                      <span className="account-spec-value">{acc.branchName}</span>
                    </div>
                    <div>
                      <span className="account-spec-label">Currency</span>
                      <span className="account-spec-value">{acc.currency} (INR)</span>
                    </div>
                    <div>
                      <span className="account-spec-label">Account Holder</span>
                      <span className="account-spec-value">{acc.holderName}</span>
                    </div>
                  </div>
                </div>

                <div className="account-actions-row">
                  <Link
                    to={`/statements/${acc.accountNumber || acc.id}`}
                    className="account-statement-link"
                  >
                    View Statement &rarr;
                  </Link>

                  {role === 'ACCOUNT_HOLDER' && acc.status === 'ACTIVE' && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 8px', fontSize: '0.75rem' }}
                        onClick={() =>
                          navigate(`/transactions?action=deposit&account=${acc.accountNumber || acc.id}`)
                        }
                      >
                        Deposit
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ height: '32px', padding: '0 8px', fontSize: '0.75rem' }}
                        onClick={() =>
                          navigate(`/transactions?action=withdraw&account=${acc.accountNumber || acc.id}`)
                        }
                      >
                        Withdraw
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Accounts;
