import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldX, Home } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { getRoleDashboardRoute } from '../../utils/roleHelpers.js';
import './index.css';

const Unauthorized = () => {
  const { role } = useAuth();
  const homeRoute = getRoleDashboardRoute(role);

  return (
    <div className="unauthorized-page">
      <div className="unauthorized-card">
        <div className="unauthorized-icon-wrapper">
          <ShieldX size={32} />
        </div>
        <h2 className="unauthorized-title">Access Restricted</h2>
        <p className="unauthorized-description">
          You do not possess the institutional permissions or clearance required
          to view this management section. All unauthorized route traversal attempts
          are logged to the system audit register.
        </p>
        <div className="unauthorized-actions">
          <Link
            to={homeRoute}
            className="btn-primary"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
          >
            <Home size={16} />
            <span>Return to Permitted Portal</span>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Unauthorized;
