import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './config/authConfig';
import { ThemeProvider } from 'styled-components';
import { skipAuthentication } from './config/devConfig';
// Lazy-loaded Components for code splitting
import Navigation from './components/Layout/Navigation';
import LoginPage from './components/Auth/LoginPage';
import { GlobalStyles, lightTheme } from './styles/globalStyles';

// Lazy load heavy components to reduce initial bundle size
import { lazyWithRetry } from './utils/lazyWithRetry';
const Dashboard = lazyWithRetry(() => import('./components/Dashboard/Dashboard'));
const Transactions = lazyWithRetry(() => import('./components/Transactions/Transactions'));
const Rules = lazyWithRetry(() => import('./components/Rules/Rules'));
const Budgets = lazyWithRetry(() => import('./components/Budgets/Budgets'));
const Reports = lazyWithRetry(() => import('./components/Reports/Reports'));
const Settings = lazyWithRetry(() => import('./components/Settings/Settings'));
const CategoriesManagement = lazyWithRetry(() => import('./components/Categories/CategoriesManagement'));
const TransferMatchesPage = lazyWithRetry(() => import('./components/Transactions/TransferMatchesPage').then(module => ({ default: module.TransferMatchesPage })));
const Accounts = lazyWithRetry(() => import('./components/Accounts/Accounts'));

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Loading component for Suspense fallback
const LoadingFallback: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '200px',
    fontSize: '16px',
    color: '#666'
  }}>
    Loading...
  </div>
);

// Main app content with Suspense boundaries
const AppContent: React.FC = () => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <Navigation />
    <main style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5' }}>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/rules" element={<Rules />} />
          <Route path="/accounts" element={<Accounts />} />
          <Route path="/transfer-matches" element={<TransferMatchesPage />} />
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
