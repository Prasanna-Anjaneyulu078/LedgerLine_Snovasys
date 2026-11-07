import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
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

  const { register, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  // If already authenticated, navigate to dashboard
  React.useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, user, navigate]);

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
      navigate('/dashboard', { replace: true });
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
