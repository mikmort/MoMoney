import React from 'react';
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ImportStateProvider, useImportState } from '../contexts/ImportStateContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { NavigationBlocker } from '../components/shared/NavigationBlocker';

// Mock the entire react-router-dom module
jest.mock('react-router-dom', () => {
  const actualRouter = jest.requireActual('react-router-dom');
  return {
    ...actualRouter,
    useBlocker: jest.fn()
  };
});

// Get the mock function
const mockUseBlocker = jest.mocked(require('react-router-dom').useBlocker);

// Test component that uses import state
const TestComponent: React.FC = () => {
  const { isImporting, setIsImporting } = useImportState();
  const navigate = useNavigate();

  return (
    <div>
      <NavigationBlocker />
      <div data-testid="import-status">
        {isImporting ? 'Importing' : 'Not importing'}
      </div>
      <button 
        onClick={() => setIsImporting(true, 'test-file.csv')}
        data-testid="start-import"
      >
        Start Import
      </button>
      <button 
        onClick={() => setIsImporting(false)}
        data-testid="stop-import"
      >
        Stop Import
      </button>
      <button 
        onClick={() => navigate('/other-page')}
        data-testid="navigate-button"
      >
        Navigate Away
      </button>
    </div>
  );
};

const TestApp: React.FC = () => (
  <NotificationProvider>
    <ImportStateProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TestComponent />} />
          <Route path="/other-page" element={<div>Other Page</div>} />
        </Routes>
      </BrowserRouter>
    </ImportStateProvider>
  </NotificationProvider>
);

describe('NavigationBlocker', () => {
  const mockProceed = jest.fn();
  const mockReset = jest.fn();
  const mockShowConfirmation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock the notification hook - ensure showConfirmation returns a Promise
    jest.spyOn(require('../contexts/NotificationContext'), 'useNotification').mockReturnValue({
      showAlert: jest.fn(),
      showConfirmation: mockShowConfirmation.mockResolvedValue(true) // Default to true
    });
    
    // Mock window.addEventListener and removeEventListener
    global.addEventListener = jest.fn();
    global.removeEventListener = jest.fn();
    
    // Default mock for useBlocker - unblocked state
    mockUseBlocker.mockReturnValue({
      state: 'unblocked' as const,
      proceed: mockProceed,
      reset: mockReset
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call useBlocker with false when not importing', () => {
    render(<TestApp />);
    
    expect(screen.getByTestId('import-status')).toHaveTextContent('Not importing');
    expect(mockUseBlocker).toHaveBeenCalledWith(false);
  });

  it('should call useBlocker with true when importing', () => {
    render(<TestApp />);
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
    expect(screen.getByTestId('import-status')).toHaveTextContent('Importing');
    expect(mockUseBlocker).toHaveBeenCalledWith(true);
  });

  it('should show confirmation dialog when navigation is blocked', async () => {
    // Mock blocked state
    mockUseBlocker.mockReturnValue({
      state: 'blocked' as const,
      proceed: mockProceed,
      reset: mockReset
    });

    render(<TestApp />);
    
    // Start import to trigger blocking
    fireEvent.click(screen.getByTestId('start-import'));
    
    await waitFor(() => {
      expect(mockShowConfirmation).toHaveBeenCalledWith(
        'Your transaction import for "test-file.csv" is still in progress.\n\nDo you want to cancel the import and leave this page?',
        {
          title: 'Cancel Import?',
          confirmText: 'Leave Page',
          cancelText: 'Continue Import',
          danger: true
        }
      );
    });
  });

  it('should proceed with navigation when user confirms', async () => {
    // Mock blocked state
    mockUseBlocker.mockReturnValue({
      state: 'blocked' as const,
      proceed: mockProceed,
      reset: mockReset
    });

    // Mock showConfirmation to resolve with true (user confirms)
    mockShowConfirmation.mockResolvedValue(true);

    render(<TestApp />);
    
    // Start import to trigger blocking
    fireEvent.click(screen.getByTestId('start-import'));
    
    // Wait for the confirmation to be called and resolved
    await waitFor(() => {
      expect(mockShowConfirmation).toHaveBeenCalled();
    });
    
    await waitFor(() => {
      expect(mockProceed).toHaveBeenCalled();
    });
    
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('should reset navigation when user cancels', async () => {
    // Mock blocked state
    mockUseBlocker.mockReturnValue({
      state: 'blocked' as const,
      proceed: mockProceed,
      reset: mockReset
    });

    // Mock showConfirmation to resolve with false (user cancels)
    mockShowConfirmation.mockResolvedValue(false);

    render(<TestApp />);
    
    // Start import to trigger blocking
    fireEvent.click(screen.getByTestId('start-import'));
    
    // Wait for the confirmation to be called and resolved
    await waitFor(() => {
      expect(mockShowConfirmation).toHaveBeenCalled();
    });
    
    await waitFor(() => {
      expect(mockReset).toHaveBeenCalled();
    });
    
    expect(mockProceed).not.toHaveBeenCalled();
  });

  it('should add beforeunload event listener when importing', () => {
    render(<TestApp />);
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
    expect(global.addEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
  });

  it('should remove beforeunload event listener when not importing', () => {
    render(<TestApp />);
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
    // Stop import
    fireEvent.click(screen.getByTestId('stop-import'));
    
    expect(global.removeEventListener).toHaveBeenCalledWith(
      'beforeunload',
      expect.any(Function)
    );
  });
});

describe('ImportStateContext', () => {
  beforeEach(() => {
    // Reset useBlocker mock for context tests
    mockUseBlocker.mockReturnValue({
      state: 'unblocked' as const,
      proceed: jest.fn(),
      reset: jest.fn()
    });
  });

  it('should provide import state and update functions', () => {
    render(<TestApp />);
    
    // Initially not importing
    expect(screen.getByTestId('import-status')).toHaveTextContent('Not importing');
    
    // Start importing
    fireEvent.click(screen.getByTestId('start-import'));
    expect(screen.getByTestId('import-status')).toHaveTextContent('Importing');
    
    // Stop importing
    fireEvent.click(screen.getByTestId('stop-import'));
    expect(screen.getByTestId('import-status')).toHaveTextContent('Not importing');
  });

  it('should throw error when used outside provider', () => {
    // Test the hook behavior directly using renderHook
    const { result } = renderHook(() => {
      try {
        return useImportState();
      } catch (error) {
        return error;
      }
    });

    expect(result.current).toBeInstanceOf(Error);
    expect((result.current as Error).message).toContain('useImportState must be used within an ImportStateProvider');
  });

  it('should work correctly when used inside provider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ImportStateProvider>{children}</ImportStateProvider>
    );

    const { result } = renderHook(() => useImportState(), { wrapper });

    expect(result.current).toHaveProperty('isImporting', false);
    expect(result.current).toHaveProperty('importingFileName', null);
    expect(result.current).toHaveProperty('setIsImporting');
    expect(typeof result.current.setIsImporting).toBe('function');
  });

});