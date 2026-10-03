import React from 'react';
import ReactDOM from 'react-dom/client';
import AppStartup from './AppStartup';
// Initialize Chart.js components early in the application lifecycle
import './utils/chartConfig';

// Expose dataService globally for debugging in development
if (process.env.NODE_ENV === 'development' && process.env.REACT_APP_CLOUD_SYNC_ENABLED !== 'true') {
  import('./services/dataService').then(({ dataService }) => {
    (window as any).dataService = dataService;
    console.log('💡 DataService is available at window.dataService for debugging');
    console.log('💡 Try: dataService.logTransferMatchingDiagnostic()');
    console.log('💡 Try: dataService.manualCleanupOrphanedMatches()');
    console.log('💡 Try: dataService.forceOrphanedMatchesCleanupOnNextStart()');
  });
}

// Suppress ResizeObserver loop completed with undelivered notifications warnings
// This is a common issue with AgGrid and other components that dynamically resize
const resizeObserverErrorHandler = (e: ErrorEvent) => {
  if (e.message === 'ResizeObserver loop completed with undelivered notifications.') {
    e.stopImmediatePropagation();
    return false;
  }
};

window.addEventListener('error', resizeObserverErrorHandler);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AppStartup />
  </React.StrictMode>
);
