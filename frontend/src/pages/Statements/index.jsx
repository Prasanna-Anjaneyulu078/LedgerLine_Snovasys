import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText,
  Printer,
  Download,
  AlertTriangle,
  Building,
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
  const { role } = useAuth();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(urlAccountId || '');
  const [statementData, setStatementData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

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
    const basePath = role === 'AUDITOR' ? '/auditor/statements' : '/statements';
    navigate(`${basePath}/${newId}`);
  };

  const handlePrint = () => {
    window.print();
  };

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
      breadcrumbs="LedgerLine / Account Statement"
    >
      <div className="statements-page">
        {/* Account Selector & Actions Header */}
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={14} />
              <span>Print Official Statement</span>
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
                  {statementData.account.holderName}
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
                  {statementData.account.branchName} ({statementData.account.ifscCode})
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <LoadingState message="Compiling verified double-entry ledger postings..." />
        ) : error ? (
          <ErrorState message={error} onRetry={() => setSelectedAccountId(selectedAccountId)} />
        ) : (
          <>
            {/* Committed Ledger Postings Table */}
            <DataTable
              columns={entriesColumns}
              data={statementData?.entries || []}
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
      </div>
    </DashboardLayout>
  );
};

export default Statements;
