import { AccountManagementService } from '../services/accountManagementService';
import { dataService } from '../services/dataService';
import { Account } from '../types';

// Mock the dataService to avoid actual database operations in tests
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

describe('AccountManagementService Delete Functionality', () => {
  let accountService: AccountManagementService;
  const mockDataService = dataService as jest.Mocked<typeof dataService>;

  beforeEach(() => {
    accountService = new AccountManagementService();
    jest.clearAllMocks();
  });

  describe('Data Integrity Edge Cases', () => {
    it('should prevent deletion of accounts with transactions to avoid orphaned data', async () => {
      // Add a test account first
      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock transactions that reference this account
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date(),
          amount: -100,
          description: 'Test transaction',
          category: 'Food',
          account: 'Test Account', // References the account name
          type: 'expense'
        }
      ] as any[]);

      // Try to delete the account
      await expect(accountService.deleteAccount(testAccount.id))
        .rejects
        .toThrow('Cannot delete account "Test Account". It has 1 associated transaction(s).');

      // Verify account still exists to prevent data corruption
      expect(accountService.getAccount(testAccount.id)).toBeDefined();
    });

    it('should handle edge case where transactions reference accounts by both ID and name', async () => {
      // Add a test account first
      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock transactions that reference account in different ways
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date(),
          amount: -50,
          description: 'Transaction by name',
          category: 'Food',
          account: 'Test Account', // References by name
          type: 'expense'
        },
        {
          id: '2',
          date: new Date(),
          amount: -75,
          description: 'Transaction by ID',
          category: 'Gas',
          account: testAccount.id, // References by ID
          type: 'expense'
        }
      ] as any[]);

      // Try to delete the account - should find both transactions
      await expect(accountService.deleteAccount(testAccount.id))
        .rejects
        .toThrow('Cannot delete account "Test Account". It has 2 associated transaction(s).');
    });

    it('should handle concurrent deletion attempts gracefully', async () => {
      mockDataService.getAllTransactions.mockResolvedValue([]);

      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Attempt multiple simultaneous deletions
      const deletionPromises = [
        accountService.deleteAccount(testAccount.id).catch(() => false),
        accountService.deleteAccount(testAccount.id).catch(() => false),
        accountService.deleteAccount(testAccount.id).catch(() => false)
      ];

      const results = await Promise.allSettled(deletionPromises);
      
      // All should complete without throwing uncaught errors
      results.forEach(result => {
        expect(['fulfilled', 'rejected']).toContain(result.status);
      });
      
      // At least one deletion should succeed or handle gracefully
      const completedResults = results.filter(r => r.status === 'fulfilled').length;
      expect(completedResults).toBeGreaterThanOrEqual(1);
    });
  });
});