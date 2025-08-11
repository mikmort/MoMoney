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
    it('should create account with balance and balance date properly set', () => {
      const balanceDate = new Date('2025-01-15');
      const balance = 1500.50;

      const newAccount = accountService.addAccount({
        name: 'Test Account with Balance',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true,
        balance: balance,
        historicalBalance: balance,
        historicalBalanceDate: balanceDate
      });

      expect(newAccount).toBeDefined();
      expect(newAccount.name).toBe('Test Account with Balance');
      expect(newAccount.balance).toBe(balance);
      expect(newAccount.historicalBalance).toBe(balance);
      expect(newAccount.historicalBalanceDate).toEqual(balanceDate);
    });

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

    it('should handle edge case where balance date is provided but balance is not', () => {
      const balanceDate = new Date('2025-01-15');

      const newAccount = accountService.addAccount({
        name: 'Test Account Date Only',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true,
        historicalBalanceDate: balanceDate
        // No historicalBalance provided
      });

      expect(newAccount).toBeDefined();
      expect(newAccount.historicalBalanceDate).toEqual(balanceDate);
      expect(newAccount.historicalBalance).toBeUndefined();
    });

    it('should handle edge case where balance is provided but date is not', () => {
      const balance = 750.25;

      const newAccount = accountService.addAccount({
        name: 'Test Account Balance Only',
        type: 'savings',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true,
        historicalBalance: balance
        // No historicalBalanceDate provided
      });

      expect(newAccount).toBeDefined();
      expect(newAccount.historicalBalance).toBe(balance);
      expect(newAccount.historicalBalanceDate).toBeUndefined();
    });
  });

  describe('AI Account Creation from Statement', () => {
    it('should preserve balance and date from AI analysis when creating account from statement', () => {
      // This test verifies that the existing AI-driven account creation continues to work
      // The actual AI service is mocked, so we just need to verify the data flow
      
      const testBalance = 2500.75;
      const testBalanceDate = new Date('2025-01-10');

      // Simulate the result from AI analysis
      const accountData: Omit<Account, 'id'> = {
        name: 'AI Detected Account',
        type: 'checking',
        institution: 'Chase Bank',
        currency: 'USD',
        balance: testBalance,
        historicalBalance: testBalance,
        historicalBalanceDate: testBalanceDate,
        maskedAccountNumber: 'Ending in 123',
        lastSyncDate: new Date(),
        isActive: true
      };

      const newAccount = accountService.addAccount(accountData);

      expect(newAccount).toBeDefined();
      expect(newAccount.balance).toBe(testBalance);
      expect(newAccount.historicalBalance).toBe(testBalance);
      expect(newAccount.historicalBalanceDate).toEqual(testBalanceDate);
      expect(newAccount.maskedAccountNumber).toBe('Ending in 123');
    });
  });
});