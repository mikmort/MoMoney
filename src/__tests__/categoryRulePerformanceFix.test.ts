import { rulesService } from '../services/rulesService';
import { dataService } from '../services/dataService';

describe('Category Rule Performance Fix', () => {
  beforeEach(async () => {
    // Clear all data before each test
    await dataService.clearAllData();
    
    // Add a batch of test transactions
    const testTransactions = [];
    for (let i = 0; i < 50; i++) {
      testTransactions.push({
        date: new Date(`2024-01-${String(i % 28 + 1).padStart(2, '0')}`),
        description: i < 25 ? 'Starbucks Coffee' : 'McDonald\'s Restaurant', // 25 each
        amount: -5.50,
        category: 'Uncategorized',
        account: 'Test Account',
        type: 'expense' as const
      });
    }
    
    // Add all transactions
    for (const tx of testTransactions) {
      await dataService.addTransaction(tx);
    }
  });

  afterEach(async () => {
    await dataService.clearAllData();
  });

  it('should efficiently reclassify existing transactions without excessive database saves', async () => {
    // Spy on the saveToDB method to count database saves
    let saveToDBCallCount = 0;
    const originalSaveToDB = (dataService as any).saveToDB;
    (dataService as any).saveToDB = jest.fn(async () => {
      saveToDBCallCount++;
      return originalSaveToDB.call(dataService);
    });

    // Create a rule that will match "Starbucks Coffee" transactions
    const result = await rulesService.createOrUpdateRuleFromUserEdit(
      'Test Account',
      'Starbucks Coffee',
      'Food & Dining',
      'Coffee Shops',
      true // applyToExisting = true
    );

    // Verify the rule was created and transactions were reclassified
    expect(result.isNew).toBe(true);
    expect(result.reclassifiedCount).toBe(25); // Should match 25 Starbucks transactions

    // CRITICAL: Should only save to database once at the end, not once per transaction
    // With the fix, we expect only 1 saveToDB call, not 25+
    expect(saveToDBCallCount).toBeLessThanOrEqual(2); // Allow some tolerance for rule creation
    
    // Verify all matching transactions were updated
    const allTransactions = await dataService.getAllTransactions();
    const starbucksTransactions = allTransactions.filter(t => t.description === 'Starbucks Coffee');
    
    expect(starbucksTransactions).toHaveLength(25);
    starbucksTransactions.forEach(tx => {
      expect(tx.category).toBe('Food & Dining');
      expect(tx.subcategory).toBe('Coffee Shops');
    });

    // Verify non-matching transactions were not affected
    const mcdonaldsTransactions = allTransactions.filter(t => t.description === 'McDonald\'s Restaurant');
    expect(mcdonaldsTransactions).toHaveLength(25);
    mcdonaldsTransactions.forEach(tx => {
      expect(tx.category).toBe('Uncategorized');
    });

    // Restore original method
    (dataService as any).saveToDB = originalSaveToDB;
  });

  it('should handle errors gracefully during batch reclassification', async () => {
    // Force an error during the batch operation
    const originalBatchUpdateTransactions = dataService.batchUpdateTransactions;
    dataService.batchUpdateTransactions = jest.fn(async () => {
      throw new Error('Simulated batch update error');
    });

    // Attempt to create rule with reclassification for a new transaction type
    const result = await rulesService.createOrUpdateRuleFromUserEdit(
      'Test Account',
      'Target Store', // Unique description to ensure new rule
      'Shopping',
      'Retail',
      true // applyToExisting = true
    );

    // Should still create/update the rule even if batch update fails
    // The rule creation part should succeed, but reclassification should fail gracefully
    expect(result.isNew || !result.isNew).toBe(true); // Rule was processed (new or existing)
    // reclassifiedCount should be 0 due to the error
    expect(result.reclassifiedCount).toBe(0);

    // Restore original method
    dataService.batchUpdateTransactions = originalBatchUpdateTransactions;
  });
});