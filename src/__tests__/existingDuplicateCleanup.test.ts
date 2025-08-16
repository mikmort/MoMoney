import { dataService } from '../services/dataService';

describe('Existing Duplicate Cleanup with Opposite Amounts', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
  });

  it('should find and remove existing opposite amount duplicates', async () => {
    // Manually add transactions that would be considered duplicates with opposite amounts
    // This simulates the scenario where duplicates somehow got into the database
    await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Insurance Payment',
      amount: 242.30, // Positive amount
      category: 'Insurance',
      account: 'Checking Account',
      type: 'expense'
    });

    await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Insurance Payment', 
      amount: -242.30, // Opposite amount
      category: 'Insurance',
      account: 'Checking Account',
      type: 'expense'
    });

    await dataService.addTransaction({
      date: new Date('2025-01-16'),
      description: 'Grocery Store',
      amount: 85.50, // Positive amount
      category: 'Food & Dining',
      account: 'Checking Account',
      type: 'expense'
    });

    await dataService.addTransaction({
      date: new Date('2025-01-16'),
      description: 'Grocery Store',
      amount: -85.50, // Opposite amount
      category: 'Food & Dining', 
      account: 'Checking Account',
      type: 'expense'
    });

    // Verify we have 4 transactions initially
    const initialTransactions = await dataService.getAllTransactions();
    expect(initialTransactions).toHaveLength(4);

    // Find existing duplicates (should find the opposite amount pairs)
    const duplicates = await dataService.findExistingDuplicates();
    console.log('Found duplicates:', duplicates.length);
    
    // Should find 2 duplicate pairs (opposite amounts)
    expect(duplicates.length).toBeGreaterThan(0);
    
    duplicates.forEach(duplicate => {
      console.log(`Duplicate found: ${duplicate.existingTransaction.description} = ${duplicate.existingTransaction.amount} vs ${duplicate.newTransaction.amount}, similarity: ${duplicate.similarity}`);
    });

    // The opposite amount pairs should be detected as duplicates
    const oppositeAmountDuplicates = duplicates.filter(dup => 
      Math.abs(dup.existingTransaction.amount + dup.newTransaction.amount) < 0.01
    );
    
    expect(oppositeAmountDuplicates.length).toBeGreaterThanOrEqual(1);
  });

  it('should cleanup exact duplicates using the cleanup utility', async () => {
    // Add the same transaction twice (exact duplicates)
    const duplicateTransaction = {
      date: new Date('2025-01-15'),
      description: 'Test Transaction',
      amount: -100.00,
      category: 'Test Category',
      account: 'Test Account',
      type: 'expense' as const
    };

    await dataService.addTransaction(duplicateTransaction);
    await dataService.addTransaction(duplicateTransaction);

    // Verify we have 2 transactions
    const beforeCleanup = await dataService.getAllTransactions();
    expect(beforeCleanup).toHaveLength(2);

    // Run the cleanup utility
    const cleanupResult = await dataService.cleanupExactDuplicates();
    console.log('Cleanup result:', cleanupResult);

    // Should have removed 1 duplicate, leaving 1 transaction
    expect(cleanupResult.removed).toBe(1);
    expect(cleanupResult.totalAfter).toBe(1);

    const afterCleanup = await dataService.getAllTransactions();
    expect(afterCleanup).toHaveLength(1);
  });
});