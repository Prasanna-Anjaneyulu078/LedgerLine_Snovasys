import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { getRoleDashboardRoute } from '../utils/roleHelpers.js';

// Common pages
import Login from '../pages/Login/index.jsx';
import Register from '../pages/Register/index.jsx';
import Profile from '../pages/Profile/index.jsx';
import Unauthorized from '../pages/Unauthorized/index.jsx';

// Account Holder pages
import Dashboard from '../pages/Dashboard/index.jsx';
import Accounts from '../pages/Accounts/index.jsx';
import Transactions from '../pages/Transactions/index.jsx';
import Statements from '../pages/Statements/index.jsx';

// Admin pages
import AdminDashboard from '../pages/AdminDashboard/index.jsx';
import Users from '../pages/Users/index.jsx';
import AccountManagement from '../pages/AccountManagement/index.jsx';
import Ledger from '../pages/Ledger/index.jsx';
import AuditEvents from '../pages/AuditEvents/index.jsx';

// Auditor pages
import AuditorDashboard from '../pages/AuditorDashboard/index.jsx';

// Route Guards
import ProtectedRoute from './ProtectedRoute.jsx';
import RoleBasedRoute from './RoleBasedRoute.jsx';

const RootRedirect = () => {
  const { isAuthenticated, role, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', color: '#64748B' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <p>Verifying institutional credentials...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Navigate to={getRoleDashboardRoute(role)} replace />;
};

const AppRoutes = () => {
  return (
    <Routes>
      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* Public Auth Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Shared Protected Profile */}
      <Route
        path="/profile"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />

      {/* Account Holder Routes */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ACCOUNT_HOLDER']}>
              <Dashboard />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ACCOUNT_HOLDER']}>
              <Accounts />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/transactions"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ACCOUNT_HOLDER']}>
              <Transactions />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statements"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ACCOUNT_HOLDER']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statements/:accountId"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ACCOUNT_HOLDER']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/users"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <Users />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/accounts"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <AccountManagement />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/transactions"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <Transactions />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/ledger"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <Ledger />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/audit-events"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <AuditEvents />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/statements"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/statements/:accountId"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['ADMIN']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />

      {/* Auditor Routes */}
      <Route
        path="/auditor/dashboard"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <AuditorDashboard />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor/ledger"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <Ledger />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor/transactions"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <Transactions />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor/statements"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor/statements/:accountId"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <Statements />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />
      <Route
        path="/auditor/audit-events"
        element={
          <ProtectedRoute>
            <RoleBasedRoute allowedRoles={['AUDITOR']}>
              <AuditEvents />
            </RoleBasedRoute>
          </ProtectedRoute>
        }
      />

      {/* Catch-all redirect to root */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default AppRoutes;
