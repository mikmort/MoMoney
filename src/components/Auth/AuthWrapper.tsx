import React from 'react';
import { useAppAuth } from '../../hooks/useAppAuth';
import LoginPage from './LoginPage';

interface AuthWrapperProps {
  children: React.ReactNode;
}

/**
 * Authentication wrapper for Azure Static Web Apps
 * Replaces MSAL AuthenticatedTemplate/UnauthenticatedTemplate
 */
export const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAppAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        fontSize: '1.1rem',
        color: '#666'
      }}>
        Loading...
      </div>
    );
  }

  // Show login page if not authenticated
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // Show main app if authenticated
  return <>{children}</>;
};