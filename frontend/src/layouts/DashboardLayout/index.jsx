import React, { useState } from 'react';
import Sidebar from '../../components/Sidebar/index.jsx';
import Header from '../../components/Header/index.jsx';
import './index.css';

const DashboardLayout = ({ children, title, breadcrumbs }) => {
  const [isMobileOpen, setIsMobileOpen] = useState(false);

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
        <main className="dashboard-content">{children}</main>
      </div>
    </div>
  );
};

export default DashboardLayout;
