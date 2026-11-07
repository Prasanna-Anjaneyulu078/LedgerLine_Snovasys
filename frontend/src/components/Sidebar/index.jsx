import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS } from '../../utils/roleHelpers.js';
import './index.css';

const Sidebar = ({ isMobileOpen, onCloseMobile }) => {
  const { user, role, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
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
          {isMobileOpen && (
            <button
              type="button"
              className="sidebar-logout-btn"
              onClick={onCloseMobile}
              aria-label="Close menu"
            >
              <X size={20} />
            </button>
          )}
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
                to="/statements/acc_001"
                className={({ isActive }) =>
                  `sidebar-nav-item ${isActive ? 'active' : ''}`
                }
                onClick={onCloseMobile}
              >
                <FileText size={18} />
                <span>Statements</span>
              </NavLink>
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
                to="/auditor/statements/acc_001"
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
          <div className="sidebar-user-info">
            <div className="sidebar-user-avatar">{getInitials(user?.name)}</div>
            <div className="sidebar-user-details">
              <span className="sidebar-user-name">{user?.name || 'User'}</span>
              <span className="sidebar-user-role">
                {ROLE_LABELS[role] || role}
              </span>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-logout-btn"
            onClick={handleLogout}
            title="Sign out of LedgerLine"
            aria-label="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
