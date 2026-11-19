import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, getDashboardPathByRole } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, authLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (authLoading) {
    return (
      <div className="container page-section">
        <div className="skeleton-box" style={{ height: '180px', marginBottom: '1rem' }} />
        <div className="skeleton-box" style={{ height: '260px' }} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return <Navigate to={getDashboardPathByRole(user.role)} replace />;
  }

  return children;
}
