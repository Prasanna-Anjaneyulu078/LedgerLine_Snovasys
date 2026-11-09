import React from 'react';
import { NavLink, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  FileText,
  Users,
  BookOpen,
  ShieldAlert,
  UserCheck,
  LogOut,
  Building2,
  X,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../utils/roleHelpers.js';
import './index.css';

const Sidebar = ({ isMobileOpen, onCloseMobile }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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
    <>
      <div
        className={`sidebar-backdrop ${isMobileOpen ? 'mobile-open' : ''}`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />
      <aside className={`sidebar ${isMobileOpen ? 'mobile-open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-brand-icon">
              <Building2 size={20} />
            </div>
            <div className="sidebar-brand-text">
              <span className="sidebar-brand-name">LedgerLine</span>
              <span className="sidebar-brand-tagline">Institutional Core</span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="sidebar-nav">
          {/* Account Holder Navigation */}
          {role === 'ACCOUNT_HOLDER' && (
            <>
              <NavLink
                to="/dashboard"
                end
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/accounts"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <Wallet size={18} />
                <span>My Accounts</span>
              </NavLink>
              <NavLink
                to="/transactions"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <ArrowLeftRight size={18} />
                <span>Transactions</span>
              </NavLink>
              <NavLink
                to="/statements"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <FileText size={18} />
                <span>Statements</span>
              </NavLink>

              {/* Direct Quick Operations for Account Holder in Mobile Drawer */}
              <div className="sidebar-mobile-operations">
                <span className="sidebar-nav-section-title">Quick Operations</span>
                <NavLink
                  to="/transactions?action=deposit"
                  className="sidebar-nav-item sidebar-op-item"
                  onClick={onCloseMobile}
                >
                  <ArrowDownLeft size={18} />
                  <span>Deposit</span>
                </NavLink>
                <NavLink
                  to="/transactions?action=withdraw"
                  className="sidebar-nav-item sidebar-op-item"
                  onClick={onCloseMobile}
                >
                  <ArrowUpRight size={18} />
                  <span>Withdrawal</span>
                </NavLink>
                <NavLink
                  to="/transactions?action=transfer"
                  className="sidebar-nav-item sidebar-op-item"
                  onClick={onCloseMobile}
                >
                  <ArrowLeftRight size={18} />
                  <span>Money Transfer</span>
                </NavLink>
              </div>
            </>
          )}

          {/* Admin Navigation */}
          {role === 'ADMIN' && (
            <>
              <NavLink
                to="/admin/dashboard"
                end
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/admin/users"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <Users size={18} />
                <span>Users</span>
              </NavLink>
              <NavLink
                to="/admin/accounts"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <Wallet size={18} />
                <span>Accounts</span>
              </NavLink>
              <NavLink
                to="/admin/transactions"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <ArrowLeftRight size={18} />
                <span>Transactions</span>
              </NavLink>
              <NavLink
                to="/admin/ledger"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <BookOpen size={18} />
                <span>Global Ledger</span>
              </NavLink>
              <NavLink
                to="/admin/audit-events"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <ShieldAlert size={18} />
                <span>Audit Events</span>
              </NavLink>
            </>
          )}

          {/* Auditor Navigation */}
          {role === 'AUDITOR' && (
            <>
              <NavLink
                to="/auditor/dashboard"
                end
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <LayoutDashboard size={18} />
                <span>Dashboard</span>
              </NavLink>
              <NavLink
                to="/auditor/ledger"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <BookOpen size={18} />
                <span>Global Ledger</span>
              </NavLink>
              <NavLink
                to="/auditor/transactions"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <ArrowLeftRight size={18} />
                <span>Transactions</span>
              </NavLink>
              <NavLink
                to="/auditor/statements"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <FileText size={18} />
                <span>Statements</span>
              </NavLink>
              <NavLink
                to="/auditor/audit-events"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <ShieldAlert size={18} />
                <span>Audit Events</span>
              </NavLink>
            </>
          )}

          <NavLink
            to="/profile"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
            onClick={onCloseMobile}
          >
            <UserCheck size={18} />
            <span>Profile</span>
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <Link
            to="/profile"
            className="sidebar-user-info"
            onClick={onCloseMobile}
            aria-label="View Profile"
          >
            <div className="sidebar-user-avatar">{getInitials(user?.name)}</div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.name || 'User'}</span>
              <span className="sidebar-user-role">
                {ROLE_LABELS[role] || role}
              </span>
            </div>
          </Link>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out of LedgerLine"
            aria-label="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
