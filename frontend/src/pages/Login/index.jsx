import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Lock, AlertCircle, ArrowRight, KeyRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getRoleDashboardRoute } from '../../utils/roleHelpers.js';
import AuthLayout from '../../layouts/AuthLayout/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import './index.css';

const Login = () => {
  const [email, setEmail] = useState('alice@example.com');
  const [password, setPassword] = useState('Alice@123456');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await login(email, password);
    setIsSubmitting(false);

    if (result.success && result.user) {
      // Automatic role-based redirect
      const intendedDestination = location.state?.from?.pathname;
      if (intendedDestination && !intendedDestination.includes('/login')) {
        navigate(intendedDestination, { replace: true });
      } else {
        const dest = getRoleDashboardRoute(result.user.role);
        navigate(dest, { replace: true });
      }
    } else {
      setErrorMsg(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  const handleSelectDemoUser = (demoEmail, demoPassword) => {
    setEmail(demoEmail);
    setPassword(demoPassword);
    setErrorMsg(null);
  };

  return (
    <AuthLayout>
      <div className="login-card">
        <div className="login-header">
          <h2 className="login-title">Sign in to LedgerLine</h2>
          <p className="login-subtitle">
            Enter your credentials to access the institutional ledger system.
          </p>
        </div>

        {errorMsg && (
          <div className="login-error-banner">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <FormInput
            label="Corporate Email Address"
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. yourname@institution.com"
            required
          />

          <FormInput
            label="Password"
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter secure password"
            required
          />

          <button
            type="submit"
            className="login-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Authenticating...'
            ) : (
              <>
                <span>Access Ledger Portal</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer-links">
          <span style={{ color: 'var(--text-secondary)' }}>New Account Holder?</span>
          <Link to="/register" className="login-register-link">
            Create an Account
          </Link>
        </div>

        {/* Evaluation Quick-Fill Credentials */}
        <div className="demo-accounts-section">
          <div className="demo-accounts-title">
            <span>Evaluation Quick-Select Roles</span>
            <KeyRound size={13} />
          </div>
          <div className="demo-account-chips">
            <button
              type="button"
              className="demo-chip"
              onClick={() =>
                handleSelectDemoUser(
                  'alice@example.com',
                  'Alice@123456'
                )
              }
            >
              <span className="demo-chip-name">Alice Sharma</span>
              <span className="demo-chip-role">Account Holder</span>
            </button>
            <button
              type="button"
              className="demo-chip"
              onClick={() =>
                handleSelectDemoUser(
                  'admin@ledgerline.internal',
                  'Admin@123456'
                )
              }
            >
              <span className="demo-chip-name">System Admin</span>
              <span className="demo-chip-role">System Admin</span>
            </button>
            <button
              type="button"
              className="demo-chip"
              onClick={() =>
                handleSelectDemoUser(
                  'auditor@ledgerline.internal',
                  'Auditor@123456'
                )
              }
            >
              <span className="demo-chip-name">Compliance Auditor</span>
              <span className="demo-chip-role">Compliance Auditor</span>
            </button>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
