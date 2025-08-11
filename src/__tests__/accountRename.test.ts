import { AccountManagementService } from '../services/accountManagementService';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Account Rename Integration', () => {
  let accountService: AccountManagementService;

  beforeEach(async () => {
    accountService = new AccountManagementService();
    accountService.clearAllAccounts();
    await dataService.clearAllData();
  });

  test('account renames should be reflected in existing transactions', async () => {
    // Add a test account
    const testAccount = accountService.addAccount({
      name: 'Test Checking Account',
      type: 'checking',
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true
    });

    // Add some transactions for this account
    const transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: -50.00,
        description: 'Grocery Store',
        category: 'groceries',
        account: 'Test Checking Account', // Using account name
        type: 'expense'
      },
      {
        date: new Date('2024-01-16'),
        amount: 1000.00,
        description: 'Salary',
        category: 'income',
        account: 'Test Checking Account', // Using account name
        type: 'income'
      }
    ];

    const addedTransactions = await dataService.addTransactions(transactions);
    expect(addedTransactions).toHaveLength(2);

    // Verify transactions initially show the original account name
    const initialTransactions = await dataService.getAllTransactions();
    expect(initialTransactions).toHaveLength(2);
    expect(initialTransactions[0].account).toBe('Test Checking Account');
    expect(initialTransactions[1].account).toBe('Test Checking Account');

    // Rename the account
    const updatedAccount = await accountService.updateAccount(testAccount.id, {
      name: 'Renamed Checking Account'
    });
    expect(updatedAccount).not.toBeNull();
    expect(updatedAccount!.name).toBe('Renamed Checking Account');

    // Verify transactions now show the new account name
    const transactionsAfterRename = await dataService.getAllTransactions();
    expect(transactionsAfterRename).toHaveLength(2);
    
    // This should pass after our fix
    expect(transactionsAfterRename[0].account).toBe('Renamed Checking Account');
    expect(transactionsAfterRename[1].account).toBe('Renamed Checking Account');
  });

  test('account renames should work with account ID references', async () => {
    // Add a test account
    const testAccount = accountService.addAccount({
      name: 'Test Savings',
      type: 'savings', 
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true
    });

    // Add transaction that references account by ID
    const transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: 500.00,
        description: 'Transfer In',
        category: 'transfer',
        account: testAccount.id, // Using account ID instead of name
        type: 'income'
      }
    ];

    const addedTransactions = await dataService.addTransactions(transactions);
    expect(addedTransactions).toHaveLength(1);

    // Rename the account
    await accountService.updateAccount(testAccount.id, {
      name: 'My Renamed Savings'
    });

    // Transaction should still reference the account ID, but display logic should show new name
    const transactionsAfterRename = await dataService.getAllTransactions();
    expect(transactionsAfterRename).toHaveLength(1);
    // The transaction still has the account ID
    expect(transactionsAfterRename[0].account).toBe(testAccount.id);
    
    // But when we resolve the account name, it should show the new name
    const account = accountService.getAccount(testAccount.id);
    expect(account!.name).toBe('My Renamed Savings');
  });

  test('account renames should handle mixed name and ID references', async () => {
    // Add a test account
    const testAccount = accountService.addAccount({
      name: 'Mixed Reference Account',
      type: 'checking',
      institution: 'Test Bank', 
      currency: 'USD',
      isActive: true
    });

    // Add transactions with both name and ID references
    const transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: -25.00,
        description: 'Coffee Shop',
        category: 'dining',
        account: 'Mixed Reference Account', // Using account name
        type: 'expense'
      },
      {
        date: new Date('2024-01-16'),
        amount: 100.00,
        description: 'ATM Deposit',
        category: 'transfer',
        account: testAccount.id, // Using account ID
        type: 'income'
      }
    ];

    await dataService.addTransactions(transactions);

    // Rename the account
    await accountService.updateAccount(testAccount.id, {
      name: 'Updated Mixed Account'
    });

    // Both transactions should reflect the new account name when displayed
    const transactionsAfterRename = await dataService.getAllTransactions();
    expect(transactionsAfterRename).toHaveLength(2);

    // The transaction that had the account name should be updated to the new name
    const nameTransaction = transactionsAfterRename.find(t => t.description === 'Coffee Shop');
    expect(nameTransaction!.account).toBe('Updated Mixed Account');

    // The transaction that had the account ID should still have the ID
    const idTransaction = transactionsAfterRename.find(t => t.description === 'ATM Deposit');
    expect(idTransaction!.account).toBe(testAccount.id);
  });

  test('resolveAccountName helper function should work correctly', async () => {
    // Add test accounts
    const account1 = accountService.addAccount({
      name: 'Primary Checking',
      type: 'checking',
      institution: 'Bank A',
      currency: 'USD',
      isActive: true
    });

    const account2 = accountService.addAccount({
      name: 'Savings Account',
      type: 'savings',
      institution: 'Bank B',
      currency: 'USD',
      isActive: true
    });

    // Test resolving by name
    expect(accountService.resolveAccountName('Primary Checking')).toBe('Primary Checking');
    expect(accountService.resolveAccountName('Savings Account')).toBe('Savings Account');

    // Test resolving by ID
    expect(accountService.resolveAccountName(account1.id)).toBe('Primary Checking');
    expect(accountService.resolveAccountName(account2.id)).toBe('Savings Account');

    // Test non-existent account (should return original)
    expect(accountService.resolveAccountName('Non-existent Account')).toBe('Non-existent Account');
    expect(accountService.resolveAccountName('fake-id-12345')).toBe('fake-id-12345');

    // Test after rename
    await accountService.updateAccount(account1.id, {
      name: 'Renamed Primary Checking'
    });

    // Should resolve to new name
    expect(accountService.resolveAccountName(account1.id)).toBe('Renamed Primary Checking');
    expect(accountService.resolveAccountName('Renamed Primary Checking')).toBe('Renamed Primary Checking');

    // Old name should not resolve anymore (returns as-is since no match)
    expect(accountService.resolveAccountName('Primary Checking')).toBe('Primary Checking');
  });
});