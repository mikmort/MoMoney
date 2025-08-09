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

  describe('deleteAccount', () => {
    it('should successfully delete an account with no transactions', async () => {
      // Mock no transactions for the account
      mockDataService.getAllTransactions.mockResolvedValue([]);

      // Add a test account first
      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Delete the account
      const result = await accountService.deleteAccount(testAccount.id);
      
      expect(result).toBe(true);
      expect(accountService.getAccount(testAccount.id)).toBeUndefined();
    });

    it('should fail to delete an account with associated transactions', async () => {
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

      // Verify account still exists
      expect(accountService.getAccount(testAccount.id)).toBeDefined();
    });

    it('should return false when trying to delete non-existent account', async () => {
      const result = await accountService.deleteAccount('non-existent-id');
      expect(result).toBe(false);
    });

    it('should handle transactions that reference account by ID', async () => {
      // Add a test account first
      const testAccount = accountService.addAccount({
        name: 'Test Account',
        type: 'checking',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      });

      // Mock transactions that reference this account by ID
      mockDataService.getAllTransactions.mockResolvedValue([
        {
          id: '1',
          date: new Date(),
          amount: -100,
          description: 'Test transaction',
          category: 'Food',
          account: testAccount.id, // References the account ID
          type: 'expense'
        }
      ] as any[]);

      // Try to delete the account
      await expect(accountService.deleteAccount(testAccount.id))
        .rejects
        .toThrow('Cannot delete account "Test Account". It has 1 associated transaction(s).');
    });
  });
});