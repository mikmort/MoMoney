import { render, screen } from '@testing-library/react';
import { FileImport } from '../../../components/Transactions/FileImport';
import { useAccountManagement } from '../../../hooks/useAccountManagement';
import { useImportState } from '../../../contexts/ImportStateContext';

// Mock the dependencies
jest.mock('../../../hooks/useAccountManagement');
jest.mock('../../../contexts/ImportStateContext');
jest.mock('../../../services/fileProcessingService');
jest.mock('../../../data/defaultCategories', () => ({
  defaultCategories: []
}));

const mockUseAccountManagement = useAccountManagement as jest.MockedFunction<typeof useAccountManagement>;
const mockUseImportState = useImportState as jest.MockedFunction<typeof useImportState>;

describe('MultiFileImport', () => {
  const mockOnImportComplete = jest.fn();
  const mockDetectAccount = jest.fn();
  const mockAddAccount = jest.fn();
  const mockSetIsImporting = jest.fn();

  beforeEach(() => {
    mockUseAccountManagement.mockReturnValue({
      accounts: [
        { id: '1', name: 'Chase Checking', type: 'checking', institution: 'Chase', currency: 'USD', isActive: true },
        { id: '2', name: 'AmEx Credit', type: 'credit', institution: 'American Express', currency: 'USD', isActive: true }
      ],
      detectAccount: mockDetectAccount,
      addAccount: mockAddAccount,
      isLoading: false,
      error: null,
      refreshAccounts: jest.fn(),
      updateAccount: jest.fn(),
      deleteAccount: jest.fn(),
      setDefaultAccount: jest.fn()
    });

    mockUseImportState.mockReturnValue({
      isImporting: false,
      currentFileName: null,
      setIsImporting: mockSetIsImporting
    });

    // Clear all mocks
    jest.clearAllMocks();
  });

  it('should show updated text for multiple file support', () => {
    render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    // Check that the UI text has been updated for multiple files
    expect(screen.getByText('Drop your files here or click to browse')).toBeInTheDocument();
    expect(screen.getByText(/supports multiple files/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Choose Files/ })).toBeInTheDocument();
  });

  it('should support multiple file selection via file input', () => {
    render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('multiple');
  });

  it('should have the multiple attribute on the file input element', () => {
    const { container } = render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toHaveAttribute('multiple');
    expect(fileInput).toHaveAttribute('accept', '.csv,.xlsx,.xls,.ofx,.pdf');
  });

  it('should display proper supported formats text', () => {
    render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    expect(screen.getByText(/Supported formats:/)).toBeInTheDocument();
    expect(screen.getByText(/CSV, Excel \(\.xlsx, \.xls\), OFX, PDF/)).toBeInTheDocument();
  });
});