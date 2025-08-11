import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import AccountsManagement from '../components/Settings/AccountsManagement';
import { accountManagementService } from '../services/accountManagementService';

// Mock the services
jest.mock('../services/accountManagementService');
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn().mockResolvedValue([])
  }
}));
jest.mock('../services/userPreferencesService');

// Test wrapper component
const TestWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <BrowserRouter>
    {children}
  </BrowserRouter>
);

describe('AccountsManagement Loading Behavior', () => {
  beforeEach(() => {
    // Mock the accountManagementService methods
    jest.clearAllMocks();
    
    // Mock accounts with no transactions
    (accountManagementService.getAccounts as jest.Mock).mockReturnValue([
      {
        id: 'test-account',
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      }
    ]);
    
    (accountManagementService.calculateCurrentBalance as jest.Mock).mockResolvedValue(0);
    (accountManagementService.calculateLastUpdatedDate as jest.Mock).mockResolvedValue(null);
  });

  test('should show Loading... for balance and last updated when account has no transactions', async () => {
    // Mock dataService to return no transactions
    const { dataService } = await import('../services/dataService');
    (dataService.getAllTransactions as jest.Mock).mockResolvedValue([]);

    render(
      <TestWrapper>
        <AccountsManagement />
      </TestWrapper>
    );

    // Wait for the component to load and check for Loading... text
    await waitFor(() => {
      const loadingElements = screen.getAllByText('Loading...');
      // Should have at least 2 Loading... elements (Balance and Last Updated columns)
      expect(loadingElements.length).toBeGreaterThanOrEqual(2);
    }, { timeout: 3000 });

    // Verify the account name is displayed
    expect(screen.getByText('Test Account')).toBeInTheDocument();
    
    // Verify that Loading... is displayed instead of actual values
    const loadingElements = screen.getAllByText('Loading...');
    expect(loadingElements.length).toBeGreaterThanOrEqual(2);
  });

  test('should eventually show actual values when account has transactions', async () => {
    // Mock dataService to return some transactions for the account
    const mockTransactions = [
      {
        id: 'tx1',
        account: 'Test Account',
        amount: 100,
        date: '2024-01-01',
        description: 'Test transaction'
      }
    ];
    
    const { dataService } = await import('../services/dataService');
    (dataService.getAllTransactions as jest.Mock).mockResolvedValue(mockTransactions);
    
    // Mock balance and last updated to return actual values
    (accountManagementService.calculateCurrentBalance as jest.Mock).mockResolvedValue(100);
    (accountManagementService.calculateLastUpdatedDate as jest.Mock).mockResolvedValue(new Date('2024-01-01'));

    render(
      <TestWrapper>
        <AccountsManagement />
      </TestWrapper>
    );

    // Wait for the loading to complete and actual values to be displayed
    await waitFor(() => {
      // Should show the balance instead of Loading...
      expect(screen.getByText('$100.00')).toBeInTheDocument();
    }, { timeout: 3000 });

    await waitFor(() => {
      // Should show a date instead of Loading...
      expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});