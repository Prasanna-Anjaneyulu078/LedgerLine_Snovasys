import React from 'react';
import './index.css';

const StatCard = ({ title, value, icon: Icon, subtitle, trend, trendType = 'positive' }) => {
  return (
    <div className="stat-card">
      <div className="stat-card-header">
        <span className="stat-card-title">{title}</span>
        {Icon && (
          <div className="stat-card-icon">
            <Icon size={18} />
          </div>
        )}
      </div>

      <div className="stat-card-value tabular-nums">{value}</div>

      {(subtitle || trend) && (
        <div className="stat-card-footer">
          {trend && (
            <span className={`stat-card-badge stat-card-badge-${trendType}`}>
              {trend}
            </span>
          )}
          {subtitle && <span>{subtitle}</span>}
        </div>
      )}
    </div>
  );
};

export default StatCard;
