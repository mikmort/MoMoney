import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Initialize Chart.js components early in the application lifecycle
import './utils/chartConfig';

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
    <App />
  </React.StrictMode>
);
