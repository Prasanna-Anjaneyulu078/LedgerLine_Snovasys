import React from 'react';
import { ShieldCheck, Calendar, User, Mail, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import { ROLE_LABELS } from '../../utils/roleHelpers.js';
import { formatDate } from '../../utils/formatDate.js';
import './index.css';

const Profile = () => {
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
    <DashboardLayout title="Institutional Profile" breadcrumbs="System / Profile">
      <div className="profile-container">
        <div className="profile-card">
          <div className="profile-header-section">
            <div className="profile-avatar-large">{getInitials(user?.name)}</div>
            <div className="profile-title-area">
              <h2 className="profile-name">{user?.name || 'Authorized Member'}</h2>
              <span className="profile-email">{user?.email}</span>
              <div style={{ marginTop: '6px' }}>
                <StatusBadge status={role} />
              </div>
            </div>
          </div>

          <div className="profile-grid">
            <div className="profile-item">
              <span className="profile-label">Institutional Role</span>
              <span className="profile-value">{ROLE_LABELS[role] || role}</span>
            </div>

            <div className="profile-item">
              <span className="profile-label">Account Status</span>
              <div>
                <StatusBadge status={user?.status || 'ACTIVE'} />
              </div>
            </div>

            <div className="profile-item">
              <span className="profile-label">User Identifier</span>
              <span className="profile-value tabular-nums">{user?.id || '—'}</span>
            </div>

            <div className="profile-item">
              <span className="profile-label">Provisioning Date</span>
              <span className="profile-value tabular-nums">
                {formatDate(user?.createdAt, true)}
              </span>
            </div>
          </div>

          <div className="profile-security-box">
            <ShieldCheck size={20} style={{ color: 'var(--success-color)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong style={{ color: 'var(--text-color)', display: 'block', marginBottom: '2px' }}>
                Strict RBAC & Audit Enforcement Active
              </strong>
              Your current session is anchored to institutional identity verification.
              All transactional events, status modifications, and ledger inquiries are
              cryptographically attributed to this user ID.
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Profile;
