import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, ShieldCheck } from 'lucide-react';
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

        <div className="header-title-container">
          <h1 className="header-page-title">{title}</h1>
          <span className="header-breadcrumbs">{breadcrumbs}</span>
        </div>
      </div>

      <div className="header-right">
        <div className="header-compliance-badge">
          <span className="compliance-pulse-dot" />
          <ShieldCheck size={14} style={{ color: 'var(--success-color)' }} />
          <span>LEDGER VERIFIED</span>
        </div>

        {role && (
          <StatusBadge status={role} withDot={false} />
        )}

        <Link to="/profile" className="header-user-btn">
          <div className="header-avatar-circle">{getInitials(user?.name)}</div>
          <span className="header-user-name">{user?.name?.split(' ')[0] || 'Profile'}</span>
        </Link>
      </div>
    </header>
  );
};

export default Header;
