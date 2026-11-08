import React, { useState, useEffect } from 'react';
import { ShieldCheck, Calendar, User, Mail, Shield, Wallet } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import authService from '../../services/authService.js';
import DashboardLayout from '../../layouts/DashboardLayout/index.jsx';
import StatusBadge from '../../components/StatusBadge/index.jsx';
import { ROLE_LABELS } from '../../utils/roleHelpers.js';
import { formatDate } from '../../utils/formatDate.js';
import { formatCurrency } from '../../utils/formatCurrency.js';
import LoadingState from '../../components/LoadingState/index.jsx';
import './index.css';

const Profile = () => {
  const { user: authUser, role } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchFreshProfile = async () => {
      try {
        const data = await authService.getCurrentUser();
        if (isMounted && data) {
          setProfileData(data);
        }
      } catch (err) {
        console.warn('Unable to load fresh profile from /auth/me:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    fetchFreshProfile();
    return () => {
      isMounted = false;
    };
  }, []);

  const user = profileData?.user || authUser;
  const accounts = profileData?.accounts || [];

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
        {isLoading ? (
          <LoadingState message="Loading verified identity credentials from ledger..." />
        ) : (
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
                  <StatusBadge status={user?.status || (user?.isActive ? 'ACTIVE' : 'SUSPENDED')} />
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

            {/* Associated Accounts Section */}
            {accounts.length > 0 && (
              <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color)' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-secondary)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wallet size={15} />
                  <span>Associated Depository Accounts ({accounts.length})</span>
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
                  {accounts.map((acc) => (
                    <div key={acc.id} style={{ padding: '0.75rem 1rem', background: 'var(--surface-secondary)', borderRadius: 'var(--border-radius-sm)', border: '1px solid var(--border-color)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-color)' }}>{acc.account_number || acc.accountNumber}</span>
                        <StatusBadge status={acc.status || 'ACTIVE'} />
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{acc.account_type || acc.accountType || 'SAVINGS'} • {acc.currency || 'INR'}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="profile-security-box">
              <ShieldCheck size={20} style={{ color: 'var(--success-color)', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <strong style={{ color: 'var(--text-color)', display: 'block', marginBottom: '2px' }}>
                  Strict RBAC & Audit Enforcement Active
                </strong>
                Your current session is anchored to institutional identity verification via PostgreSQL.
                All transactional events, status modifications, and ledger inquiries are
                cryptographically attributed to this user ID.
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Profile;
