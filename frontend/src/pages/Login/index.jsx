import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getRoleDashboardRoute, isRouteAllowedForRole } from '../../utils/roleHelpers.js';
import AuthLayout from '../../layouts/AuthLayout/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import './index.css';

const isSafeInternalPath = (path) =>
  typeof path === 'string' &&
  path.startsWith('/') &&
  !path.startsWith('//') &&
  !path.includes('\\') &&
  !path.includes(':');

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { login, user, isAuthenticated, isLoading, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const getPermittedDestination = (intended, role) => {
    if (intended && isSafeInternalPath(intended) && isRouteAllowedForRole(intended, role)) {
      return intended;
    }
    return getRoleDashboardRoute(role);
  };

  // If already authenticated and not experiencing a session error, navigate to permitted dashboard
  useEffect(() => {
    if (isAuthenticated && user && !authError) {
      const intendedDestination = location.state?.from?.pathname;
      const targetRoute = getPermittedDestination(intendedDestination, user.role);
      navigate(targetRoute, { replace: true });
    }
  }, [isAuthenticated, user, authError, navigate, location.state]);

  // If session is restoring from persistent cookie, display loading screen so login form never flashes
  if (isLoading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC' }}>
        <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', color: '#64748B' }}>
          <div style={{ width: '32px', height: '32px', border: '3px solid #E2E8F0', borderTopColor: '#2563EB', borderRadius: '50%', margin: '0 auto 12px', animation: 'spin 0.8s linear infinite' }} />
          <p>Verifying session credentials...</p>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  const activeError = errorMsg || authError;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await login(trimmedEmail, password);
    setIsSubmitting(false);

    if (result.success && result.user) {
      // Automatic role-based redirect with internal path clearance
      const intendedDestination = location.state?.from?.pathname;
      const targetRoute = getPermittedDestination(intendedDestination, result.user.role);
      navigate(targetRoute, { replace: true });
    } else {
      setErrorMsg(result.error || 'Authentication failed. Please verify credentials.');
    }
  };

  return (
    <AuthLayout>
      <div className="login-card">
        <div className="login-header">
          <h2 className="login-title">Welcome back</h2>
          <p className="login-subtitle">
            Enter your credentials to access the institutional ledger system.
          </p>
        </div>

        {activeError && (
          <div className="login-error-banner" role="alert">
            <AlertCircle size={16} />
            <span>{activeError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <FormInput
            label="Email Address"
            id="login-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. yourname@institution.com"
            required
            autoComplete="email"
          />

          <FormInput
            label="Password"
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter secure password"
            required
            showPasswordToggle
            autoComplete="current-password"
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
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer-links">
          <span className="login-footer-text">Don't have an account?</span>
          <Link to="/register" className="login-register-link">
            Create an Account
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
