import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Transfer Category and Type Synchronization', () => {
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

  it('should update type to "transfer" when category changes to "Internal Transfer"', async () => {
    // Create a test transaction that's initially an expense
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Grocery Store Purchase',
      amount: -50.00,
      category: 'Food',
      subcategory: 'Groceries',
      account: 'Checking Account',
      type: 'expense'
    });

    expect(transaction.type).toBe('expense');
    expect(transaction.category).toBe('Food');

    // Change category to Internal Transfer
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Internal Transfer',
      subcategory: 'Between Accounts'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('transfer');
    expect(updatedTransaction!.category).toBe('Internal Transfer');
  });

  it('should update type to "expense" when negative amount transaction changes from "Internal Transfer" to another category', async () => {
    // Create a test transaction that's initially a transfer
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer to Savings',
      amount: -500.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Checking Account',
      type: 'transfer'
    });

    expect(transaction.type).toBe('transfer');
    expect(transaction.category).toBe('Internal Transfer');

    // Change category away from Internal Transfer
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Food',
      subcategory: 'Groceries'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('expense');
    expect(updatedTransaction!.category).toBe('Food');
  });

  it('should update type to "income" when positive amount transaction changes from "Internal Transfer" to another category', async () => {
    // Create a test transaction that's initially a transfer (positive amount)
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer from Checking',
      amount: 500.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Savings Account',
      type: 'transfer'
    });

    expect(transaction.type).toBe('transfer');
    expect(transaction.category).toBe('Internal Transfer');

    // Change category away from Internal Transfer
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Income',
      subcategory: 'Salary'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('income');
    expect(updatedTransaction!.category).toBe('Income');
  });

  it('should not change type when category changes but neither old nor new category is "Internal Transfer"', async () => {
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

    // Change category to another non-transfer category
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: 'Entertainment',
      subcategory: 'Movies'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('expense'); // Should remain the same
    expect(updatedTransaction!.category).toBe('Entertainment');
  });

  it('should not change type when category remains "Internal Transfer"', async () => {
    // Create a test transaction that's a transfer
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer to Savings',
      amount: -300.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Checking Account',
      type: 'transfer'
    });

    expect(transaction.type).toBe('transfer');
    expect(transaction.category).toBe('Internal Transfer');

    // Change only subcategory, keep category as Internal Transfer
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      subcategory: 'Withdrawal'
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('transfer'); // Should remain transfer
    expect(updatedTransaction!.category).toBe('Internal Transfer');
    expect(updatedTransaction!.subcategory).toBe('Withdrawal');
  });

  it('should not change type when only non-category fields are updated', async () => {
    // Create a test transaction
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Coffee Shop',
      amount: -5.00,
      category: 'Food',
      subcategory: 'Coffee',
      account: 'Credit Card',
      type: 'expense'
    });

    expect(transaction.type).toBe('expense');

    // Update only description and amount (no category change)
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      description: 'Starbucks Coffee',
      amount: -5.50
    });

    expect(updatedTransaction).not.toBeNull();
    expect(updatedTransaction!.type).toBe('expense'); // Should remain the same
    expect(updatedTransaction!.category).toBe('Food');
    expect(updatedTransaction!.description).toBe('Starbucks Coffee');
    expect(updatedTransaction!.amount).toBe(-5.50);
  });
});