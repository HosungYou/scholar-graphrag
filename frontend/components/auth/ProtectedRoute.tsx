'use client';

/**
 * Protected route wrapper component.
 * 
 * Redirects unauthenticated users to login page.
 */

import React, { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requireEmailVerification?: boolean;
}

export function ProtectedRoute({ 
  children, 
  redirectTo = '/auth/login',
  requireEmailVerification = false
}: ProtectedRouteProps) {
  const { user, isLoading, isConfigured } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Don't redirect while still loading
    if (isLoading) return;
    
    // If auth is not configured, allow access (for development)
    if (!isConfigured) return;
    
    // Redirect if not authenticated
    if (!user) {
      router.push(redirectTo);
      return;
    }

    // Check email verification if required
    if (requireEmailVerification && !user.email_confirmed_at) {
      router.push('/auth/verify-email');
    }
  }, [user, isLoading, isConfigured, router, redirectTo, requireEmailVerification]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // If auth not configured, render children (development mode)
  if (!isConfigured) {
    return <>{children}</>;
  }

  // If not authenticated, don't render (redirect will happen)
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  // Render protected content
  return <>{children}</>;
}

/**
 * Higher-order component for protected pages.
 */
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'> = {}
) {
  return function ProtectedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}
