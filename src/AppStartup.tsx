import React, { Suspense, useEffect, useState } from 'react';
import { ThemeProvider } from 'styled-components';
import { AuthWrapper } from './components/Auth/AuthWrapper';
import { skipAuthentication } from './config/devConfig';
import { NotificationProvider } from './contexts/NotificationContext';
import { appInitializationService, InitializationResult } from './services/appInitializationService';
import { GlobalStyles, lightTheme } from './styles/globalStyles';
import { lazyWithRetry } from './utils/lazyWithRetry';

// Delay module evaluation too: account and transaction services cache data at import time.
const App = lazyWithRetry(() => import('./App'));
const Loading = () => <div role="status" style={{ padding: 24 }}>Loading your data...</div>;

const InitializedApp: React.FC = () => {
  const [result, setResult] = useState<InitializationResult | null>(null);
  useEffect(() => {
    let active = true;
    void appInitializationService.initialize().then(value => {
      if (active) setResult(value);
    });
    return () => { active = false; };
  }, []);

  if (!result) return <Loading />;
  return (
    <>
      {!result.success && (
        <div role="alert" style={{ padding: 16, background: '#fff3cd', color: '#664d03' }}>
          Cloud data could not be loaded. {result.errors.join(' ')} Automatic uploads are paused.
          {' '}<button onClick={() => window.location.reload()}>Retry</button>
          {' '}<a href="/settings">Open Settings</a>
        </div>
      )}
      <Suspense fallback={<Loading />}><App /></Suspense>
    </>
  );
};

const AppStartup: React.FC = () => (
  <ThemeProvider theme={lightTheme}>
    <GlobalStyles />
    <NotificationProvider>
      {skipAuthentication ? <InitializedApp /> : <AuthWrapper><InitializedApp /></AuthWrapper>}
    </NotificationProvider>
  </ThemeProvider>
);

export default AppStartup;
