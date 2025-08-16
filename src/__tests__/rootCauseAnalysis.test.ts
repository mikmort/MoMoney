/**
 * Advanced testing to identify the root cause of the 135 transaction duplicate issue
 */
import { dataService } from '../services/dataService';
import { Transaction, DuplicateDetectionConfig } from '../types';

describe('Root Cause Analysis - 135 Transactions Duplicate Issue', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should test with different account matching configurations', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transactions
    const existingTransactions = [
      {
        date: new Date('2025-01-01'),
        description: 'Test Transaction',
        amount: -10.00,
        category: 'Shopping',
        account: accountId,
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-02'),
        description: 'Another Transaction',
        amount: -20.00,
        category: 'Food',
        account: 'different-account',
        type: 'expense' as const
      }
    ];

    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    // Create new transactions with different account matching scenarios
    const newTransactions = [
      {
        date: new Date('2025-01-03'),
        description: 'Test Transaction',
        amount: -10.00,
        category: 'Shopping',
        account: accountId, // Same account
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-04'),
        description: 'Test Transaction',
        amount: -10.00,
        category: 'Shopping',
        account: 'different-account', // Different account
        type: 'expense' as const
      }
    ];

    console.log('\n=== Test with requireSameAccount: true (default) ===');
    const result1 = await dataService.detectDuplicates(newTransactions, { requireSameAccount: true });
    console.log(`Duplicates: ${result1.duplicates.length}, Unique: ${result1.uniqueTransactions.length}`);
    
    if (result1.duplicates.length > 0) {
      result1.duplicates.forEach((dup, i) => {
        console.log(`  ${i + 1}. Match: "${dup.newTransaction.description}" (${dup.newTransaction.account}) -> "${dup.existingTransaction.description}" (${dup.existingTransaction.account})`);
        console.log(`     Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
      });
    }

    console.log('\n=== Test with requireSameAccount: false ===');
    const result2 = await dataService.detectDuplicates(newTransactions, { requireSameAccount: false });
    console.log(`Duplicates: ${result2.duplicates.length}, Unique: ${result2.uniqueTransactions.length}`);
    
    if (result2.duplicates.length > 0) {
      result2.duplicates.forEach((dup, i) => {
        console.log(`  ${i + 1}. Match: "${dup.newTransaction.description}" (${dup.newTransaction.account}) -> "${dup.existingTransaction.description}" (${dup.existingTransaction.account})`);
        console.log(`     Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
      });
    }
  });

  it('should test with very lenient tolerance settings', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Coffee Shop',
      amount: -5.00,
      category: 'Food',
      account: accountId,
      type: 'expense' as const
    });

    // New transaction with some differences
    const newTransactions = [{
      date: new Date('2025-01-15'), // 14 days later
      description: 'Different Coffee Shop',
      amount: -7.50, // 50% different amount
      category: 'Food',
      account: accountId,
      type: 'expense' as const
    }];

    // Test with extremely lenient settings that might cause false positives
    const laxConfig: DuplicateDetectionConfig = {
      amountTolerance: 1.0, // 100% tolerance (any amount)
      dateTolerance: 30, // 30 days tolerance
      requireExactDescription: false,
      requireSameAccount: true,
      fixedAmountTolerance: 100.0 // $100 fixed tolerance
    };

    console.log('\n=== Test with very lenient settings ===');
    console.log('Config:', JSON.stringify(laxConfig, null, 2));
    
    const result = await dataService.detectDuplicates(newTransactions, laxConfig);
    console.log(`Duplicates: ${result.duplicates.length}, Unique: ${result.uniqueTransactions.length}`);
    
    if (result.duplicates.length > 0) {
      const dup = result.duplicates[0];
      console.log(`Match found: "${dup.newTransaction.description}" -> "${dup.existingTransaction.description}"`);
      console.log(`Similarity: ${(dup.similarity * 100).toFixed(1)}%`);
      console.log(`Days difference: ${dup.daysDifference}`);
      console.log(`Amount difference: $${dup.amountDifference}`);
    }
  });

  it('should test if the issue is with similarity threshold', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add an existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'AMAZON PURCHASE',
      amount: -25.99,
      category: 'Shopping',
      account: accountId,
      type: 'expense' as const
    });

    // Create a marginally similar transaction
    const newTransactions = [{
      date: new Date('2025-01-01'), // Same date
      description: 'AMAZON MARKETPLACE', // Similar but different description
      amount: -25.99, // Same amount
      category: 'Shopping',
      account: accountId, // Same account
      type: 'expense' as const
    }];

    const result = await dataService.detectDuplicates(newTransactions);
    
    console.log('\n=== Testing similarity threshold ===');
    console.log('Existing: "AMAZON PURCHASE"');
    console.log('New: "AMAZON MARKETPLACE"');
    console.log(`Duplicates found: ${result.duplicates.length}`);
    
    if (result.duplicates.length > 0) {
      const dup = result.duplicates[0];
      console.log(`Similarity: ${(dup.similarity * 100).toFixed(2)}%`);
      console.log(`Threshold: 80%`);
      console.log(`Match fields: [${dup.matchFields.join(', ')}]`);
    }

    // Test the string similarity directly
    const stringSimilarity = (dataService as any).calculateStringSimilarity('AMAZON PURCHASE', 'AMAZON MARKETPLACE');
    console.log(`String similarity: ${(stringSimilarity * 100).toFixed(2)}%`);
  });

  it('should test the exact scenario that might cause 100% duplicate rate', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Scenario: Account has many existing recurring transactions
    const recurringTransactions = [
      // Monthly fee - appears every month
      { description: 'Monthly Fee', amount: -5.00, category: 'Bank Fees' },
      // Interest payment - appears monthly with slight variations
      { description: 'Interest Payment', amount: 0.05, category: 'Interest' },
      // Common purchase locations
      { description: 'Starbucks', amount: -4.50, category: 'Food' },
      { description: 'Shell Gas Station', amount: -45.00, category: 'Gas' },
      { description: 'Grocery Store', amount: -89.99, category: 'Groceries' }
    ];

    // Add these as existing transactions across several months
    for (let month = 0; month < 12; month++) {
      for (const baseTransaction of recurringTransactions) {
        await dataService.addTransaction({
          date: new Date(2024, month, 15),
          description: baseTransaction.description,
          amount: baseTransaction.amount + (Math.random() - 0.5) * 2, // Add slight variation
          category: baseTransaction.category,
          account: accountId,
          type: baseTransaction.amount > 0 ? 'income' as const : 'expense' as const
        });
      }
    }

    console.log(`\n=== Added ${12 * recurringTransactions.length} existing recurring transactions ===`);

    // Now create "new" transactions that are similar to existing ones
    // This simulates importing a CSV with recurring transactions
    const newRecurringTransactions = recurringTransactions.map(base => ({
      date: new Date(2025, 2, 15), // March 2025
      description: base.description,
      amount: base.amount + (Math.random() - 0.5) * 1, // Slight variation
      category: base.category,
      account: accountId,
      type: base.amount > 0 ? 'income' as const : 'expense' as const
    }));

    const result = await dataService.detectDuplicates(newRecurringTransactions);
    
    console.log(`New transactions: ${newRecurringTransactions.length}`);
    console.log(`Duplicates found: ${result.duplicates.length}`);
    console.log(`Unique: ${result.uniqueTransactions.length}`);
    console.log(`Duplicate rate: ${(result.duplicates.length / newRecurringTransactions.length * 100).toFixed(1)}%`);

    if (result.duplicates.length > 0) {
      console.log('\nFirst few duplicates:');
      result.duplicates.slice(0, 3).forEach((dup, i) => {
        console.log(`${i + 1}. "${dup.newTransaction.description}" $${dup.newTransaction.amount} -> "${dup.existingTransaction.description}" $${dup.existingTransaction.amount}`);
        console.log(`   Similarity: ${(dup.similarity * 100).toFixed(1)}% | Days: ${dup.daysDifference}`);
      });
    }

    // This test will help us understand if recurring transactions are the issue
    expect(result.duplicates.length / newRecurringTransactions.length).toBeLessThan(1.0);
  });
});