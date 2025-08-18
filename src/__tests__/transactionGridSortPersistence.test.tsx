import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { NotificationProvider } from '../contexts/NotificationContext';
import { ImportStateProvider } from '../contexts/ImportStateContext';
import Transactions from '../components/Transactions/Transactions';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

// Mock external dependencies
jest.mock('../services/dataService');
jest.mock('../services/rulesService');
jest.mock('../services/azureOpenAIService');
jest.mock('../services/userPreferencesService');
jest.mock('../services/accountManagementService');
jest.mock('../services/fileProcessingService');
jest.mock('../services/currencyDisplayService');
jest.mock('../services/receiptProcessingService');

// Mock hooks
jest.mock('../hooks/useCategoriesManager');
jest.mock('../hooks/useReimbursementMatching');
jest.mock('../hooks/useTransferMatching');
jest.mock('../hooks/useAccountManagement');

// Import mocked hooks
import { useCategoriesManager } from '../hooks/useCategoriesManager';
import { useReimbursementMatching } from '../hooks/useReimbursementMatching';
import { useTransferMatching } from '../hooks/useTransferMatching';
import { useAccountManagement } from '../hooks/useAccountManagement';

const mockUseCategoriesManager = useCategoriesManager as jest.MockedFunction<typeof useCategoriesManager>;
const mockUseReimbursementMatching = useReimbursementMatching as jest.MockedFunction<typeof useReimbursementMatching>;
const mockUseTransferMatching = useTransferMatching as jest.MockedFunction<typeof useTransferMatching>;
const mockUseAccountManagement = useAccountManagement as jest.MockedFunction<typeof useAccountManagement>;

const mockDataService = dataService as jest.Mocked<typeof dataService>;

// Import and mock currencyDisplayService
import { currencyDisplayService } from '../services/currencyDisplayService';
const mockCurrencyDisplayService = currencyDisplayService as jest.Mocked<typeof currencyDisplayService>;

// Mock transactions with different descriptions to test sorting
const mockTransactions: Transaction[] = [
  {
    id: '1',
    date: '2024-01-15',
    description: 'Zebra Store Purchase',
    amount: -50.00,
    category: 'Shopping',
    account: 'Checking',
    type: 'expense',
    currency: 'USD',
    verified: false
  },
  {
    id: '2', 
    date: '2024-01-14',
    description: 'Apple Store Purchase',
    amount: -100.00,
    category: 'Shopping',
    account: 'Checking',
    type: 'expense',
    currency: 'USD',
    verified: false
  },
  {
    id: '3',
    date: '2024-01-13',
    description: 'Bank Transfer',
    amount: 200.00,
    category: 'Transfer',
    account: 'Checking',
    type: 'income',
    currency: 'USD',
    verified: false
  }
];

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>
    <NotificationProvider>
      <ImportStateProvider>
        {children}
      </ImportStateProvider>
    </NotificationProvider>
  </BrowserRouter>
);

describe('Transaction Grid Sort Persistence', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup basic mocks
    mockDataService.getAllTransactions.mockResolvedValue(mockTransactions);
    mockDataService.getTransactionsWithoutTransfers.mockResolvedValue(mockTransactions);
    mockDataService.getCollapsedTransfers.mockResolvedValue([]);
    mockDataService.getUndoRedoStatus.mockResolvedValue({ canUndo: false, canRedo: false });
    
    // Mock hooks
    mockUseCategoriesManager.mockReturnValue({
      categories: [
        { id: '1', name: 'Shopping', type: 'expense', color: '#FF0000', subcategories: [] },
        { id: '2', name: 'Transfer', type: 'income', color: '#00FF00', subcategories: [] }
      ],
      getAllCategoryOptions: () => ['Shopping', 'Transfer'],
      getSubcategories: () => [],
      isLoading: false,
      error: null,
      refreshCategories: jest.fn(),
      getCategoryById: jest.fn(),
      createCategory: jest.fn(),
      updateCategory: jest.fn(),
      deleteCategory: jest.fn()
    });
    
    mockUseReimbursementMatching.mockReturnValue({
      isLoading: false,
      error: null,
      matches: [],
      findMatches: jest.fn(),
      applyMatches: jest.fn(),
      filterNonReimbursed: jest.fn()
    });
    
    mockUseTransferMatching.mockReturnValue({
      isLoading: false,
      error: null,
      potentialMatches: [],
      findPotentialMatches: jest.fn(),
      applyTransferMatch: jest.fn(),
      unmatchTransfers: jest.fn(),
      getUnmatchedTransfers: jest.fn().mockReturnValue([]),
      countUnmatchedTransfers: jest.fn().mockReturnValue(0),
      getMatchedTransfers: jest.fn().mockReturnValue([])
    });
    
    mockUseAccountManagement.mockReturnValue({
      accounts: [],
      isLoading: false,
      error: null,
      refreshAccounts: jest.fn(),
      getAccountById: jest.fn(),
      createAccount: jest.fn(),
      updateAccount: jest.fn(),
      deleteAccount: jest.fn(),
      getAccountOptions: () => ['Checking'],
      detectAccountsFromTransactions: jest.fn()
    });

    // Mock currencyDisplayService
    mockCurrencyDisplayService.initialize.mockResolvedValue();
    mockCurrencyDisplayService.getDefaultCurrency.mockResolvedValue('USD');
    mockCurrencyDisplayService.formatTransactionAmount.mockImplementation((transaction: any) => 
      Promise.resolve({
        displayAmount: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(transaction.amount),
        isConverted: false
      })
    );
  });

  it('should preserve sort order when clicking checkboxes', async () => {
    // Render the Transactions component
    render(
      <TestWrapper>
        <Transactions />
      </TestWrapper>
    );

    // Wait for transactions to load
    await waitFor(() => {
      expect(screen.getByText('Zebra Store Purchase')).toBeInTheDocument();
    });

    // Find the AgGrid container
    const gridContainer = document.querySelector('.ag-theme-alpine');
    expect(gridContainer).toBeInTheDocument();

    // Wait a bit more for the grid to be fully initialized
    await waitFor(() => {
      // Look for grid rows
      const rows = document.querySelectorAll('.ag-row');
      expect(rows.length).toBeGreaterThan(0);
    }, { timeout: 5000 });

    // Get the initial order by checking the first row's description
    const firstRowDescriptionCell = document.querySelector('.ag-row[row-index="0"] [col-id="description"]');
    const initialFirstDescription = firstRowDescriptionCell?.textContent;
    
    // Sort by description column - click the header
    const descriptionHeader = document.querySelector('.ag-header-cell[col-id="description"]');
    expect(descriptionHeader).toBeInTheDocument();
    
    fireEvent.click(descriptionHeader!);
    
    // Wait for sort to complete
    await waitFor(() => {
      const sortedFirstRowDescriptionCell = document.querySelector('.ag-row[row-index="0"] [col-id="description"]');
      const sortedFirstDescription = sortedFirstRowDescriptionCell?.textContent;
      // After sorting by description, "Apple Store Purchase" should be first (alphabetically)
      expect(sortedFirstDescription).toBe('Apple Store Purchase');
    });

    // Now click a checkbox to select a row
    const checkbox = document.querySelector('.ag-selection-checkbox input');
    expect(checkbox).toBeInTheDocument();
    
    fireEvent.click(checkbox!);

    // Wait a moment for any potential re-rendering
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check that the sort order is still maintained
    const afterSelectionFirstRowDescriptionCell = document.querySelector('.ag-row[row-index="0"] [col-id="description"]');
    const afterSelectionFirstDescription = afterSelectionFirstRowDescriptionCell?.textContent;
    
    // The sort order should NOT have changed - Apple Store should still be first
    expect(afterSelectionFirstDescription).toBe('Apple Store Purchase');
    
    // Also verify the checkbox is actually selected
    expect(checkbox).toBeChecked();
  });

  it('should not trigger data reload when selecting rows', async () => {
    const getAllTransactionsSpy = jest.spyOn(mockDataService, 'getAllTransactions');
    
    // Render the component
    render(
      <TestWrapper>
        <Transactions />
      </TestWrapper>
    );

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByText('Zebra Store Purchase')).toBeInTheDocument();
    });

    // Clear the spy after initial load
    getAllTransactionsSpy.mockClear();

    // Wait for grid to be ready and click a checkbox
    await waitFor(() => {
      const checkbox = document.querySelector('.ag-selection-checkbox input');
      expect(checkbox).toBeInTheDocument();
      fireEvent.click(checkbox!);
    });

    // Wait a moment for any potential side effects
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify that getAllTransactions was NOT called again after checkbox click
    expect(getAllTransactionsSpy).not.toHaveBeenCalled();
  });
});