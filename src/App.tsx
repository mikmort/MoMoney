import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { MsalProvider } from '@azure/msal-react';
import { PublicClientApplication } from '@azure/msal-browser';
import { msalConfig } from './config/authConfig';
import { ThemeProvider } from 'styled-components';
import { AuthenticatedTemplate, UnauthenticatedTemplate } from '@azure/msal-react';
import { skipAuthentication } from './config/devConfig';

// Components
import Dashboard from './components/Dashboard/Dashboard';
import Transactions from './components/Transactions/Transactions';
import Budgets from './components/Budgets/Budgets';
import Reports from './components/Reports/Reports';
import Settings from './components/Settings/Settings';
import CategoriesManagement from './components/Categories/CategoriesManagement';
import LoginPage from './components/Auth/LoginPage';
import Navigation from './components/Layout/Navigation';
import { GlobalStyles, lightTheme } from './styles/globalStyles';

// Initialize MSAL instance
const msalInstance = new PublicClientApplication(msalConfig);

// Main app content
const AppContent: React.FC = () => (
  <div style={{ display: 'flex', minHeight: '100vh' }}>
    <Navigation />
    <main style={{ flex: 1, padding: '20px', backgroundColor: '#f5f5f5' }}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/categories" element={<CategoriesManagement />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  </div>
);

const App: React.FC = () => {
  return (
    <ThemeProvider theme={lightTheme}>
      <GlobalStyles />
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
