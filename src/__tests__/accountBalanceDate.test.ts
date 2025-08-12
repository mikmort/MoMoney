import { AccountManagementService } from '../services/accountManagementService';
import { Account } from '../types';

// Mock the dataService to provide controlled test data
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

// Import the mocked dataService
const mockDataService = require('../services/dataService').dataService;

describe('Account Balance Date Feature', () => {
  let accountService: AccountManagementService;

  beforeEach(() => {
    accountService = new AccountManagementService();
    jest.clearAllMocks();
  });

  describe('Account Creation with Balance Date', () => {
    it('should calculate current balance correctly using historical balance and date', async () => {
      const historicalDate = new Date('2025-01-01');
      const historicalBalance = 1000;

      // Create account with historical balance
      const testAccount = accountService.addAccount({
        name: 'Historical Balance Account',
        type: 'savings',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true,
        historicalBalance: historicalBalance,
        historicalBalanceDate: historicalDate
      });

      // Mock transactions - some before historical date (should be ignored), some after (should be included)
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date('2024-12-30'), // Before historical date - should be ignored
          amount: -200,
          description: 'Old transaction before balance date',
          category: 'Expense',
          account: 'Historical Balance Account',
          type: 'expense'
        },
        {
          id: '2',
          date: new Date('2025-01-02'), // After historical date - should be included
          amount: 300,
          description: 'Deposit after balance date',
          category: 'Income',
          account: 'Historical Balance Account',
          type: 'income'
        },
        {
          id: '3',
          date: new Date('2025-01-05'), // After historical date - should be included
          amount: -50,
          description: 'Expense after balance date',
          category: 'Food',
          account: 'Historical Balance Account',
          type: 'expense'
        }
      ]);

      const currentBalance = await accountService.calculateCurrentBalance(testAccount.id);

      // Expected: 1000 (historical) + 300 (deposit) - 50 (expense) = 1250
      // The -200 transaction should be ignored because it's before the historical balance date
      expect(currentBalance).toBe(1250);
    });

    it('should handle accounts without historical balance by using all transactions', async () => {
      // Create account without historical balance
      const testAccount = accountService.addAccount({
        name: 'No Historical Balance Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
        // No historicalBalance or historicalBalanceDate
      });

      // Mock all transactions for this account
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date('2024-12-30'),
          amount: 500,
          description: 'Initial deposit',
          category: 'Income',
          account: 'No Historical Balance Account',
          type: 'income'
        },
        {
          id: '2',
          date: new Date('2025-01-02'),
          amount: -100,
          description: 'Purchase',
          category: 'Shopping',
          account: 'No Historical Balance Account',
          type: 'expense'
        }
      ]);

      const currentBalance = await accountService.calculateCurrentBalance(testAccount.id);

      // Expected: 500 - 100 = 400 (all transactions included)
      expect(currentBalance).toBe(400);
    });

  });
});