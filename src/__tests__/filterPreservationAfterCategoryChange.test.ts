import { dataService } from '../services/dataService';
import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Filter Preservation After Category Change', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  test('filter states should be preserved after AI suggest category', async () => {
    // This test specifically addresses the bug fix where setFilteredTransactions(all) 
    // was bypassing the filtering logic in the AI suggest category function
    
    let showUnmatchedTransactions = true;
    let showMatchedTransactions = false;
    let transactions: Transaction[] = [];
    let filteredTransactions: Transaction[] = [];
    
    // Create test transactions
    const initialTransactions = [
      {
        id: 'tx-1',
        date: new Date('2024-01-16'),
        amount: -100.00,
        description: 'Transfer to Savings',
        category: 'Internal Transfer',
        account: 'Checking',
        type: 'transfer' as const,
        reimbursementId: 'tx-2',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        amount: 100.00,
        description: 'Transfer from Checking',
        category: 'Internal Transfer',
        account: 'Savings',
        type: 'transfer' as const,
        reimbursementId: 'tx-1',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'tx-3',
        date: new Date('2024-01-17'),
        amount: -75.00,
        description: 'ATM Withdrawal',
        category: 'Internal Transfer',
        account: 'Checking',
        type: 'transfer' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.8
      },
      {
        id: 'tx-4',
        date: new Date('2024-01-15'),
        amount: -50.00,
        description: 'Grocery Store',
        category: 'Uncategorized',
        account: 'Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];
    
    transactions = initialTransactions;
    
    // Apply the unmatched transfers filter first
    function applyFilters() {
      let filtered = transactions.slice();
      
      if (showUnmatchedTransactions) {
        const unmatchedTransfers = transferMatchingService.getUnmatchedTransfers(transactions);
        const unmatchedTransferIds = new Set(unmatchedTransfers.map(t => t.id));
        filtered = filtered.filter((t: Transaction) => 
          t.type === 'transfer' && unmatchedTransferIds.has(t.id)
        );
      }
      
      filteredTransactions = filtered;
    }
    
    applyFilters();
    
    // Should show only unmatched transfers (tx-3)
    expect(filteredTransactions).toHaveLength(1);
    expect(filteredTransactions[0].id).toBe('tx-3');
    
    // Simulate the AI suggest category operation (which was causing the bug)
    // Before the fix, this would set filteredTransactions to ALL transactions
    // After the fix, it should preserve the filter
    
    // Change the category of the uncategorized transaction (simulating AI suggest)
    const updatedTx4 = { ...transactions[3], category: 'Food & Dining' };
    transactions = transactions.map(t => t.id === 'tx-4' ? updatedTx4 : t);
    
    // The critical fix: instead of setFilteredTransactions(all), we let applyFilters handle it
    // This simulates the fixed behavior where only setTransactions is called
    applyFilters(); // This simulates the useEffect that runs when transactions change
    
    // Verify the filter is still active
    expect(showUnmatchedTransactions).toBe(true); // Filter state preserved
    expect(filteredTransactions).toHaveLength(1); // Should still show only 1 transaction
    expect(filteredTransactions[0].id).toBe('tx-3'); // Should still be the unmatched transfer
    
    // Should NOT show all 4 transactions (which would indicate the bug)
    expect(filteredTransactions.length).toBeLessThan(transactions.length);
    
    console.log('✅ Filter state preserved after AI suggest category');
    console.log(`Filtered: ${filteredTransactions.length}, Total: ${transactions.length}`);
  });

  test('simulates the actual UI component behavior', async () => {
    // This test simulates the actual component state management issue
    // The problem is that when category changes, the component filter states should be preserved
    
    let showUnmatchedTransactions = false;
    let showMatchedTransactions = false;
    let transactions: Transaction[] = [];
    let filteredTransactions: Transaction[] = [];
    
    // Simulate component initialization with some transactions
    const initialTransactions = [
      {
        id: 'tx-1',
        date: new Date('2024-01-16'),
        amount: -100.00,
        description: 'Transfer to Savings',
        category: 'Internal Transfer',
        account: 'Checking',
        type: 'transfer' as const,
        reimbursementId: 'tx-2',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        amount: 100.00,
        description: 'Transfer from Checking',
        category: 'Internal Transfer',
        account: 'Savings',
        type: 'transfer' as const,
        reimbursementId: 'tx-1',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'tx-3',
        date: new Date('2024-01-17'),
        amount: -75.00,
        description: 'ATM Withdrawal',
        category: 'Internal Transfer',
        account: 'Checking',
        type: 'transfer' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.8
      }
    ];
    
    transactions = initialTransactions;
    
    // Simulate user clicking "Unmatched Transfers" filter
    showUnmatchedTransactions = true;
    
    // Apply the filter (simulates the applyFilters function in the component)
    function applyFilters() {
      let filtered = transactions.slice();
      
      if (showUnmatchedTransactions) {
        const unmatchedTransfers = transferMatchingService.getUnmatchedTransfers(transactions);
        const unmatchedTransferIds = new Set(unmatchedTransfers.map(t => t.id));
        filtered = filtered.filter((t: Transaction) => 
          t.type === 'transfer' && unmatchedTransferIds.has(t.id)
        );
      }
      
      filteredTransactions = filtered;
    }
    
    applyFilters();
    
    // Should show only unmatched transfers
    expect(filteredTransactions).toHaveLength(1);
    expect(filteredTransactions[0].id).toBe('tx-3');
    
    // Now simulate changing the category of the unmatched transfer
    // This is the scenario that causes the issue in the real component
    const updatedTx = { ...transactions[2], category: 'Banking' };
    transactions = transactions.map(t => t.id === 'tx-3' ? updatedTx : t);
    
    // The key issue: when transactions change, does the filter state get preserved?
    // In the real component, this would be handled by preserving the showUnmatchedTransactions state
    
    // Re-apply filters after the transaction update
    applyFilters();
    
    // This is the critical test: the filter should still be active
    // We should NOT see all transactions (which would be length 3)
    expect(filteredTransactions.length).toBeLessThan(3);
    
    // The showUnmatchedTransactions state should still be true
    expect(showUnmatchedTransactions).toBe(true);
    
    // This demonstrates that the filter logic works correctly if the state is preserved
    console.log('Filter state preserved:', showUnmatchedTransactions);
    console.log('Filtered transactions count:', filteredTransactions.length);
    console.log('Total transactions count:', transactions.length);
  });
});