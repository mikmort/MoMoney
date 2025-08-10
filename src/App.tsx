import React, { Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { MsalProvider, AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './config/authConfig';
import { ThemeProvider } from 'styled-components';
import { skipAuthentication } from './config/devConfig';
import { ImportStateProvider } from './contexts/ImportStateContext';
import { NavigationBlocker } from './components/shared/NavigationBlocker';
// Lazy-loaded Components for code splitting
import Navigation from './components/Layout/Navigation';
import LoginPage from './components/Auth/LoginPage';
import DatabaseEventHandler from './components/shared/DatabaseEventHandler';
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

// Root layout for Data Router with Suspense + Outlet
const RootLayout: React.FC = () => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <Navigation />
    <main style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5' }}>
      <Suspense fallback={<LoadingFallback />}>
        <NavigationBlocker />
        <Outlet />
      </Suspense>
    </main>
  </div>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'transactions', element: <Transactions /> },
      { path: 'rules', element: <Rules /> },
      { path: 'accounts', element: <Accounts /> },
      { path: 'transfer-matches', element: <TransferMatchesPage /> },
      { path: 'categories', element: <CategoriesManagement /> },
      { path: 'budgets', element: <Budgets /> },
      { path: 'reports', element: <Reports /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const App: React.FC = () => {
  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyles />
      <DatabaseEventHandler />
      <ImportStateProvider>
        {skipAuthentication ? (
          // Development mode - bypass authentication
          <RouterProvider router={router} future={{ v7_startTransition: true }} />
        ) : (
          // Production mode - use MSAL
          <MsalProvider instance={msalInstance}>
            <AuthenticatedTemplate>
              <RouterProvider router={router} future={{ v7_startTransition: true }} />
            </AuthenticatedTemplate>
            <UnauthenticatedTemplate>
              <LoginPage />
            </UnauthenticatedTemplate>
          </MsalProvider>
        )}
      </ImportStateProvider>
    </ThemeProvider>
  );
};

export default App;
