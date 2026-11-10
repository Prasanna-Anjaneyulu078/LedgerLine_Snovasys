import React from 'react';
import DataTable from '../DataTable/index.jsx';
import StatusBadge from '../StatusBadge/index.jsx';
import { formatCurrency, formatPaise } from '../../utils/formatCurrency.js';
import './index.css';

/**
 * Standardized 4-column definition for Global Ledger tables across Admin and Auditor dashboards:
 * 1. Transaction Reference
 * 2. Account Number
 * 3. Entry Type (CREDIT / DEBIT)
 * 4. Amount (+ / - with paise-safe format)
 *
 * Internal database UUIDs are preserved on row.id and available via tooltip/DOM
 * without cluttering the financial display.
 */
export const getGlobalLedgerColumns = () => [
  {
    header: 'Transaction Reference',
    accessor: 'transactionReference',
    width: '32%',
    render: (row) => {
      const reference =
        row.transactionReference ||
        (row.transactionId ? `TXN-${String(row.transactionId).slice(0, 8).toUpperCase()}` : 'TXN-GENERAL-POSTING');
      return (
        <span
          className="ledger-cell-reference"
          title={`Entry ID: ${row.id || 'N/A'}${row.description ? ` | Note: ${row.description}` : ''}`}
        >
          {reference}
        </span>
      );
    },
  },
  {
    header: 'Account Number',
    accessor: 'accountNumber',
    width: '26%',
    render: (row) => (
      <span className="ledger-cell-account">
        {row.accountNumber || '—'}
      </span>
    ),
  },
  {
    header: 'Entry Type',
    accessor: 'entryType',
    align: 'center',
    width: '18%',
    render: (row) => (
      <StatusBadge
        status={row.entryType}
        label={row.entryType === 'CREDIT' ? 'CREDIT' : row.entryType === 'DEBIT' ? 'DEBIT' : row.entryType}
      />
    ),
  },
  {
    header: 'Amount',
    accessor: 'amount',
    align: 'right',
    width: '24%',
    render: (row) => {
      const isCredit = (row.entryType || '').toUpperCase() === 'CREDIT';
      const color = isCredit ? 'var(--success-color)' : 'var(--danger-color)';
      const prefix = isCredit ? '+' : '-';
      const formatted =
        row.amountPaise !== undefined && row.amountPaise !== null
          ? formatPaise(String(row.amountPaise).replace(/^-/, ''))
          : formatCurrency(row.amountFormatted ?? row.amount);
      return (
        <span
          className={`ledger-cell-amount tabular-nums ${isCredit ? 'credit' : 'debit'}`}
          style={{ fontWeight: 700, color }}
        >
          {prefix}{formatted}
        </span>
      );
    },
  },
];

const GlobalLedgerTable = ({
  entries = [],
  title,
  subtitle,
  actions,
  searchPlaceholder,
  searchField,
  pagination,
  emptyMessage = 'No ledger journal entries found.',
}) => {
  const columns = React.useMemo(() => getGlobalLedgerColumns(), []);

  return (
    <div className="global-ledger-table-container">
      <DataTable
        columns={columns}
        data={entries}
        title={title}
        subtitle={subtitle}
        actions={actions}
        searchPlaceholder={searchPlaceholder}
        searchField={searchField}
        pagination={pagination}
        emptyMessage={emptyMessage}
      />
    </div>
  );
};

export default GlobalLedgerTable;

