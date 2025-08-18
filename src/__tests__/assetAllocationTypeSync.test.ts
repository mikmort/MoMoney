import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Asset Allocation Category and Type Synchronization', () => {
  beforeEach(async () => {
    // Clear any existing data
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  afterEach(async () => {
    // Clean up
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  it('should update type to "asset-allocation" when category changes to "Asset Allocation"', async () => {
    // Create a test transaction that's initially an expense
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase',
      amount: -1000.00,
      category: 'Shopping',
      subcategory: 'General',
      account: 'Investment Account',
      type: 'expense'
    });

    expect(transaction.type).toBe('expense');
    expect(transaction.category).toBe('Shopping');

    // Change category to Asset Allocation
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('asset-allocation');
    expect(updatedTransaction!.category).toBe('Asset Allocation');
  });

  it('should update type to "expense" when negative amount transaction changes from "Asset Allocation" to another category', async () => {
    // Create a test transaction that's initially an asset allocation
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase - AAPL',
      amount: -500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'asset-allocation'
    });

    expect(transaction.type).toBe('asset-allocation');
    expect(transaction.category).toBe('Asset Allocation');

    // Change category away from Asset Allocation
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Food',
      subcategory: 'Groceries'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('expense');
    expect(updatedTransaction!.category).toBe('Food');
  });

  it('should update type to "income" when positive amount transaction changes from "Asset Allocation" to another category', async () => {
    // Create a test transaction that's initially an asset allocation (positive amount, like a stock sale)
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Sale - GOOGL',
      amount: 1500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Sale',
      account: 'Investment Account',
      type: 'asset-allocation'
    });

    expect(transaction.type).toBe('asset-allocation');
    expect(transaction.category).toBe('Asset Allocation');

    // Change category away from Asset Allocation
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Income',
      subcategory: 'Salary'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('income');
    expect(updatedTransaction!.category).toBe('Income');
  });

  it('should not change type when category changes but neither old nor new category is "Asset Allocation"', async () => {
    // Create a test transaction that's an expense
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Restaurant Purchase',
      amount: -25.00,
      category: 'Food',
      subcategory: 'Restaurants',
      account: 'Credit Card',
      type: 'expense'
    });

    expect(transaction.type).toBe('expense');
    expect(transaction.category).toBe('Food');

    // Change category to another non-asset-allocation category
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Entertainment',
      subcategory: 'Movies'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('expense'); // Should remain the same
    expect(updatedTransaction!.category).toBe('Entertainment');
  });

  it('should work correctly with batchUpdateTransactions for asset allocation changes', async () => {
    // Create multiple test transactions
    const transaction1 = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase 1',
      amount: -1000.00,
      category: 'Shopping',
      subcategory: 'General',
      account: 'Investment Account',
      type: 'expense'
    });

    const transaction2 = await dataService.addTransaction({
      date: new Date('2024-01-02'),
      description: 'Stock Purchase 2',
      amount: -2000.00,
      category: 'Shopping',
      subcategory: 'General',
      account: 'Investment Account',
      type: 'expense'
    });

    // Batch update both to Asset Allocation
    const updatedTransactions = await dataService.batchUpdateTransactions([
      {
        id: transaction1.id,
        updates: {
          category: 'Asset Allocation',
          subcategory: 'Stock Purchase'
        },
        note: 'Batch categorization to Asset Allocation'
      },
      {
        id: transaction2.id,
        updates: {
          category: 'Asset Allocation',
          subcategory: 'Stock Purchase'
        },
        note: 'Batch categorization to Asset Allocation'
      }
    ]);

    expect(updatedTransactions).toHaveLength(2);
    expect(updatedTransactions[0].type).toBe('asset-allocation');
    expect(updatedTransactions[1].type).toBe('asset-allocation');
    expect(updatedTransactions[0].category).toBe('Asset Allocation');
    expect(updatedTransactions[1].category).toBe('Asset Allocation');
  });

  it('should work correctly with batchUpdateTransactions when changing from asset allocation', async () => {
    // Create multiple test transactions as asset allocation
    const transaction1 = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase 1',
      amount: -1000.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'asset-allocation'
    });

    const transaction2 = await dataService.addTransaction({
      date: new Date('2024-01-02'),
      description: 'Stock Sale 2',
      amount: 2000.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Sale',
      account: 'Investment Account',
      type: 'asset-allocation'
    });

    // Batch update both away from Asset Allocation
    const updatedTransactions = await dataService.batchUpdateTransactions([
      {
        id: transaction1.id,
        updates: {
          category: 'Food',
          subcategory: 'Groceries'
        },
        note: 'Batch recategorization from Asset Allocation'
      },
      {
        id: transaction2.id,
        updates: {
          category: 'Income',
          subcategory: 'Salary'
        },
        note: 'Batch recategorization from Asset Allocation'
      }
    ]);

    expect(updatedTransactions).toHaveLength(2);
    expect(updatedTransactions[0].type).toBe('expense'); // Negative amount -> expense
    expect(updatedTransactions[1].type).toBe('income'); // Positive amount -> income
    expect(updatedTransactions[0].category).toBe('Food');
    expect(updatedTransactions[1].category).toBe('Income');
  });
});