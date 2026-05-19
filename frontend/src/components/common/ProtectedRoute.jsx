// ============================================================
// PROTECTED ROUTE — Authentication guard
//
// Pattern: Higher-Order Component (HOC) for route protection.
// If user is not authenticated: redirect to /login
// If route requires admin but user is not admin: redirect to /dashboard
// If authenticated (and admin if required): render children
//
// The isLoading check prevents a flash of the login page
// while we're restoring auth state from localStorage on refresh.
// ============================================================

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function ProtectedRoute({ children, requireAdmin = false }) {
  const { isAuthenticated, isAdmin, isLoading } = useAuth();

  // Show loading spinner while restoring auth from localStorage
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;
