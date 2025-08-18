import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Asset Allocation Migration', () => {
  beforeEach(async () => {
    // Clear any existing data and ensure we're not initialized
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  afterEach(async () => {
    // Clean up
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  it('should fix Asset Allocation transactions with incorrect type during migration', async () => {
    // Add some Asset Allocation transactions with incorrect types directly
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase - AAPL',
      amount: -500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'expense' // Wrong type!
    });

    await dataService.addTransaction({
      date: new Date('2024-01-02'),
      description: 'Stock Sale - GOOGL',
      amount: 1000.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Sale',
      account: 'Investment Account',
      type: 'income' // Wrong type!
    });

    // Manually corrupt the types to simulate old data
    const transactions = dataService['transactions'];
    const stock1 = transactions.find(t => t.description.includes('AAPL'));
    const stock2 = transactions.find(t => t.description.includes('GOOGL'));
    if (stock1) stock1.type = 'expense'; // Simulate corrupted data
    if (stock2) stock2.type = 'income'; // Simulate corrupted data

    // Call the migration function directly
    const migrationResult = await dataService['migrateAssetAllocationTypes']();

    expect(migrationResult.fixed).toBe(2); // Should fix 2 transactions
    expect(migrationResult.errors.length).toBe(0);

    // Verify the transactions were fixed
    const allTransactions = dataService['transactions'];
    const fixedStock1 = allTransactions.find(t => t.description.includes('AAPL'));
    const fixedStock2 = allTransactions.find(t => t.description.includes('GOOGL'));
    
    expect(fixedStock1?.type).toBe('asset-allocation');
    expect(fixedStock2?.type).toBe('asset-allocation');
  });

  it('should handle migration when no corrupted transactions exist', async () => {
    // Add a correctly typed transaction
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase - AAPL',
      amount: -500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'asset-allocation' // Already correct
    });

    // Call the migration function
    const migrationResult = await dataService['migrateAssetAllocationTypes']();

    expect(migrationResult.fixed).toBe(0); // Should fix nothing
    expect(migrationResult.errors.length).toBe(0);

    // Verify the transaction type remains correct
    const allTransactions = dataService['transactions'];
    const stock = allTransactions.find(t => t.description.includes('AAPL'));
    expect(stock?.type).toBe('asset-allocation');
  });

  it('should only fix Asset Allocation transactions and leave others alone', async () => {
    // Add both Asset Allocation and regular transactions
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase - AAPL',
      amount: -500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'asset-allocation'
    });

    await dataService.addTransaction({
      date: new Date('2024-01-02'),
      description: 'Coffee Purchase',
      amount: -5.00,
      category: 'Food & Dining',
      subcategory: 'Coffee',
      account: 'Credit Card',
      type: 'expense'
    });

    // Corrupt the Asset Allocation transaction type
    const transactions = dataService['transactions'];
    const stock = transactions.find(t => t.category === 'Asset Allocation');
    if (stock) {
      stock.type = 'expense'; // Simulate corrupted data
    }

    // Call the migration function
    const migrationResult = await dataService['migrateAssetAllocationTypes']();

    expect(migrationResult.fixed).toBe(1); // Should fix only the Asset Allocation
    expect(migrationResult.errors.length).toBe(0);

    // Verify correct fixes
    const allTransactions = dataService['transactions'];
    const fixedStock = allTransactions.find(t => t.category === 'Asset Allocation');
    const regularExpense = allTransactions.find(t => t.category === 'Food & Dining');
    
    expect(fixedStock?.type).toBe('asset-allocation');
    expect(regularExpense?.type).toBe('expense'); // Should remain unchanged
  });

  it('should handle migration errors gracefully', async () => {
    // Add a transaction that might cause issues during migration
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Stock Purchase - Problem',
      amount: -500.00,
      category: 'Asset Allocation',
      subcategory: 'Stock Purchase',
      account: 'Investment Account',
      type: 'expense'
    });

    // Simulate an error during history snapshot creation
    const originalAddHistorySnapshot = dataService['addHistorySnapshot'];
    dataService['addHistorySnapshot'] = jest.fn().mockRejectedValue(new Error('Simulated error'));

    try {
      const migrationResult = await dataService['migrateAssetAllocationTypes']();
      
      // Migration should still fix the transaction but report the error
      expect(migrationResult.fixed).toBe(0); // Failed to fix due to error
      expect(migrationResult.errors.length).toBe(1);
      expect(migrationResult.errors[0]).toContain('Simulated error');
    } finally {
      // Restore the original method
      dataService['addHistorySnapshot'] = originalAddHistorySnapshot;
    }
  });
});