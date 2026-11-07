import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getRoleDashboardRoute } from '../../utils/roleHelpers.js';
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

  const { login, user, isAuthenticated, authError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // If already authenticated and not experiencing a session error, navigate to appropriate dashboard
  React.useEffect(() => {
    if (isAuthenticated && user && !authError) {
      const intendedDestination = location.state?.from?.pathname;
      if (intendedDestination && isSafeInternalPath(intendedDestination) && !intendedDestination.includes('/login')) {
        navigate(intendedDestination, { replace: true });
      } else {
        const dest = getRoleDashboardRoute(user.role);
        navigate(dest, { replace: true });
      }
    }
  }, [isAuthenticated, user, authError, navigate, location.state]);

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
      // Automatic role-based redirect with internal path validation
      const intendedDestination = location.state?.from?.pathname;
      if (intendedDestination && isSafeInternalPath(intendedDestination) && !intendedDestination.includes('/login')) {
        navigate(intendedDestination, { replace: true });
      } else {
        const dest = getRoleDashboardRoute(result.user.role);
        navigate(dest, { replace: true });
      }
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
          <div className="login-error-banner">
            <AlertCircle size={16} />
            <span>{activeError}</span>
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
                <span>Sign In</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="login-footer-links">
          <span style={{ color: 'var(--text-secondary)' }}>Don't have an account?</span>
          <Link to="/register" className="login-register-link">
            Create an Account
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Login;
