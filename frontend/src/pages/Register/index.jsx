import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getRoleDashboardRoute } from '../../utils/roleHelpers.js';
import AuthLayout from '../../layouts/AuthLayout/index.jsx';
import FormInput from '../../components/FormInput/index.jsx';
import './index.css';

const PASSWORD_COMPLEXITY_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { register, user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, navigate to permitted dashboard
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate(getRoleDashboardRoute(user.role), { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

  // If session is restoring from persistent cookie, display loading screen
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setErrorMsg('All registration fields are required.');
      return;
    }

    if (trimmedName.length < 2) {
      setErrorMsg('Full name must be at least 2 characters.');
      return;
    }

    if (!EMAIL_REGEX.test(trimmedEmail)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please retype carefully.');
      return;
    }

    if (!PASSWORD_COMPLEXITY_REGEX.test(password)) {
      setErrorMsg(
        'Password must contain at least 8 characters with at least one uppercase letter, one lowercase letter, one number, and one special character.'
      );
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const result = await register(trimmedName, trimmedEmail, password);
    setIsSubmitting(false);

    if (result.success) {
      navigate(getRoleDashboardRoute(result.user?.role || 'ACCOUNT_HOLDER'), { replace: true });
    } else {
      setErrorMsg(result.error || 'Registration failed.');
    }
  };

  return (
    <AuthLayout>
      <div className="register-card">
        <div className="register-header">
          <h2 className="register-title">Register Account Holder</h2>
          <p className="register-subtitle">
            Open a verified institutional account profile.
          </p>
        </div>

        <div className="register-notice">
          <Shield size={16} style={{ color: 'var(--primary-color)' }} />
          <span>
            Institutional role assigned automatically: <strong>Account Holder</strong>.
          </span>
        </div>

        {errorMsg && (
          <div className="register-error-banner">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <FormInput
            label="Full Name"
            id="register-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Anand Mahindra"
            required
          />

          <FormInput
            label="Email Address"
            id="register-email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. anand@company.in"
            required
          />

          <FormInput
            label="Create Password"
            id="register-password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters (upper, lower, digit, symbol)"
            required
            showPasswordToggle
          />

          <FormInput
            label="Confirm Password"
            id="register-confirm-password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            required
            showPasswordToggle
          />

          <button
            type="submit"
            className="register-submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              'Creating Ledger Profile...'
            ) : (
              <>
                <span>Complete Registration</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <div className="register-footer-links">
          <span style={{ color: 'var(--text-secondary)' }}>Already registered?</span>
          <Link to="/login" className="register-login-link">
            Sign In Here
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
};

export default Register;
