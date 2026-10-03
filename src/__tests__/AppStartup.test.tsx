import React from 'react';
import { act, render, screen } from '@testing-library/react';
import AppStartup from '../AppStartup';
import { appInitializationService, InitializationResult } from '../services/appInitializationService';

let mockAuthenticated = true;
const mockAppLoaded = jest.fn();
jest.mock('../config/devConfig', () => ({ skipAuthentication: false }));
jest.mock('../components/Auth/AuthWrapper', () => ({
  AuthWrapper: ({ children }: { children: React.ReactNode }) => mockAuthenticated ? <>{children}</> : <div>Sign in first</div>
}));
jest.mock('../services/appInitializationService', () => ({
  appInitializationService: { initialize: jest.fn() }
}));
jest.mock('../App', () => {
  mockAppLoaded();
  return { __esModule: true, default: () => <div>Accounts loaded</div> };
});

beforeEach(() => {
  jest.clearAllMocks();
  mockAuthenticated = true;
});

test('authentication and cloud hydration finish before the application module is loaded', async () => {
  let finish!: (result: InitializationResult) => void;
  jest.mocked(appInitializationService.initialize).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mockAuthenticated = false;
  const { rerender } = render(<AppStartup />);
  expect(screen.getByText('Sign in first')).toBeInTheDocument();
  expect(appInitializationService.initialize).not.toHaveBeenCalled();
  expect(mockAppLoaded).not.toHaveBeenCalled();

  mockAuthenticated = true;
  rerender(<AppStartup />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading your data');
  expect(screen.queryByText('Accounts loaded')).not.toBeInTheDocument();
  expect(mockAppLoaded).not.toHaveBeenCalled();
  await act(async () => finish({ success: true, syncPerformed: true, autosaveEnabled: false, errors: [] }));
  expect(await screen.findByText('Accounts loaded')).toBeInTheDocument();
  expect(mockAppLoaded).toHaveBeenCalledTimes(1);
});

test('startup failures display a persistent warning while allowing local data and Settings', async () => {
  jest.mocked(appInitializationService.initialize).mockResolvedValue({
    success: false, syncPerformed: false, autosaveEnabled: false, errors: ['offline']
  });
  render(<AppStartup />);
  expect(await screen.findByText('Accounts loaded')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('offline');
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Settings' })).toHaveAttribute('href', '/settings');
});
