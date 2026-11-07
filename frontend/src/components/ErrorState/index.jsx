import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import './index.css';

const ErrorState = ({
  title = 'Audit or Network Discrepancy',
  message = 'An error occurred while communicating with the ledger service.',
  onRetry,
}) => {
  return (
    <div className="error-state">
      <div className="error-state-icon">
        <AlertCircle size={24} />
      </div>
      <h3 className="error-state-title">{title}</h3>
      <p className="error-state-message">{message}</p>
      {onRetry && (
        <button type="button" className="error-state-retry-btn" onClick={onRetry}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={14} /> Retry Operation
          </span>
        </button>
      )}
    </div>
  );
};

export default ErrorState;
