import React from 'react';
import './index.css';

const StatusBadge = ({ status, label, withDot = true }) => {
  const normalized = (status || '').toUpperCase();

  let variant = 'neutral';
  let displayLabel = label || status;

  if (['ACTIVE', 'SUCCESS', 'CREDIT', 'RESOLVED', 'BALANCED', 'TRANSFER IN', 'DEPOSIT'].includes(normalized)) {
    variant = 'success';
  } else if (['REFUSED', 'FAILED', 'CLOSED', 'SUSPENDED', 'DEBIT', 'DISCREPANCY', 'TRANSFER OUT', 'WITHDRAWAL'].includes(normalized)) {
    variant = 'danger';
  } else if (['FROZEN', 'PENDING', 'WARNING', 'ESCROW'].includes(normalized)) {
    variant = 'warning';
  } else if (['SAVINGS', 'CURRENT', 'BUSINESS', 'TRANSFER', 'OPERATIONAL', 'CHECKING'].includes(normalized)) {
    variant = 'info';
  } else if (['ADMIN', 'AUDITOR'].includes(normalized)) {
    variant = 'purple';
  } else if (['ACCOUNT_HOLDER'].includes(normalized)) {
    variant = 'info';
  }

  return (
    <span className={`status-badge status-badge-${variant} ${withDot ? 'dot' : ''}`}>
      {displayLabel}
    </span>
  );
};

export default StatusBadge;
