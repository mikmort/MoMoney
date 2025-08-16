/**
 * Final test to identify if the issue might be elsewhere in the system
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Final Diagnosis - Alternative Causes', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should test if the issue is with date parsing or format differences', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transactions with various date formats
    const existingTransactions = [
      {
        date: new Date('2025-01-01T00:00:00.000Z'), // ISO format
        description: 'Transaction A',
        amount: -10.00,
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-02'), // Date constructor
        description: 'Transaction B', 
        amount: -20.00,
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      }
    ];

    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    // New transactions with potential date parsing issues
    const newTransactions = [
      {
        date: new Date('2025-01-01'), // Same date, different format representation
        description: 'Transaction A',
        amount: -10.00,
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-05'), // Different date
        description: 'Transaction C',
        amount: -30.00,
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      }
    ];

    const result = await dataService.detectDuplicates(newTransactions);
    
    console.log('\n=== Date parsing test ===');
    console.log(`Duplicates: ${result.duplicates.length}, Unique: ${result.uniqueTransactions.length}`);
    
    if (result.duplicates.length > 0) {
      result.duplicates.forEach((dup, i) => {
        console.log(`${i + 1}. "${dup.newTransaction.description}" (${dup.newTransaction.date.toISOString()}) -> "${dup.existingTransaction.description}" (${dup.existingTransaction.date.toISOString()})`);
        console.log(`   Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
      });
    }
  });

  it('should examine if the issue is with empty or null values', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Normal Transaction',
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    });

    // Test with potentially problematic data
    const newTransactions = [
      {
        date: new Date('2025-01-01'),
        description: '', // Empty description
        amount: -10.00,
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-01'),
        description: 'Normal Transaction',
        amount: 0, // Zero amount
        category: 'Test',
        account: accountId,
        type: 'expense' as const
      }
    ];

    try {
      const result = await dataService.detectDuplicates(newTransactions);
      console.log('\n=== Empty/null values test ===');
      console.log(`Duplicates: ${result.duplicates.length}, Unique: ${result.uniqueTransactions.length}`);
    } catch (error) {
      console.log('Error with empty/null values:', error);
    }
  });

  it('should test the maximum similarity scenario that could cause false positives', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Test',
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    });

    // Create transaction that should get maximum similarity score
    const newTransactions = [{
      date: new Date('2025-01-01'), // Same date (25 points)
      description: 'Test', // Same description (30 points)  
      amount: -10.00, // Same amount (30 points)
      category: 'Test',
      account: accountId, // Same account (15 points)
      type: 'expense' as const
    }];

    const result = await dataService.detectDuplicates(newTransactions);
    
    console.log('\n=== Maximum similarity test ===');
    console.log(`Expected: Should be 100% similarity and flagged as duplicate`);
    console.log(`Duplicates: ${result.duplicates.length}, Unique: ${result.uniqueTransactions.length}`);
    
    if (result.duplicates.length > 0) {
      const dup = result.duplicates[0];
      console.log(`Actual similarity: ${(dup.similarity * 100).toFixed(2)}%`);
      console.log(`Match type: ${dup.matchType}`);
      console.log(`Match fields: [${dup.matchFields.join(', ')}]`);
    }
    
    // This should definitely be flagged as a duplicate
    expect(result.duplicates.length).toBe(1);
    if (result.duplicates.length > 0) {
      expect(result.duplicates[0].similarity).toBeGreaterThanOrEqual(0.95);
    }
  });

  it('should check if the issue might be with configuration override somewhere', async () => {
    // Test accessing the internal findDuplicate method directly to see what's happening
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Test Transaction',
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    });

    const newTransaction = {
      date: new Date('2025-01-01'),
      description: 'Test Transaction', 
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    };

    // Test with different configurations
    const configs = [
      { name: 'Default', config: undefined },
      { name: 'Strict', config: { amountTolerance: 0.001, dateTolerance: 0, requireExactDescription: true, requireSameAccount: true } },
      { name: 'Lenient', config: { amountTolerance: 0.5, dateTolerance: 30, requireExactDescription: false, requireSameAccount: false } }
    ];

    console.log('\n=== Configuration override test ===');
    for (const { name, config } of configs) {
      const result = await dataService.detectDuplicates([newTransaction], config);
      console.log(`${name} config: Duplicates=${result.duplicates.length}, Unique=${result.uniqueTransactions.length}`);
      
      if (result.duplicates.length > 0) {
        console.log(`  Similarity: ${(result.duplicates[0].similarity * 100).toFixed(1)}%`);
      }
    }
  });

  it('should investigate if the issue is with batch processing', async () => {
    // Test if importing many transactions at once behaves differently
    // than importing them one by one
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add one existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Existing Transaction',
      amount: -100.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    });

    // Create 135 unique transactions (should have 0 duplicates)
    const newTransactions = Array.from({length: 135}, (_, i) => ({
      date: new Date(2025, 1, 1 + Math.floor(i / 5)), // Spread over days
      description: `Transaction ${i + 1}`,
      amount: -(i + 1),
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    }));

    console.log('\n=== Batch processing test ===');
    console.log(`Testing ${newTransactions.length} unique transactions`);
    
    const startTime = Date.now();
    const result = await dataService.detectDuplicates(newTransactions);
    const endTime = Date.now();
    
    console.log(`Processing time: ${endTime - startTime}ms`);
    console.log(`Duplicates found: ${result.duplicates.length}`);
    console.log(`Unique transactions: ${result.uniqueTransactions.length}`);
    console.log(`Duplicate rate: ${(result.duplicates.length / newTransactions.length * 100).toFixed(1)}%`);
    
    // All should be unique
    expect(result.duplicates.length).toBe(0);
    expect(result.uniqueTransactions.length).toBe(135);
  });
});