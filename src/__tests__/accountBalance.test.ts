import { AccountManagementService } from '../services/accountManagementService';

// Mock the dataService to provide controlled test data
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

// Import the mocked dataService
const mockDataService = require('../services/dataService').dataService;

describe('Account Balance Calculation', () => {
  let accountService: AccountManagementService;

  beforeEach(() => {
    accountService = new AccountManagementService();
    jest.clearAllMocks();
  });

  describe('calculateCurrentBalance', () => {
    it('should calculate balance from all transactions when no historical balance exists', async () => {
      // Add a test account
      const testAccount = accountService.addAccount({
        name: 'Test Checking',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock transactions for this account
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date('2025-01-01'),
          amount: 100,
          description: 'Initial deposit',
          category: 'Income',
          account: 'Test Checking',
          type: 'income'
        },
        {
          id: '2',
          date: new Date('2025-01-02'),
          amount: -25,
          description: 'Expense',
          category: 'Food',
          account: 'Test Checking',
          type: 'expense'
        }
      ]);

      const balance = await accountService.calculateCurrentBalance(testAccount.id);

      expect(balance).toBe(75); // 100 - 25 = 75
    });

    it('should calculate balance from historical baseline when available', async () => {
      // Add account with historical balance
      const testAccount = accountService.addAccount({
        name: 'Test Savings',
        type: 'savings',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true,
        historicalBalance: 1000,
        historicalBalanceDate: new Date('2025-01-01')
      });

      // Mock transactions after the historical date
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date('2024-12-31'), // Before historical date - should be ignored
          amount: -500,
          description: 'Old transaction',
          category: 'Expense',
          account: 'Test Savings',
          type: 'expense'
        },
        {
          id: '2',
          date: new Date('2025-01-02'), // After historical date - should be included
          amount: 200,
          description: 'New deposit',
          category: 'Income',
          account: 'Test Savings',
          type: 'income'
        }
      ]);

      const balance = await accountService.calculateCurrentBalance(testAccount.id);

      expect(balance).toBe(1200); // 1000 (historical) + 200 (new transaction) = 1200
    });
  });

  describe('calculateLastUpdatedDate', () => {
    it('should return the most recent transaction date', async () => {
      // Add a test account
      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock transactions with different dates
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date('2025-01-01'),
          amount: 100,
          description: 'Old transaction',
          category: 'Income',
          account: 'Test Account',
          type: 'income'
        },
        {
          id: '2',
          date: new Date('2025-01-15'), // Most recent
          amount: -25,
          description: 'Recent transaction',
          category: 'Food',
          account: 'Test Account',
          type: 'expense'
        },
        {
          id: '3',
          date: new Date('2025-01-10'),
          amount: -50,
          description: 'Middle transaction',
          category: 'Gas',
          account: 'Test Account',
          type: 'expense'
        }
      ]);

      const lastUpdated = await accountService.calculateLastUpdatedDate(testAccount.id);

      expect(lastUpdated).toEqual(new Date('2025-01-15'));
    });

    it('should return null when account has no transactions', async () => {
      // Add a test account
      const testAccount = accountService.addAccount({
        name: 'Empty Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock no transactions for this account
      mockDataService.getAllTransactions.mockResolvedValue([]);

      const lastUpdated = await accountService.calculateLastUpdatedDate(testAccount.id);

      expect(lastUpdated).toBeNull();
    });
  });
});