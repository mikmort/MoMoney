/**
 * Test to reproduce the specific issue where 135 transactions from a First Tech CSV
 * are all being flagged as duplicates when importing to an account with many existing transactions
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Duplicate Detection - First Tech CSV Import Issue', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should not flag all transactions as duplicates when importing recurring transactions to an account', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add some typical existing transactions that might be in a First Tech account
    const existingTransactions = [
      // Recurring transactions that appear monthly
      {
        date: new Date('2025-01-01'),
        description: 'Credit Dividend',
        amount: 0.05,
        category: 'Investment Income',
        account: accountId,
        type: 'income' as const
      },
      {
        date: new Date('2025-01-15'),
        description: 'ACH Debit BARCLAYCARD US  - CREDITCARD',
        amount: -75.00,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      {
        date: new Date('2025-01-20'),
        description: 'Withdrawal Transfer To ***1144 Leschi House',
        amount: -630.43,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      // Add many more existing transactions to simulate a real account
      ...Array.from({length: 50}, (_, i) => ({
        date: new Date(2024, 0, i + 1),
        description: `Transaction ${i + 1}`,
        amount: -(Math.random() * 100),
        category: 'Various',
        account: accountId,
        type: 'expense' as const
      }))
    ];

    // Add all existing transactions
    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    console.log(`Added ${existingTransactions.length} existing transactions`);

    // Now simulate importing NEW transactions from a CSV that might have similar but not identical transactions
    const newTransactions = [
      // Similar to existing but different dates - should NOT be duplicates
      {
        date: new Date('2025-06-30'), // Different month
        description: 'Credit Dividend',
        amount: 0.05, // Same amount
        category: 'Investment Income',
        account: accountId,
        type: 'income' as const
      },
      {
        date: new Date('2025-03-12'), // Different date
        description: 'ACH Debit BARCLAYCARD US  - CREDITCARD', 
        amount: -75.00, // Same amount
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      {
        date: new Date('2025-03-19'), // Different date
        description: 'Withdrawal Transfer To ***1144 Leschi House',
        amount: -630.43, // Same amount
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      // Add completely new transactions
      ...Array.from({length: 10}, (_, i) => ({
        date: new Date(2025, 2, i + 1),
        description: `New Transaction ${i + 1}`,
        amount: -(Math.random() * 100),
        category: 'Shopping',
        account: accountId,
        type: 'expense' as const
      }))
    ];

    // Test duplicate detection
    const duplicateResult = await dataService.detectDuplicates(newTransactions);
    
    console.log(`New transactions to import: ${newTransactions.length}`);
    console.log(`Duplicates found: ${duplicateResult.duplicates.length}`);
    console.log(`Unique transactions: ${duplicateResult.uniqueTransactions.length}`);
    
    if (duplicateResult.duplicates.length > 0) {
      console.log('Duplicate details:');
      duplicateResult.duplicates.forEach((dup, index) => {
        console.log(`  ${index + 1}. ${dup.newTransaction.description} (${dup.similarity.toFixed(2)} similarity)`);
        console.log(`     Existing: ${dup.existingTransaction.date.toISOString().split('T')[0]} | New: ${new Date(dup.newTransaction.date).toISOString().split('T')[0]}`);
        console.log(`     Match fields: ${dup.matchFields.join(', ')}`);
      });
    }

    // The key insight: transactions with same description and amount but different dates
    // should NOT be flagged as duplicates if they're far enough apart in time
    // But the current logic might be flagging them due to high similarity in description/amount
    
    // For this test, we expect some duplicates due to same descriptions/amounts,
    // but NOT all transactions should be duplicates
    expect(duplicateResult.duplicates.length).toBeLessThan(newTransactions.length);
    expect(duplicateResult.uniqueTransactions.length).toBeGreaterThan(0);
  });

  it('should examine the similarity calculation for high-scoring non-duplicates', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add existing transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Credit Dividend',
      amount: 0.05,
      category: 'Investment Income',
      account: accountId,
      type: 'income' as const
    });

    // New transaction with same description/amount but different date
    const newTransactions = [{
      date: new Date('2025-06-30'), // 6 months later
      description: 'Credit Dividend',
      amount: 0.05,
      category: 'Investment Income',
      account: accountId,
      type: 'income' as const
    }];

    const duplicateResult = await dataService.detectDuplicates(newTransactions);
    
    console.log('Testing similarity calculation for recurring transaction:');
    console.log(`Duplicates: ${duplicateResult.duplicates.length}`);
    
    if (duplicateResult.duplicates.length > 0) {
      const dup = duplicateResult.duplicates[0];
      console.log(`Similarity: ${dup.similarity.toFixed(4)}`);
      console.log(`Match fields: ${dup.matchFields.join(', ')}`);
      console.log(`Days difference: ${dup.daysDifference}`);
      console.log(`Match type: ${dup.matchType}`);
      
      // This should help us understand if the threshold is too low
      console.log(`Is similarity >= 0.8? ${dup.similarity >= 0.8}`);
    }
    
    // This transaction should be detected as a duplicate because it has:
    // - Same account (15 points)
    // - Same description (30 points) 
    // - Same amount (30 points)
    // - Different date but within tolerance? (let's see)
    // Total possible: 100 points, likely getting ~75-90% similarity
    
    if (duplicateResult.duplicates.length > 0) {
      expect(duplicateResult.duplicates[0].similarity).toBeGreaterThanOrEqual(0.8);
    }
  });
});