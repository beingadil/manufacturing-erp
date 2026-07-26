import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Loader2 } from 'lucide-react';

interface RouteGuardProps {
  children: React.ReactNode;
  requireModule?: string;
  requireAction?: string;
}

export function RouteGuard({ children, requireModule, requireAction }: RouteGuardProps) {
  const { user, isLoading, hasPermission, isAdmin } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireModule && requireAction && !isAdmin) {
    if (!hasPermission(requireModule, requireAction)) {
      // Forbidden, redirect to dashboard
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
}
