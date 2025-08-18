/**
 * Simple test to validate basic dataService methods work
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('DataService Basic Tests', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  test('should get unique categories from transactions', async () => {
    // Create test transactions with different categories
    const testTransactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        amount: -100.00,
        description: 'Grocery Store',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        amount: -50.00,
        description: 'Gas Station',
        category: 'Transportation',
        account: 'Chase Credit',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.8
      }
    ];

    await dataService.addTransactions(testTransactions);

    // Test getting unique categories
    const categories = await dataService.getUniqueCategories();
    expect(categories).toContain('Food & Dining');
    expect(categories).toContain('Transportation');

    // Test getting unique accounts
    const accounts = await dataService.getUniqueAccounts();
    expect(accounts).toContain('Chase Checking');
    expect(accounts).toContain('Chase Credit');

    console.log('✅ Basic dataService methods work correctly');
  });
});