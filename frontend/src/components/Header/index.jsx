import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, ShieldCheck, Building2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import StatusBadge from '../StatusBadge/index.jsx';
import './index.css';

const Header = ({ title = 'Dashboard', breadcrumbs = 'LedgerLine System', onToggleMobile }) => {
  const { user, role } = useAuth();

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  return (
    <header className="header">
      <div className="header-left">
        <button
          type="button"
          className="header-menu-btn"
          onClick={onToggleMobile}
          aria-label="Open navigation menu"
        >
          <Menu size={20} />
        </button>

        {/* Compact Mobile Branding: only shown at mobile viewports */}
        <Link to="/" className="header-mobile-brand" aria-label="LedgerLine Home">
          <div className="header-mobile-brand-icon">
            <Building2 size={18} />
          </div>
          <span className="header-mobile-brand-name">LedgerLine</span>
        </Link>

        {/* Desktop Title & Breadcrumbs: hidden on mobile */}
        <div className="header-title-container">
          <h1 className="header-page-title">{title}</h1>
          <span className="header-breadcrumbs">{breadcrumbs}</span>
        </div>
      </div>

      <div className="header-right">
        {/* Compliance Badge: hidden on mobile */}
        <div className="header-compliance-badge">
          <span className="compliance-pulse-dot" />
          <ShieldCheck size={14} style={{ color: 'var(--success-color)' }} />
          <span>LEDGER VERIFIED</span>
        </div>

        {/* Role Badge: hidden on mobile */}
        {role && (
          <div className="header-desktop-role">
            <StatusBadge status={role} withDot={false} />
          </div>
        )}

        {/* Profile / Avatar Access */}
        <Link to="/profile" className="header-user-btn" aria-label="View Profile">
          <div className="header-avatar-circle">{getInitials(user?.name)}</div>
          <span className="header-user-name">{user?.name?.split(' ')[0] || 'Profile'}</span>
        </Link>
      </div>
    </header>
  );
};

export default Header;
