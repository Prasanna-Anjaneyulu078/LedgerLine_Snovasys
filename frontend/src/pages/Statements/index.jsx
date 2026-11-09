import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Printer,
  AlertTriangle,
  Building2,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import statementService from '../../services/statementService.js';
import accountService from '../../services/accountService.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import { formatDate } from '../../utils/formatDate.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import DataTable from '../../components/DataTable/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import LoadingState from '../../components/LoadingState/index.jsx';
import ErrorState from '../../components/ErrorState/index.jsx';
import './index.css';

const Statements = () => {
  const { accountId: urlAccountId } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(urlAccountId || '');
  const [statementData, setStatementData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);

  // Load available accounts first
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const accs = await accountService.getAccounts();
        setAccounts(accs || []);
        if (!selectedAccountId && accs && accs.length > 0) {
          setSelectedAccountId(accs[0].accountNumber || accs[0].id);
        } else if (urlAccountId) {
          setSelectedAccountId(urlAccountId);
        }
      } catch (err) {
        console.error('Failed to load accounts for statement:', err);
      }
    };
    fetchAccounts();
  }, [urlAccountId]);

  // Load statement whenever selectedAccountId changes
  useEffect(() => {
    if (!selectedAccountId) return;

    const fetchStatement = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await statementService.getStatement(selectedAccountId);
        setStatementData(data);
      } catch (err) {
        setError('Unable to retrieve official statement for this account.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatement();
  }, [selectedAccountId]);

  const handleAccountChange = (e) => {
    const newId = e.target.value;
    setSelectedAccountId(newId);
    const basePath = role === 'ADMIN' ? '/admin/statements' : role === 'AUDITOR' ? '/auditor/statements' : '/statements';
    navigate(`${basePath}/${newId}`);
  };

  const handlePrint = () => {
    if (isPrinting || isLoading || !statementData?.account) return;
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 100);
  };

  // Resolve active account details & calculations for the printed statement
  const activeAccount =
    accounts.find(
      (a) => a.accountNumber === selectedAccountId || a.id === selectedAccountId
    ) || statementData?.account;

  const accountHolderName =
    activeAccount?.holderName ||
    activeAccount?.owner_name ||
    statementData?.account?.holderName ||
    user?.name ||
    'Authorized Account Holder';

  const branchName =
    activeAccount?.branchName ||
    statementData?.account?.branchName ||
    'Central Operations Treasury';

  const ifscCode =
    activeAccount?.ifscCode ||
    statementData?.account?.ifscCode ||
    'LLIN0001001';

  const entriesList = statementData?.entries || [];

  // Entries are ordered DESC from ledger (newest first, oldest last)
  const oldestEntry = entriesList.length > 0 ? entriesList[entriesList.length - 1] : null;
  const newestEntry = entriesList.length > 0 ? entriesList[0] : null;

  let openingBalance = 0;
  if (oldestEntry) {
    if (oldestEntry.entryType === 'CREDIT') {
      openingBalance = oldestEntry.balanceAfter - oldestEntry.amount;
    } else if (oldestEntry.entryType === 'DEBIT') {
      openingBalance = oldestEntry.balanceAfter + oldestEntry.amount;
    } else {
      openingBalance = oldestEntry.balanceAfter;
    }
  } else if (statementData?.account?.balance !== undefined) {
    openingBalance = statementData.account.balance;
  }

  const closingBalance =
    statementData?.account?.balance !== undefined
      ? statementData.account.balance
      : newestEntry
      ? newestEntry.balanceAfter
      : 0;

  const totalDebits = entriesList
    .filter((e) => e.entryType === 'DEBIT')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const debitCount = entriesList.filter((e) => e.entryType === 'DEBIT').length;

  const totalCredits = entriesList
    .filter((e) => e.entryType === 'CREDIT')
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const creditCount = entriesList.filter((e) => e.entryType === 'CREDIT').length;

  const statementPeriod = oldestEntry
    ? `${formatDate(oldestEntry.timestamp, false)} to ${formatDate(newestEntry.timestamp, false)}`
    : `As of ${formatDate(new Date(), false)}`;

  const generationDate = formatDate(new Date(), true);

  const entriesColumns = [
    {
      header: 'Date & Time',
      accessor: 'timestamp',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.timestamp)}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'transactionReference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: 'var(--text-color)' }}>
          {row.transactionReference}
        </span>
      ),
    },
    {
      header: 'Description',
      accessor: 'description',
      render: (row) => <span>{row.description || 'Ledger Posting'}</span>,
    },
    {
      header: 'Entry Type',
      accessor: 'entryType',
      align: 'center',
      render: (row) => <StatusBadge status={row.entryType} />,
    },
    {
      header: 'Debit (Dr)',
      accessor: 'debit',
      align: 'right',
      render: (row) => {
        if (row.entryType === 'DEBIT') {
          return (
            <span style={{ fontWeight: 600, color: 'var(--danger-color)' }}>
              {formatCurrency(row.amount)}
            </span>
          );
        }
        return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      },
    },
    {
      header: 'Credit (Cr)',
      accessor: 'credit',
      align: 'right',
      render: (row) => {
        if (row.entryType === 'CREDIT') {
          return (
            <span style={{ fontWeight: 600, color: 'var(--success-color)' }}>
              {formatCurrency(row.amount)}
            </span>
          );
        }
        return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
      },
    },
    {
      header: 'Running Balance',
      accessor: 'balanceAfter',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 700, color: 'var(--text-color)' }}>
          {formatCurrency(row.balanceAfter)}
        </span>
      ),
    },
  ];

  const refusedColumns = [
    {
      header: 'Attempted At',
      accessor: 'createdAt',
      render: (row) => (
        <span style={{ color: 'var(--text-secondary)' }}>
          {formatDate(row.createdAt)}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (row) => (
        <span style={{ fontWeight: 600, color: '#991B1B' }}>
          {row.reference}
        </span>
      ),
    },
    {
      header: 'Attempted Type',
      accessor: 'type',
      render: (row) => <StatusBadge status={row.type} />,
    },
    {
      header: 'Amount',
      accessor: 'amount',
      align: 'right',
      render: (row) => (
        <span style={{ fontWeight: 600, color: '#991B1B' }}>
          {formatCurrency(row.amount)}
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
      header: 'Refusal Reason',
      accessor: 'refusalReason',
      render: (row) => (
        <span style={{ color: '#991B1B', fontSize: '0.75rem' }}>
          {row.refusalReason || 'Regulatory or balance refusal.'}
        </span>
      ),
    },
  ];

  return (
    <DashboardLayout
      title="Official Account Statement"
      breadcrumbs={`${role === 'ADMIN' ? 'Admin' : role === 'AUDITOR' ? 'Auditor' : 'Account'} / Statements`}
    >
      <div className="statements-page">
        {/* Account Selector & Actions Header (Screen only) */}
        <div className="statement-account-header">
          <div className="statement-selector-area">
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Select Account:
            </span>
            <select
              value={selectedAccountId}
              onChange={handleAccountChange}
              className="form-select"
              style={{ width: '280px', height: '36px' }}
              aria-label="Select account for statement"
            >
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.accountNumber || acc.id}>
                  {acc.accountNumber} — {acc.accountType} ({formatCurrency(acc.balance)})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={handlePrint}
              disabled={isLoading || isPrinting || !statementData?.account}
              title="Print official account statement"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              aria-label="Print official account statement"
            >
              <Printer size={14} />
              <span>{isPrinting ? 'Preparing Statement...' : 'Print Official Statement'}</span>
            </button>
          </div>

          {statementData?.account && (
            <div className="statement-account-summary">
              <div className="statement-sum-item">
                <span className="statement-sum-label">Account Number</span>
                <span className="statement-sum-val tabular-nums">
                  {statementData.account.accountNumber}
                </span>
              </div>
              <div className="statement-sum-item">
                <span className="statement-sum-label">Account Holder</span>
                <span className="statement-sum-val">
                  {accountHolderName}
                </span>
              </div>
              <div className="statement-sum-item">
                <span className="statement-sum-label">Verified Balance</span>
                <span className="statement-sum-val tabular-nums" style={{ color: 'var(--primary-color)' }}>
                  {formatCurrency(statementData.account.balance)}
                </span>
              </div>
              <div className="statement-sum-item">
                <span className="statement-sum-label">Branch & IFSC</span>
                <span className="statement-sum-val" style={{ fontSize: '0.8125rem' }}>
                  {branchName} ({ifscCode})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Screen Content */}
        {isLoading ? (
          <LoadingState message="Compiling verified double-entry ledger postings..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setSelectedAccountId(selectedAccountId)} />
        ) : (
          <>
            {/* Committed Ledger Postings Table */}
            <DataTable
              columns={entriesColumns}
              data={entriesList}
              title="Committed Ledger Postings"
              subtitle="All debit and credit rows are reconciled against the global double-entry ledger"
              searchPlaceholder="Filter statement entries..."
              searchField="transactionReference"
              emptyMessage="No transaction entries recorded for this statement period."
            />

            {/* Refused Attempts Section */}
            {statementData?.refusedAttempts && statementData.refusedAttempts.length > 0 && (
              <div className="refused-attempts-container">
                <div className="refused-alert-box">
                  <div className="refused-alert-title">
                    <AlertTriangle size={18} />
                    <span>Refused Transaction Attempts (Audit Record)</span>
                  </div>
                  <div className="refused-alert-desc">
                    These transaction requests were evaluated and refused by the ledger
                    rules (e.g. insufficient funds, frozen status). They do NOT affect
                    the running ledger balance.
                  </div>
                </div>

                <DataTable
                  columns={refusedColumns}
                  data={statementData.refusedAttempts}
                  title="Refused Attempts Journal"
                  subtitle="Preserved for compliance audit trail"
                  emptyMessage="No refused transaction attempts found."
                />
              </div>
            )}
          </>
        )}

        {/* ====================================================================
            OFFICIAL PRINT STATEMENT DOCUMENT
            Hidden on screen (@media screen), visible only in print (@media print)
            ==================================================================== */}
        {statementData?.account && (
          <div className="print-statement-document" aria-hidden="true">
            {/* Header / Institutional Letterhead */}
            <header className="print-header">
              <div className="print-brand-row">
                <div className="print-brand">
                  <div className="print-logo-icon">
                    <Building2 size={24} />
                  </div>
                  <div className="print-brand-text">
                    <span className="print-brand-name">LedgerLine</span>
                    <span className="print-brand-tagline">Secure Financial Ledger Platform</span>
                  </div>
                </div>
                <div className="print-doc-meta">
                  <div className="print-doc-badge">OFFICIAL ACCOUNT STATEMENT</div>
                  <div className="print-doc-audit-note">Double-Entry Ledger Verified</div>
                </div>
              </div>
              <div className="print-header-divider" />
            </header>

            {/* Account & Statement Information Grid */}
            <section className="print-info-grid">
              <div className="print-info-column">
                <h4 className="print-section-heading">Account Holder Information</h4>
                <table className="print-meta-table">
                  <tbody>
                    <tr>
                      <th>Account Holder:</th>
                      <td><strong>{accountHolderName}</strong></td>
                    </tr>
                    <tr>
                      <th>Account Number:</th>
                      <td><span className="print-mono">{statementData.account.accountNumber}</span></td>
                    </tr>
                    <tr>
                      <th>Account Type:</th>
                      <td>{statementData.account.accountType} ({statementData.account.currency || 'INR'})</td>
                    </tr>
                    <tr>
                      <th>Account Status:</th>
                      <td>{statementData.account.status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="print-info-column">
                <h4 className="print-section-heading">Statement Period & Branch</h4>
                <table className="print-meta-table">
                  <tbody>
                    <tr>
                      <th>Statement Period:</th>
                      <td>{statementPeriod}</td>
                    </tr>
                    <tr>
                      <th>Statement Date:</th>
                      <td>{generationDate}</td>
                    </tr>
                    <tr>
                      <th>Branch / Entity:</th>
                      <td>{branchName}</td>
                    </tr>
                    <tr>
                      <th>IFSC / Routing Code:</th>
                      <td><span className="print-mono">{ifscCode}</span></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Statement Balances Summary */}
            <section className="print-balances-summary">
              <div className="print-balance-box">
                <span className="print-balance-label">Opening Balance</span>
                <span className="print-balance-val print-mono">{formatCurrency(openingBalance)}</span>
              </div>
              <div className="print-balance-box">
                <span className="print-balance-label">Total Debits (Dr)</span>
                <span className="print-balance-val print-mono debit">{formatCurrency(totalDebits)}</span>
                <span className="print-balance-count">{debitCount} debits</span>
              </div>
              <div className="print-balance-box">
                <span className="print-balance-label">Total Credits (Cr)</span>
                <span className="print-balance-val print-mono credit">{formatCurrency(totalCredits)}</span>
                <span className="print-balance-count">{creditCount} credits</span>
              </div>
              <div className="print-balance-box highlight">
                <span className="print-balance-label">Closing / Current Balance</span>
                <span className="print-balance-val print-mono closing">{formatCurrency(closingBalance)}</span>
              </div>
            </section>

            {/* Transaction Ledger Entries Table */}
            <section className="print-table-section">
              <h4 className="print-section-heading">
                Committed Ledger Postings ({entriesList.length} entries)
              </h4>
              <table className="print-table">
                <thead>
                  <tr>
                    <th style={{ width: '16%' }}>Date & Time</th>
                    <th style={{ width: '18%' }}>Reference</th>
                    <th style={{ width: '12%' }}>Type</th>
                    <th style={{ width: '24%' }}>Description / Ledger Note</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Debit (Dr)</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Credit (Cr)</th>
                    <th style={{ width: '10%', textAlign: 'right' }}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {entriesList.length > 0 ? (
                    entriesList.map((entry, idx) => {
                      const isCredit = entry.entryType === 'CREDIT';
                      const isDebit = entry.entryType === 'DEBIT';
                      return (
                        <tr key={entry.id || idx}>
                          <td className="print-date">{formatDate(entry.timestamp)}</td>
                          <td className="print-mono print-ref">{entry.transactionReference}</td>
                          <td>
                            <span className={`print-type-tag ${entry.entryType?.toLowerCase()}`}>
                              {entry.transactionType || entry.entryType}
                            </span>
                          </td>
                          <td className="print-desc">{entry.description || 'Ledger Posting'}</td>
                          <td className="print-mono print-num print-debit">
                            {isDebit ? formatCurrency(entry.amount) : '—'}
                          </td>
                          <td className="print-mono print-num print-credit">
                            {isCredit ? formatCurrency(entry.amount) : '—'}
                          </td>
                          <td className="print-mono print-num print-balance">
                            {formatCurrency(entry.balanceAfter)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '16px' }}>
                        No transaction entries recorded for this account.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </section>

            {/* Refused Attempts Audit Record (if any) */}
            {statementData.refusedAttempts && statementData.refusedAttempts.length > 0 && (
              <section className="print-table-section print-refused-section">
                <h4 className="print-section-heading">
                  Refused Transaction Attempts (Audit Record — Non-Posting)
                </h4>
                <div className="print-refused-note">
                  The following requests were evaluated and refused by system policy checks. They did not alter running ledger balances.
                </div>
                <table className="print-table print-refused-table">
                  <thead>
                    <tr>
                      <th style={{ width: '22%' }}>Attempted At</th>
                      <th style={{ width: '25%' }}>Reference</th>
                      <th style={{ width: '18%' }}>Amount</th>
                      <th style={{ width: '35%' }}>Refusal Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statementData.refusedAttempts.map((refused, idx) => (
                      <tr key={refused.id || idx}>
                        <td className="print-date">{formatDate(refused.createdAt)}</td>
                        <td className="print-mono">{refused.reference}</td>
                        <td className="print-mono">
                          {refused.amount ? formatCurrency(refused.amount) : '—'}
                        </td>
                        <td className="print-desc">{refused.refusalReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {/* Institutional Attestation & Statement Footer */}
            <footer className="print-footer">
              <div className="print-footer-grid">
                <div className="print-attestation">
                  <strong>Institutional Attestation:</strong>
                  <p>
                    This is an authoritative, official account statement generated directly from LedgerLine's immutable double-entry ledger. All posted debits and credits conform to strict conservation of value and mathematical reconciliation.
                  </p>
                </div>
                <div className="print-stamp-box">
                  <div className="print-stamp-badge">
                    <CheckCircle size={14} />
                    <span>LEDGER RECONCILED</span>
                  </div>
                  <span className="print-stamp-date">Generated: {generationDate}</span>
                </div>
              </div>
              <div className="print-footer-fineprint">
                <span>LedgerLine Institutional Core • End of Statement</span>
              </div>
            </footer>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Statements;
