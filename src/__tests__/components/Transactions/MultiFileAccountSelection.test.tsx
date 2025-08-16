import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('Multi-file Account Selection', () => {
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

  it('should require account selection for multi-file upload even with high confidence', async () => {
    // Mock very high confidence detection (>95% threshold)
    mockDetectAccount.mockResolvedValue({
      detectedAccountId: '1',
      confidence: 0.98, // Very high confidence
      reasoning: 'Very high confidence match',
      suggestedAccounts: [{
        accountId: '1',
        confidence: 0.98,
        reasoning: 'Very high confidence match'
      }]
    });

    const { container } = render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create multiple test files
    const file1 = new File(['test,data,1'], 'chase_statement1.csv', { type: 'text/csv' });
    const file2 = new File(['test,data,2'], 'chase_statement2.csv', { type: 'text/csv' });
    
    // Simulate selecting multiple files
    Object.defineProperty(fileInput, 'files', {
      value: [file1, file2],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for account detection to be called for both files
    await waitFor(() => {
      expect(mockDetectAccount).toHaveBeenCalledTimes(2);
    });

    // Should show account selection dialog even with high confidence
    // because it's a multi-file upload
    expect(screen.queryByText(/Select Account for Import/)).toBeInTheDocument();
  });

  it('should auto-assign account for single file with high confidence', async () => {
    // Mock very high confidence detection (>95% threshold)
    mockDetectAccount.mockResolvedValue({
      detectedAccountId: '1',
      confidence: 0.98, // Very high confidence
      reasoning: 'Very high confidence match',
      suggestedAccounts: [{
        accountId: '1',
        confidence: 0.98,
        reasoning: 'Very high confidence match'
      }]
    });

    const { container } = render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create single test file
    const file1 = new File(['test,data,1'], 'chase_statement.csv', { type: 'text/csv' });
    
    // Simulate selecting single file
    Object.defineProperty(fileInput, 'files', {
      value: [file1],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for account detection
    await waitFor(() => {
      expect(mockDetectAccount).toHaveBeenCalledTimes(1);
    });

    // Should NOT show account selection dialog for single file with high confidence
    expect(screen.queryByText(/Select Account for Import/)).not.toBeInTheDocument();
  });

  it('should show account selection for single file with low confidence', async () => {
    // Mock low confidence detection (<95% threshold)
    mockDetectAccount.mockResolvedValue({
      detectedAccountId: '1',
      confidence: 0.75, // Lower confidence
      reasoning: 'Medium confidence match',
      suggestedAccounts: [{
        accountId: '1',
        confidence: 0.75,
        reasoning: 'Medium confidence match'
      }]
    });

    const { container } = render(<FileImport onImportComplete={mockOnImportComplete} />);
    
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();

    // Create single test file
    const file1 = new File(['test,data,1'], 'chase_statement.csv', { type: 'text/csv' });
    
    // Simulate selecting single file
    Object.defineProperty(fileInput, 'files', {
      value: [file1],
      writable: false,
    });

    fireEvent.change(fileInput);

    // Wait for account detection
    await waitFor(() => {
      expect(mockDetectAccount).toHaveBeenCalledTimes(1);
    });

    // Should show account selection dialog for single file with low confidence
    expect(screen.queryByText(/Select Account for Import/)).toBeInTheDocument();
  });
});