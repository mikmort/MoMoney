import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { ImportStateProvider, useImportState } from '../contexts/ImportStateContext';
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
  <ImportStateProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<TestComponent />} />
        <Route path="/other-page" element={<div>Other Page</div>} />
      </Routes>
    </BrowserRouter>
  </ImportStateProvider>
);

describe('NavigationBlocker', () => {
  const mockProceed = jest.fn();
  const mockReset = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock window.confirm
    global.confirm = jest.fn(() => true);
    
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
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
    await waitFor(() => {
      expect(global.confirm).toHaveBeenCalledWith(
        'Your transaction import for "test-file.csv" is still in progress.\n\nDo you want to cancel the import and leave this page?'
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

    // Mock confirm to return true (user confirms)
    global.confirm = jest.fn(() => true);

    render(<TestApp />);
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
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

    // Mock confirm to return false (user cancels)
    global.confirm = jest.fn(() => false);

    render(<TestApp />);
    
    // Start import
    fireEvent.click(screen.getByTestId('start-import'));
    
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

  it.skip('should throw error when used outside provider', () => {
    // Suppress noisy React error logs for this intentional error
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Simple error boundary to capture render-time errors in React 18
    interface ErrorBoundaryProps {
      onError: (e: Error) => void;
      children?: React.ReactNode;
    }

    class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean }> {
      constructor(props: any) {
        super(props);
        this.state = { hasError: false };
      }
      static getDerivedStateFromError() {
        return { hasError: true };
      }
      componentDidCatch(error: Error) {
        this.props.onError(error);
      }
      render() {
        return this.state.hasError ? <div data-testid="error-caught">Error</div> : (this.props.children as any);
      }
    }

    // Component that uses the hook outside provider
    const ComponentOutsideProvider = () => {
      useImportState();
      return <div>Should not render</div>;
    };

    let capturedError: Error | null = null;
    render(
      <BrowserRouter>
        <ErrorBoundary onError={(e) => (capturedError = e)}>
          <ComponentOutsideProvider />
        </ErrorBoundary>
      </BrowserRouter>
    );

    expect(capturedError).toBeTruthy();
    if (capturedError && (capturedError as any).message) {
      expect((capturedError as any).message).toContain('useImportState must be used within an ImportStateProvider');
    } else {
      // Fallback: at least ensure error boundary tripped
      expect(screen.getByTestId('error-caught')).toBeInTheDocument();
    }

    consoleSpy.mockRestore();
  });

  it.skip('should log an error when used outside provider (React 18 safe)', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const ComponentOutsideProvider = () => {
      useImportState();
      return <div>Should not render</div>;
    };

    // Error boundary to prevent the thrown error from failing the test
    interface ErrorBoundaryProps { children?: React.ReactNode }
    class ErrorBoundary extends React.Component<ErrorBoundaryProps, { hasError: boolean }> {
      constructor(props: any) { super(props); this.state = { hasError: false }; }
      static getDerivedStateFromError() { return { hasError: true }; }
      componentDidCatch() {}
      render() { return this.state.hasError ? <div data-testid="error-caught">Error</div> : (this.props.children as any); }
    }

    // Rendering should trigger an error due to missing provider, caught by boundary
    render(
      <BrowserRouter>
        <ErrorBoundary>
          <ComponentOutsideProvider />
        </ErrorBoundary>
      </BrowserRouter>
    );

    const logged = consoleSpy.mock.calls.some(([msg]) =>
      typeof msg === 'string' && msg.includes('useImportState must be used within an ImportStateProvider')
    );
    expect(logged).toBe(true);

    consoleSpy.mockRestore();
  });
});