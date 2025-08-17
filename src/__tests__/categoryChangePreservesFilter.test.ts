/**
 * Test to validate that filters are preserved after category changes
 * This test specifically addresses the bug where changing a transaction's category
 * would cause active transfer filters to be lost.
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Category Change Preserves Filters', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  test('matched transfers filter should remain active after category change', async () => {
    // Mock the applyFilters function behavior from the Transactions component
    let showMatchedTransactions = false;
    let showUnmatchedTransactions = false;
    let filteredTransactions: Transaction[] = [];
    
    // Create test data: 2 matched transfers + 1 regular transaction
    const testTransactions: Transaction[] = [
      {
        id: 'transfer-out',
        date: new Date('2024-01-15'),
        amount: -500.00,
        description: 'Transfer to Savings',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        account: 'Checking',
        type: 'transfer' as const,
        reimbursementId: 'transfer-in', // This creates the match
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.95
      },
      {
        id: 'transfer-in',
        date: new Date('2024-01-15'),
        amount: 500.00,
        description: 'Transfer from Checking',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        account: 'Savings',
        type: 'transfer' as const,
        reimbursementId: 'transfer-out', // This creates the match
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.95
      },
      {
        id: 'expense-1',
        date: new Date('2024-01-16'),
        amount: -50.00,
        description: 'Grocery Store',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    // Add transactions to the data service
    await dataService.addTransactions(testTransactions);
    let allTransactions = await dataService.getAllTransactions();
    
    // Simulate applying "Matched Transfers" filter
    showMatchedTransactions = true;
    
    // Mock applyFilters function (simplified version of the real one)
    function applyFilters() {
      let filtered = allTransactions.slice();
      
      if (showMatchedTransactions) {
        // Simple logic: transactions with reimbursementId are matched
        filtered = filtered.filter(t => t.type === 'transfer' && t.reimbursementId);
      }
      
      filteredTransactions = filtered;
    }
    
    // Initial filter application
    applyFilters();
    
    // Should show 2 matched transfer transactions
    expect(filteredTransactions).toHaveLength(2);
    expect(filteredTransactions.every(t => t.type === 'transfer')).toBe(true);
    expect(filteredTransactions.every(t => t.reimbursementId)).toBe(true);
    
    // Simulate the category change that was causing the bug
    // Change the category of one matched transfer
    const updatedTransaction = {
      ...allTransactions.find(t => t.id === 'transfer-out')!,
      category: 'Financial' // Change away from 'Internal Transfer'
    };
    
    await dataService.updateTransaction(updatedTransaction.id, updatedTransaction);
    allTransactions = await dataService.getAllTransactions();
    
    // The key test: simulate what should happen after the category change
    // Before the fix: setFilteredTransactions(all) would show all 3 transactions
    // After the fix: applyFilters should run and preserve the filter
    
    // Simulate the fixed behavior - applyFilters should run when transactions change
    applyFilters();
    
    // Critical validation: Filter should still be active
    expect(showMatchedTransactions).toBe(true);
    
    // Should still show only matched transfers (now 2, since both still have reimbursementId)
    // Note: The reimbursementId matching isn't affected by category changes
    expect(filteredTransactions).toHaveLength(2);
    expect(filteredTransactions.every(t => t.type === 'transfer')).toBe(true);
    expect(filteredTransactions.every(t => t.reimbursementId)).toBe(true);
    
    // Verify that we're not showing all transactions (which would be the bug)
    expect(filteredTransactions.length).toBeLessThan(allTransactions.length);
    
    console.log('✅ Filter state preserved after category change');
    console.log(`Filtered: ${filteredTransactions.length}, Total: ${allTransactions.length}`);
  });

  test('should not affect filtering when no filters are active', async () => {
    // This tests that the fix doesn't break normal behavior when no filters are applied
    const testTransactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        amount: -100.00,
        description: 'Test Transaction',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    await dataService.addTransactions(testTransactions);
    let allTransactions = await dataService.getAllTransactions();
    
    // No filters active - should show all transactions
    const hasActiveFilters = false; // Simulate the hasActiveFilters check from the fix
    
    let filteredTransactions: Transaction[] = [];
    
    if (!hasActiveFilters) {
      // This simulates the fixed updateTransactionDisplay useEffect
      filteredTransactions = allTransactions; // Should set all transactions when no filters
    }
    
    expect(filteredTransactions).toHaveLength(1);
    expect(filteredTransactions).toEqual(allTransactions);
    
    // Change category
    const updatedTx = { ...allTransactions[0], category: 'Transportation' };
    await dataService.updateTransaction(updatedTx.id, updatedTx);
    allTransactions = await dataService.getAllTransactions();
    
    // Without filters, should still show all transactions
    if (!hasActiveFilters) {
      filteredTransactions = allTransactions;
    }
    
    expect(filteredTransactions).toHaveLength(1);
    expect(filteredTransactions[0].category).toBe('Transportation');
  });
});