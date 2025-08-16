import { AccountManagementService } from '../services/accountManagementService';
import { dataService } from '../services/dataService';
import { Account } from '../types';

// Mock the dataService to avoid actual database operations in tests
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

describe('Duplicate Account Issue - GitHub Issue #375', () => {
  let accountService: AccountManagementService;
  const mockDataService = dataService as jest.Mocked<typeof dataService>;

  beforeEach(() => {
    // Create fresh service instance for each test
    accountService = new AccountManagementService();
    // Clear all accounts to start fresh
    accountService.clearAllAccounts();
    jest.clearAllMocks();
    // Mock no transactions by default
    mockDataService.getAllTransactions.mockResolvedValue([]);
  });

  describe('Reproduce Duplicate Account Behavior', () => {
    it('should prevent creation of duplicate accounts with same ID', () => {
      const accountData = {
        name: 'Chase Checking',
        type: 'checking' as const,
        institution: 'Chase Bank',
        currency: 'USD',
        isActive: true
      };

      // Add the account first time
      const account1 = accountService.addAccount(accountData);
      expect(account1.id).toBe('chase-bank-chase-checking-checking');

      // Try to add the same account again - should return the existing account
      const account2 = accountService.addAccount(accountData);

      const allAccounts = accountService.getAccounts();
      const accountIds = allAccounts.map(a => a.id);
      
      console.log('Account IDs after adding duplicate:', accountIds);
      console.log('Account 1 ID:', account1.id);
      console.log('Account 2 ID:', account2.id);

      // Fixed behavior: should return the same account object or same ID
      expect(account1.id).toBe(account2.id);
      expect(allAccounts.length).toBe(1); // Should only have one account
      
      console.log('✅ FIXED: Duplicate account prevention working correctly');
    });

    it('should handle deletion of duplicate accounts properly', async () => {
      const accountData = {
        name: 'Chase Savings',
        type: 'savings' as const,
        institution: 'Chase Bank',
        currency: 'USD',
        isActive: true
      };

      // Try to create duplicates (should be prevented now)
      const account1 = accountService.addAccount(accountData);
      const account2 = accountService.addAccount(accountData);

      const allAccountsBefore = accountService.getAccounts();
      console.log('Accounts before deletion:', allAccountsBefore.length);

      // Should only have one account due to duplicate prevention
      expect(allAccountsBefore.length).toBe(1);

      // Try to delete the account
      const deleteSuccess = await accountService.deleteAccount(account1.id);
      expect(deleteSuccess).toBe(true);

      const allAccountsAfter = accountService.getAccounts();
      console.log('Accounts after deletion:', allAccountsAfter.length);

      // Should have no accounts left
      expect(allAccountsAfter.length).toBe(0);
      
      const remainingAccountsWithSameId = allAccountsAfter.filter(a => a.id === account1.id);
      console.log('Remaining accounts with same ID after deletion:', remainingAccountsWithSameId.length);
      
      expect(remainingAccountsWithSameId.length).toBe(0);
      console.log('✅ FIXED: Account deletion works correctly');
    });

    it('should demonstrate the "adding one creates two" issue', () => {
      const accountData = {
        name: 'Wells Fargo Checking',
        type: 'checking' as const,
        institution: 'Wells Fargo',
        currency: 'USD',
        isActive: true
      };

      // Simulate the scenario where user had duplicates, deleted them,
      // but adding one back creates two again - this should now be fixed
      
      // First, try to create duplicates (should prevent them now)
      const account1 = accountService.addAccount(accountData);
      const account2 = accountService.addAccount(accountData);

      let allAccounts = accountService.getAccounts();
      console.log('Initial accounts created:', allAccounts.length);
      
      // Should only have one account now (duplicate prevention working)
      expect(allAccounts.length).toBe(1);

      // Now clear all accounts (simulate user deleting all)
      accountService.clearAllAccounts();
      allAccounts = accountService.getAccounts();
      expect(allAccounts.length).toBe(0);

      // Now add one account back
      const newAccount = accountService.addAccount(accountData);
      allAccounts = accountService.getAccounts();

      console.log('Accounts after re-adding one:', allAccounts.length);
      console.log('New account ID:', newAccount.id);

      // Should have exactly one account
      expect(allAccounts.length).toBe(1);
      expect(allAccounts[0].id).toBe(newAccount.id);
      expect(newAccount.id).toBe('wells-fargo-wells-fargo-checking-checking');
      
      console.log('✅ FIXED: Adding one account creates exactly one account');
    });
  });

  describe('Edge Cases for Account ID Generation', () => {
    it('should handle accounts with identical names and institutions but different properties', () => {
      const baseAccountData = {
        name: 'Primary Account',
        institution: 'Test Bank',
        currency: 'USD',
        isActive: true
      };

      const account1 = accountService.addAccount({
        ...baseAccountData,
        type: 'checking' as const
      });

      const account2 = accountService.addAccount({
        ...baseAccountData,
        type: 'savings' as const
      });

      console.log('Account 1 ID:', account1.id);
      console.log('Account 2 ID:', account2.id);

      // These should now have different IDs because the account type is included
      expect(account1.id).toBe('test-bank-primary-account-checking');
      expect(account2.id).toBe('test-bank-primary-account-savings');
      expect(account1.id).not.toBe(account2.id);
      
      console.log('✅ FIXED: Different account types generate unique IDs');
    });

    it('should handle special characters in account names that could affect ID generation', () => {
      const specialCharNames = [
        'Account & Savings',
        'Account #1',
        'Account (Primary)',
        'Account - Business',
        'Account_Personal'
      ];

      const accountIds: string[] = [];

      for (const name of specialCharNames) {
        const account = accountService.addAccount({
          name,
          type: 'checking',
          institution: 'Test Bank',
          currency: 'USD',
          isActive: true
        });
        
        accountIds.push(account.id);
        console.log(`"${name}" -> ID: "${account.id}"`);
      }

      // Check for any duplicate IDs
      const uniqueIds = new Set(accountIds);
      if (uniqueIds.size !== accountIds.length) {
        console.log('❌ ISSUE: Special characters causing ID collisions');
        console.log('IDs:', accountIds);
        console.log('Unique IDs:', Array.from(uniqueIds));
      }

      expect(uniqueIds.size).toBe(accountIds.length);
    });
  });
});