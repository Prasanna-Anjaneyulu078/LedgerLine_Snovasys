import React from 'react';
import { Building2, ShieldCheck, Lock } from 'lucide-react';
import './index.css';

const AuthLayout = ({ children, title, subtitle }) => {
  return (
    <div className="auth-layout">
      <aside className="auth-sidebar-panel">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <Building2 size={24} />
          </div>
          <div>
            <h1 className="auth-brand-title">LedgerLine</h1>
            <div className="auth-brand-tag">Institutional Financial Core</div>
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
              <span>Immutable append-only ledger accounting</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-dot" />
              <span>Strict atomic debit/credit reconciliation</span>
            </div>
            <div className="auth-feature-item">
              <span className="auth-feature-dot" />
              <span>Cryptographic idempotency protection</span>
            </div>
          </div>
        </div>

        <div className="auth-security-badge">
          <ShieldCheck size={18} style={{ color: 'var(--success-color)' }} />
          <span>FIPS 140-2 Level Ledger Protocol &bull; Audit Sealed</span>
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
