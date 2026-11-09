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
  PlusCircle,
  Eye,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import accountService from '../../services/accountService.js';
import { formatCurrency, formatPaise } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import { getErrorMessage } from '../../services/api.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import ConfirmModal from '../../components/ConfirmModal/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const Accounts = () => {
  const { user, role } = useAuth();
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Create Account Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newAccountType, setNewAccountType] = useState('SAVINGS');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  // Account Inspection & Real-time Balance State
  const [inspectedAccount, setInspectedAccount] = useState(null);
  const [inspectedBalance, setInspectedBalance] = useState(null);
  const [accountStatementData, setAccountStatementData] = useState(null);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectionError, setInspectionError] = useState(null);

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

  const handleCreateAccountSubmit = async () => {
    setIsSubmitting(true);
    setCreateError(null);
    try {
      const created = await accountService.createAccount({
        accountType: newAccountType,
        currency: 'INR',
      });
      setCreateSuccess(`Account ${created.accountNumber} successfully provisioned.`);
      setTimeout(() => {
        setIsCreateModalOpen(false);
        setCreateSuccess(null);
        fetchAccounts();
      }, 1200);
    } catch (err) {
      setCreateError(getErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInspectAccount = async (account) => {
    const accNum = account.accountNumber || account.id;
    setIsInspecting(true);
    setInspectionError(null);
    try {
      // Parallel fetch: getAccount, getAccountBalance, and getAccountStatement
      const [fullAcc, balData, stmtData] = await Promise.all([
        accountService.getAccount(accNum).catch(() => account),
        accountService.getAccountBalance(accNum).catch(() => null),
        accountService.getAccountStatement(accNum, { limit: 10 }).catch(() => null),
      ]);
      setInspectedAccount(fullAcc);
      setInspectedBalance(balData);
      setAccountStatementData(stmtData);
    } catch (err) {
      setInspectionError(getErrorMessage(err));
    } finally {
      setIsInspecting(false);
    }
  };

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
            {(role === 'ACCOUNT_HOLDER' || role === 'ADMIN') && (
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCreateError(null);
                  setCreateSuccess(null);
                  setIsCreateModalOpen(true);
                }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <PlusCircle size={15} />
                <span>Open New Account</span>
              </button>
            )}
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
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ height: '32px', padding: '0 8px', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      onClick={() => handleInspectAccount(acc)}
                    >
                      <Eye size={13} />
                      <span>Inspect</span>
                    </button>
                    <Link
                      to={`/statements/${acc.accountNumber || acc.id}`}
                      className="account-statement-link"
                    >
                      Full Statement &rarr;
                    </Link>
                  </div>

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

        {/* CREATE ACCOUNT MODAL */}
        <ConfirmModal
          isOpen={isCreateModalOpen}
          title="Open Depository Account"
          confirmText="Provision Account"
          onConfirm={handleCreateAccountSubmit}
          onClose={() => {
            if (!isSubmitting) setIsCreateModalOpen(false);
          }}
          isLoading={isSubmitting}
        >
          {createSuccess ? (
            <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--success-color)' }}>
              <CheckCircle2 size={36} style={{ margin: '0 auto 8px' }} />
              <p style={{ fontWeight: 600 }}>{createSuccess}</p>
            </div>
          ) : (
            <div>
              {createError && (
                <div style={{ padding: '8px 12px', backgroundColor: 'var(--danger-bg)', color: 'var(--danger-text)', borderRadius: '4px', marginBottom: '12px', fontSize: '0.8125rem' }}>
                  {createError}
                </div>
              )}
              <FormInput
                label="Account Type"
                type="select"
                value={newAccountType}
                onChange={(e) => setNewAccountType(e.target.value)}
                options={[
                  { value: 'SAVINGS', label: 'Savings Depository Account' },
                  { value: 'CHECKING', label: 'Checking Operational Account' },
                  { value: 'OPERATIONAL', label: 'Institutional Operational Account' },
                ]}
                disabled={isSubmitting}
                required
              />
              <FormInput
                label="Base Currency"
                type="text"
                value="INR (Indian Rupee)"
                disabled
              />
            </div>
          )}
        </ConfirmModal>

        {/* ACCOUNT DETAILS & STATEMENT INSPECTOR MODAL */}
        {inspectedAccount && (
          <ConfirmModal
            isOpen={!!inspectedAccount}
            title={`Account Inspector: ${inspectedAccount.accountNumber || inspectedAccount.id}`}
            confirmText="Close Inspector"
            onConfirm={() => {
              setInspectedAccount(null);
              setInspectedBalance(null);
              setAccountStatementData(null);
            }}
            onClose={() => {
              setInspectedAccount(null);
              setInspectedBalance(null);
              setAccountStatementData(null);
            }}
          >
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Account Number</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700 }} className="tabular-nums">{inspectedAccount.accountNumber}</div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Verified Real-time Balance</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--primary-color)' }} className="tabular-nums">
                    {formatCurrency(inspectedBalance ? inspectedBalance.balance : inspectedAccount.balance)}
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Status & Classification</div>
                  <div style={{ marginTop: '2px' }}>
                    <StatusBadge status={inspectedAccount.status} />
                  </div>
                </div>
                <div style={{ padding: '0.75rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 600 }}>Provisioned Date</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{formatDate(inspectedAccount.createdAt)}</div>
                </div>
              </div>

              {/* Account Statement Ledger Entries from /accounts/{accountNumber}/statement */}
              {accountStatementData?.entries && accountStatementData.entries.length > 0 && (
                <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Recent Account Ledger Postings</span>
                    <span>{accountStatementData.totalEntries || accountStatementData.entries.length} total entries</span>
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
                        {accountStatementData.entries.map((ent, idx) => (
                          <tr key={ent.id || idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={{ padding: '6px 8px', fontFamily: 'monospace' }}>{ent.transactionReference || ent.transaction_reference}</td>
                            <td style={{ padding: '6px 8px' }}>{ent.entryType || ent.entry_type}</td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: (ent.entryType || ent.entry_type) === 'CREDIT' ? 'var(--success-color)' : 'var(--text-color)' }}>
                              {(ent.entryType || ent.entry_type) === 'CREDIT' ? '+' : '-'}₹{ent.amountFormatted || (ent.amountPaise ? formatPaise(ent.amountPaise, false) : formatCurrency(ent.amount, false))}
                            </td>
                            <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'monospace' }}>
                              ₹{ent.balanceAfterFormatted || (ent.balanceAfterPaise ? formatPaise(ent.balanceAfterPaise, false) : formatCurrency(ent.balanceAfter || ent.balance_after, false))}
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
      </div>
    </DashboardLayout>
  );
};

export default Accounts;
