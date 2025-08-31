import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Transactions from '../components/Transactions/Transactions';
import { NotificationProvider } from '../contexts/NotificationContext';

// Mock the necessary services
jest.mock('../services/dataService');
jest.mock('../services/budgetService');
jest.mock('../hooks/useCategoriesManager');
jest.mock('../hooks/useReimbursementMatching');
jest.mock('../hooks/useTransferMatching');
jest.mock('../hooks/useAccountManagement');

const mockCategories = [
  { id: 'food', name: 'Food & Dining', type: 'expense' as const, icon: '🍽️' },
  { id: 'transport', name: 'Transportation', type: 'expense' as const, icon: '🚗' }
];

// Mock the hooks
const mockUseCategoriesManager = {
  categories: mockCategories,
  getAllCategoryOptions: () => mockCategories,
  getSubcategories: () => []
};

const mockUseReimbursementMatching = {
  isLoading: false,
  error: null,
  matches: [],
  findMatches: jest.fn(),
  applyMatches: jest.fn(),
  filterNonReimbursed: (transactions: any[]) => transactions
};

const mockUseTransferMatching = {
  getUnmatchedTransfers: jest.fn(() => []),
  countUnmatchedTransfers: jest.fn(() => 0),
  getMatchedTransfers: jest.fn(() => [])
};

const mockUseAccountManagement = {
  accounts: [
    { id: 'checking', name: 'Checking Account', type: 'checking' as const },
    { id: 'savings', name: 'Savings Account', type: 'savings' as const }
  ],
  addAccount: jest.fn()
};

require('../hooks/useCategoriesManager').useCategoriesManager = jest.fn(() => mockUseCategoriesManager);
require('../hooks/useReimbursementMatching').useReimbursementMatching = jest.fn(() => mockUseReimbursementMatching);
require('../hooks/useTransferMatching').useTransferMatching = jest.fn(() => mockUseTransferMatching);
require('../hooks/useAccountManagement').useAccountManagement = jest.fn(() => mockUseAccountManagement);

// Mock dataService
const mockDataService = {
  getAllTransactions: jest.fn().mockResolvedValue([]),
  addTransaction: jest.fn().mockResolvedValue(true),
  updateTransaction: jest.fn().mockResolvedValue(true)
};
require('../services/dataService').dataService = mockDataService;

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <MemoryRouter initialEntries={['/transactions']}>
      <NotificationProvider>
        {component}
      </NotificationProvider>
    </MemoryRouter>
  );
};

describe('Add Transaction Button', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('Add Transaction button exists and opens modal', async () => {
    renderWithProviders(<Transactions />);

    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    });

    // Click the Add Transaction button
    const addButton = screen.getByText('Add Transaction');
    fireEvent.click(addButton);

    // Verify modal opens with correct title
    await waitFor(() => {
      expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    });

    // Verify form fields are present and empty
    expect(screen.getByPlaceholderText('Transaction description')).toHaveValue('');
    expect(screen.getByPlaceholderText('0.00')).toHaveValue('');
  });

  test('Add Transaction modal can be cancelled', async () => {
    renderWithProviders(<Transactions />);

    // Open the modal
    const addButton = await screen.findByText('Add Transaction');
    fireEvent.click(addButton);

    // Verify modal is open
    await waitFor(() => {
      expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    });

    // Click cancel
    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    // Verify modal is closed
    await waitFor(() => {
      expect(screen.queryByText('Add Transaction')).not.toBeInTheDocument();
    });
  });

  test('Add Transaction form validation works', async () => {
    renderWithProviders(<Transactions />);

    // Open the modal
    const addButton = await screen.findByText('Add Transaction');
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(screen.getByText('Add Transaction')).toBeInTheDocument();
    });

    // Try to submit without filling required fields
    const submitButton = screen.getByText('Add Transaction', { selector: 'button' });
    fireEvent.click(submitButton);

    // Should show validation error (handled by the notification system)
    // The actual error handling is mocked, but we can verify the form doesn't submit
    expect(mockDataService.addTransaction).not.toHaveBeenCalled();
  });
});
