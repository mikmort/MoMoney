import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './config/authConfig';
import { ThemeProvider } from 'styled-components';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { skipAuthentication } from './config/devConfig';
import LoginPage from './components/Auth/LoginPage';
import Navigation from './components/Layout/Navigation';
import { GlobalStyles, lightTheme } from './styles/globalStyles';

// Components - Lazy loaded for better performance
const Dashboard = React.lazy(() => import('./components/Dashboard/Dashboard'));
const Transactions = React.lazy(() => import('./components/Transactions/Transactions'));
const Budgets = React.lazy(() => import('./components/Budgets/Budgets'));
const Reports = React.lazy(() => import('./components/Reports/Reports'));
const Settings = React.lazy(() => import('./components/Settings/Settings'));
const CategoriesManagement = React.lazy(() => import('./components/Categories/CategoriesManagement'));

// Loading component for Suspense fallback
const LoadingSpinner: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '200px' 
  }}>
    <div style={{ fontSize: '18px', color: '#666' }}>Loading...</div>
  </div>
);

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Main app content
const AppContent: React.FC = () => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <Navigation />
    <main style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5' }}>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/categories" element={<CategoriesManagement />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </main>
  </div>
);

const App: React.FC = () => {
  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyles />
      <Router>
        {skipAuthentication ? (
          // Development mode - bypass authentication
          <AppContent />
        ) : (
          // Production mode - use MSAL
          <MsalProvider instance={msalInstance}>
            <AuthenticatedTemplate>
              <AppContent />
            </AuthenticatedTemplate>
            
            <UnauthenticatedTemplate>
              <LoginPage />
            </UnauthenticatedTemplate>
          </MsalProvider>
        )}
      </Router>
    </ThemeProvider>
  );
};

export default App;
