import React from 'react';
import { Building2 } from 'lucide-react';
import './index.css';

const AuthLayout = ({ children }) => {
  return (
    <div className="auth-layout">
      <aside className="auth-sidebar-panel">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="auth-brand-title">LedgerLine</h1>
            <div className="auth-brand-tag">Secure Financial Ledger Platform</div>
          </div>
        </div>

        <div className="auth-pitch">
          <h2>Authoritative, Double-Entry Ledger Management</h2>
          <p>
            Architected for rigorous transaction auditing, compliance enforcement,
            and role-segregated financial administration.
          </p>
          <div className="auth-features-list">
            <div className="auth-feature-item">
              <span className="auth-feature-dot" />
              <span>Immutable append-only ledger accounting.</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-dot" />
              <span>Atomic debit/credit transaction processing.</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-dot" />
              <span>Idempotency-based duplicate transaction protection.</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="auth-main-panel">
        <div className="auth-card-container">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;
