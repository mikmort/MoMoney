import React, { Suspense, useEffect } from 'react';
import { createBrowserRouter, RouterProvider, Navigate, Outlet } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { skipAuthentication } from './config/devConfig';
import { ImportStateProvider } from './contexts/ImportStateContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { NavigationBlocker } from './components/shared/NavigationBlocker';
import { appInitializationService } from './services/appInitializationService';
// Lazy-loaded Components for code splitting
import Navigation from './components/Layout/Navigation';
import { AuthWrapper } from './components/Auth/AuthWrapper';
import DatabaseEventHandler from './components/shared/DatabaseEventHandler';
import ExchangeRateNotifications from './components/shared/ExchangeRateNotifications';
import { GlobalStyles, lightTheme } from './styles/globalStyles';

// Lazy load heavy components to reduce initial bundle size
import { lazyWithRetry } from './utils/lazyWithRetry';
// Force direct import for forensic test of Transactions inclusion
// Point directly to forensic renamed component to test resolution
const Transactions = lazyWithRetry(() => import('./components/Transactions/Transactions'));
const Dashboard = lazyWithRetry(() => import('./components/Dashboard/Dashboard'));
const SubscriptionsReports = lazyWithRetry(() => import('./components/Reports/SubscriptionsReports'));
const Rules = lazyWithRetry(() => import('./components/Rules/Rules'));
const Budgets = lazyWithRetry(() => import('./components/Budgets/Budgets'));
const ReportsLayout = lazyWithRetry(() => import('./components/Reports/ReportsLayout'));
const SpendingReports = lazyWithRetry(() => import('./components/Reports/SpendingReports'));
const IncomeReports = lazyWithRetry(() => import('./components/Reports/IncomeReports'));
const Settings = lazyWithRetry(() => import('./components/Settings/Settings'));
const CategoriesManagement = lazyWithRetry(() => import('./components/Categories/CategoriesManagement'));
const TransferMatchesPage = lazyWithRetry(() => import('./components/Transactions/TransferMatchesPage').then(module => ({ default: module.TransferMatchesPage })));
const Accounts = lazyWithRetry(() => import('./components/Accounts/Accounts'));

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
        <ExchangeRateNotifications />
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
      {
        path: 'reports',
        element: <ReportsLayout />,
        children: [
          { index: true, element: <Navigate to="/reports/spending" replace /> },
          { path: 'spending', element: <SpendingReports /> },
          { path: 'income', element: <IncomeReports /> },
          { path: 'subscriptions', element: <SubscriptionsReports /> },
        ]
      },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

const App: React.FC = () => {
  // Initialize the app on startup - DEFERRED for faster initial render
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('[App] Starting deferred application initialization...');
        const result = await appInitializationService.initialize();
        
        if (result.success) {
          console.log(`[App] ✅ App initialized successfully. Sync: ${result.syncPerformed}, Autosave: ${result.autosaveEnabled}`);
        } else {
          console.error('[App] ❌ App initialization had errors:', result.errors);
        }
      } catch (error) {
        console.error('[App] ❌ App initialization failed:', error);
      }
    };
    
    // Defer initialization to allow initial render to complete first
    // This prevents cloud sync operations from blocking the UI
    const deferredInit = setTimeout(() => {
      initializeApp();
    }, 100); // 100ms delay allows initial render to complete
    
    // Cleanup timeout on unmount
    return () => clearTimeout(deferredInit);
  }, []); // Empty dependency array ensures this runs only once

  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyles />
      <DatabaseEventHandler />
      <ImportStateProvider>
        <NotificationProvider>
          {skipAuthentication ? (
            // Development mode - bypass authentication
            <RouterProvider router={router} future={{ v7_startTransition: true }} />
          ) : (
            // Production mode - use Azure Static Web Apps auth
            <AuthWrapper>
              <RouterProvider router={router} future={{ v7_startTransition: true }} />
            </AuthWrapper>
          )}
        </NotificationProvider>
      </ImportStateProvider>
    </ThemeProvider>
  );
};

export default App;
