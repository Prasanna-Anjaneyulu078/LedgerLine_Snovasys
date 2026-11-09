import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from '../../components/Sidebar/index.jsx';
import Header from '../../components/Header/index.jsx';
import './index.css';

const DashboardLayout = ({ children, title, breadcrumbs }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer whenever user navigates to a new route or query param
  useEffect(() => {
    setIsMobileOpen(false);
  }, [location.pathname, location.search]);

  // Prevent background scrolling while the mobile drawer is open
  useEffect(() => {
    if (isMobileOpen) {
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
    } else {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
    };
  }, [isMobileOpen]);

  return (
    <div className="dashboard-layout">
      <Sidebar
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />
      <div className="dashboard-main">
        <Header
          title={title}
          breadcrumbs={breadcrumbs}
          onToggleMobile={() => setIsMobileOpen(!isMobileOpen)}
        />
        <main className="dashboard-content">
          {title && (
            <div className="mobile-page-header">
              {breadcrumbs && (
                <span className="mobile-page-breadcrumbs">{breadcrumbs}</span>
              )}
              <h1 className="mobile-page-title">{title}</h1>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;
