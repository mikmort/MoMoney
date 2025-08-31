import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Transactions from '../components/Transactions/Transactions';
import { NotificationProvider } from '../contexts/NotificationContext';
import { ImportStateProvider } from '../contexts/ImportStateContext';

// Import mocked hooks and services
import { useCategoriesManager } from '../hooks/useCategoriesManager';
import { useReimbursementMatching } from '../hooks/useReimbursementMatching';
import { useTransferMatching } from '../hooks/useTransferMatching';
import { useAccountManagement } from '../hooks/useAccountManagement';
import { dataService } from '../services/dataService';
import { userPreferencesService } from '../services/userPreferencesService';

// Mock the necessary services
jest.mock('../services/dataService');
jest.mock('../services/budgetService');
jest.mock('../services/rulesService');
jest.mock('../services/azureOpenAIService');
jest.mock('../services/userPreferencesService');
jest.mock('../services/accountManagementService');
jest.mock('../services/fileProcessingService');
jest.mock('../services/currencyDisplayService');
jest.mock('../services/receiptProcessingService');
jest.mock('../hooks/useCategoriesManager');
jest.mock('../hooks/useReimbursementMatching');
jest.mock('../hooks/useTransferMatching');
jest.mock('../hooks/useAccountManagement');

// Mock AgGrid to prevent complex rendering issues
jest.mock('ag-grid-react', () => ({
  AgGridReact: () => {
    const React = require('react');
    return React.createElement('div', { 
      'data-testid': 'transactions-grid',
      className: 'ag-theme-alpine' 
    }, 'Mock Transactions Grid');
  }
}));

const mockUseCategoriesManager = useCategoriesManager as jest.MockedFunction<typeof useCategoriesManager>;
const mockUseReimbursementMatching = useReimbursementMatching as jest.MockedFunction<typeof useReimbursementMatching>;
const mockUseTransferMatching = useTransferMatching as jest.MockedFunction<typeof useTransferMatching>;
const mockUseAccountManagement = useAccountManagement as jest.MockedFunction<typeof useAccountManagement>;
const mockDataService = dataService as jest.Mocked<typeof dataService>;
const mockUserPreferencesService = userPreferencesService as jest.Mocked<typeof userPreferencesService>;

const mockCategories = [
  { id: 'food', name: 'Food & Dining', type: 'expense' as const, icon: '🍽️' },
  { id: 'transport', name: 'Transportation', type: 'expense' as const, icon: '🚗' }
];

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter initialEntries={['/transactions']}>
      <NotificationProvider>
        <ImportStateProvider>
          {component}
        </ImportStateProvider>
      </NotificationProvider>
    </MemoryRouter>
  );
};

describe('Add Transaction Button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup dataService mocks
    mockDataService.getAllTransactions.mockResolvedValue([]);
    mockDataService.getTransactionsWithoutTransfers.mockResolvedValue([]);
    mockDataService.getCollapsedTransfers.mockResolvedValue([]);
    mockDataService.getUndoRedoStatus.mockResolvedValue({ canUndo: false, canRedo: false });
    mockDataService.addTransaction.mockResolvedValue(true);
    mockDataService.updateTransaction.mockResolvedValue(true);
    
    // Setup userPreferencesService mocks
    mockUserPreferencesService.getCurrencyOptions.mockReturnValue([
      { value: 'USD', label: 'US Dollar', symbol: '$' },
      { value: 'EUR', label: 'Euro', symbol: '€' }
    ]);
    mockUserPreferencesService.getDefaultCurrency.mockReturnValue('USD');
    
    // Set up hook mocks
    mockUseCategoriesManager.mockReturnValue({
      categories: mockCategories,
      getAllCategoryOptions: () => mockCategories.map(c => c.name),
      getSubcategories: () => [],
      addCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn(),
      saveCategories: jest.fn()
    });

    mockUseReimbursementMatching.mockReturnValue({
      isLoading: false,
      error: null,
      matches: [],
      findMatches: jest.fn(),
      applyMatches: jest.fn(),
      filterNonReimbursed: (transactions: any[]) => transactions
    });

    mockUseTransferMatching.mockReturnValue({
      getUnmatchedTransfers: jest.fn(() => []),
      countUnmatchedTransfers: jest.fn(() => 0),
      getMatchedTransfers: jest.fn(() => [])
    });

    mockUseAccountManagement.mockReturnValue({
      accounts: [
        { id: 'checking', name: 'Checking Account', type: 'checking' as const },
        { id: 'savings', name: 'Savings Account', type: 'savings' as const }
      ],
      addAccount: jest.fn(),
      deleteAccount: jest.fn(),
      updateAccount: jest.fn(),
      isLoading: false,
      error: null
    });
  });

  test('Add Transaction button exists and opens modal', async () => {
    renderWithProviders(<Transactions />);

    // Wait for component to load and find the Add Transaction button
    const addButton = await screen.findByText('Add Transaction');
    expect(addButton).toBeInTheDocument();

    // Click the Add Transaction button
    fireEvent.click(addButton);

    // Verify modal opens by checking for form fields that should appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Transaction description')).toBeInTheDocument();
    });

    // Verify additional form fields are present  
    expect(screen.getByPlaceholderText('Transaction description')).toHaveValue('');
    expect(screen.getByPlaceholderText('0.00')).toBeInTheDocument();
    
    // Verify Cancel and Add Transaction buttons are in the modal
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    
    // Use getAllByText to find all instances and get the submit button specifically
    const addButtons = screen.getAllByText('Add Transaction');
    const submitButton = addButtons.find(button => button.closest('.form-actions'));
    expect(submitButton).toBeInTheDocument();
  });

  test('Add Transaction modal can be cancelled', async () => {
    renderWithProviders(<Transactions />);

    // Open the modal by clicking the Add Transaction button
    const addButton = await screen.findByText('Add Transaction');
    fireEvent.click(addButton);

    // Verify modal is open by checking for form fields
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Transaction description')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Verify modal is closed by checking that form fields are no longer present
    await waitFor(() => {
      expect(screen.queryByPlaceholderText('Transaction description')).not.toBeInTheDocument();
    });
  });

  test('Add Transaction form validation works', async () => {
    renderWithProviders(<Transactions />);

    // Open the modal
    const addButton = await screen.findByText('Add Transaction');
    fireEvent.click(addButton);

    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Transaction description')).toBeInTheDocument();
    });

    // Try to submit without filling required fields
    // Find the submit button in the modal (not the main button)
    const addButtons = screen.getAllByText('Add Transaction');
    const submitButton = addButtons.find(button => button.closest('.form-actions'));
    expect(submitButton).toBeInTheDocument();
    
    fireEvent.click(submitButton!);

    // Should show validation error (handled by the notification system)
    // The actual error handling is mocked, but we can verify the form doesn't submit
    expect(mockDataService.addTransaction).not.toHaveBeenCalled();
  });
});
