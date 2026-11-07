import React from 'react';
import './index.css';

const LoadingState = ({ message = 'Loading institutional ledger records...' }) => {
  return (
    <div className="loading-state">
      <div className="loading-spinner" />
      <p className="loading-text">{message}</p>
    </div>
  );
};

export default LoadingState;
