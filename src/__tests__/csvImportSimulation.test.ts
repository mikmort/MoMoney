/**
 * Test to simulate the exact file import scenario with enhanced logging
 */
import { dataService } from '../services/dataService';
import { fileProcessingService } from '../services/fileProcessingService';
import { Transaction } from '../types';

describe('CSV Import Simulation with Logging', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should simulate importing a CSV file with existing transactions to see diagnostic output', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Step 1: Add existing transactions to simulate a real account
    const existingTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      // Simulate realistic existing transactions
      {
        date: new Date('2025-01-01'),
        description: 'CREDIT DIVIDEND',
        amount: 0.05,
        category: 'Investment Income',
        account: accountId,
        type: 'income',
        notes: 'Monthly credit union dividend'
      },
      {
        date: new Date('2025-01-15'),
        description: 'ACH DEBIT BARCLAYCARD US CREDITCARD',
        amount: -75.00,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer',
        notes: 'Credit card payment'
      },
      {
        date: new Date('2025-01-20'),
        description: 'WITHDRAWAL TRANSFER TO ***1144 LESCHI HOUSE',
        amount: -630.43,
        category: 'Internal Transfer', 
        account: accountId,
        type: 'transfer',
        notes: 'Rent payment transfer'
      },
      // Add some other common transactions
      {
        date: new Date('2025-01-05'),
        description: 'STARBUCKS STORE #123 SEATTLE WA',
        amount: -4.50,
        category: 'Food & Dining',
        account: accountId,
        type: 'expense'
      },
      {
        date: new Date('2025-01-10'),
        description: 'SHELL SERVICE STATION BELLEVUE WA',
        amount: -45.00,
        category: 'Gas & Fuel',
        account: accountId,
        type: 'expense'
      }
    ];

    // Add existing transactions
    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    console.log(`\n🏪 Added ${existingTransactions.length} existing transactions to account`);
    const existingCount = await dataService.getTransactionCount();
    console.log(`📊 Total existing transactions: ${existingCount}`);

    // Step 2: Create new transactions that might be similar to existing ones
    // This simulates what might come from a CSV import
    const csvTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      // These should be duplicates (very similar to existing)
      {
        date: new Date('2025-01-01'),
        description: 'CREDIT DIVIDEND',
        amount: 0.05,
        category: 'Investment Income',
        account: accountId,
        type: 'income'
      },
      {
        date: new Date('2025-01-15'),
        description: 'ACH DEBIT BARCLAYCARD US CREDITCARD',
        amount: -75.00,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer'
      },
      // These should be unique (new transactions)
      {
        date: new Date('2025-02-01'),
        description: 'CREDIT DIVIDEND',
        amount: 0.05,
        category: 'Investment Income',
        account: accountId,
        type: 'income'
      },
      {
        date: new Date('2025-02-15'),
        description: 'ACH DEBIT BARCLAYCARD US CREDITCARD',
        amount: -75.00,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer'
      },
      {
        date: new Date('2025-01-25'),
        description: 'AMAZON PURCHASE SEATTLE WA',
        amount: -29.99,
        category: 'Shopping',
        account: accountId,
        type: 'expense'
      }
    ];

    console.log(`\n📄 Simulating CSV import with ${csvTransactions.length} transactions`);

    // Step 3: Directly test duplicate detection with enhanced output
    console.log(`\n🔍 Testing duplicate detection directly...`);
    
    const duplicateResult = await dataService.detectDuplicates(csvTransactions);
    
    console.log(`\n📊 Duplicate Detection Results:`);
    console.log(`   - Total transactions checked: ${csvTransactions.length}`);
    console.log(`   - Duplicates found: ${duplicateResult.duplicates.length}`);
    console.log(`   - Unique transactions: ${duplicateResult.uniqueTransactions.length}`);
    console.log(`   - Configuration used:`, duplicateResult.config);
    console.log(`   - Duplicate rate: ${(duplicateResult.duplicates.length / csvTransactions.length * 100).toFixed(1)}%`);

    if (duplicateResult.duplicates.length > 0) {
      console.log(`\n🔍 Duplicate Details:`);
      duplicateResult.duplicates.forEach((dup, i) => {
        console.log(`   ${i + 1}. New: "${dup.newTransaction.description}" (${dup.newTransaction.date.toISOString().split('T')[0]}) $${dup.newTransaction.amount}`);
        console.log(`      Existing: "${dup.existingTransaction.description}" (${dup.existingTransaction.date.toISOString().split('T')[0]}) $${dup.existingTransaction.amount}`);
        console.log(`      Similarity: ${(dup.similarity * 100).toFixed(1)}% | Match fields: [${dup.matchFields.join(', ')}] | Days diff: ${dup.daysDifference || 0}`);
      });
    }

    // Expected results: 2 duplicates (exact matches), 3 unique
    expect(duplicateResult.duplicates.length).toBe(2);
    expect(duplicateResult.uniqueTransactions.length).toBe(3);
  });

  it('should test with a scenario that might cause all transactions to be flagged as duplicates', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Hypothesis: If there are many existing similar transactions and 
    // the new CSV contains very similar transactions, maybe all get flagged
    
    // Add many existing transactions with similar patterns
    const baseTransactions = [
      { description: 'STARBUCKS', amount: -4.50, category: 'Food & Dining' },
      { description: 'SHELL GAS STATION', amount: -45.00, category: 'Gas & Fuel' },
      { description: 'FRED MEYER', amount: -89.99, category: 'Groceries' },
      { description: 'CREDIT DIVIDEND', amount: 0.05, category: 'Interest' }
    ];

    // Add these patterns across many months
    for (let month = 0; month < 12; month++) {
      for (let day = 1; day <= 5; day++) {
        for (const base of baseTransactions) {
          await dataService.addTransaction({
            date: new Date(2024, month, day),
            description: `${base.description} #${month}-${day}`,
            amount: base.amount + (Math.random() - 0.5) * 2,
            category: base.category,
            account: accountId,
            type: base.amount > 0 ? 'income' : 'expense'
          });
        }
      }
    }

    const existingCount = await dataService.getTransactionCount();
    console.log(`\n🏪 Added ${existingCount} existing similar transactions`);

    // Now create CSV transactions that are similar to the patterns above
    const csvTransactions = Array.from({length: 20}, (_, i) => {
      const base = baseTransactions[i % baseTransactions.length];
      return {
        date: new Date(2025, 2, i + 1), // March 2025
        description: `${base.description} MARCH-${i + 1}`,
        amount: base.amount + (Math.random() - 0.5),
        category: base.category,
        account: accountId,
        type: base.amount > 0 ? 'income' as const : 'expense' as const
      };
    });

    console.log(`\n📄 Testing with ${csvTransactions.length} CSV transactions against ${existingCount} existing`);

    const result = await dataService.detectDuplicates(csvTransactions);
    
    console.log(`\n📊 Results:`);
    console.log(`   - Duplicates: ${result.duplicates.length}`);
    console.log(`   - Unique: ${result.uniqueTransactions.length}`);
    console.log(`   - Rate: ${(result.duplicates.length / csvTransactions.length * 100).toFixed(1)}%`);

    // With similar but not identical descriptions, dates far apart, 
    // we should NOT get 100% duplicates
    expect(result.duplicates.length / csvTransactions.length).toBeLessThan(0.5); // Less than 50%
  });

  it('should test the exact configuration that might be causing the issue', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add minimal existing data
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Test Transaction',
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense'
    });

    // Test with exact duplicate
    const exactDuplicate = [{
      date: new Date('2025-01-01'),
      description: 'Test Transaction',
      amount: -10.00,
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    }];

    console.log(`\n🧪 Testing exact duplicate scenario:`);
    const result1 = await dataService.detectDuplicates(exactDuplicate);
    console.log(`   Exact match: ${result1.duplicates.length} duplicates, ${result1.uniqueTransactions.length} unique`);

    // Test with near duplicate (within tolerance)
    const nearDuplicate = [{
      date: new Date('2025-01-02'), // 1 day difference
      description: 'Test Transaction',
      amount: -10.10, // $0.10 difference (1% change)
      category: 'Test',
      account: accountId,
      type: 'expense' as const
    }];

    console.log(`\n🧪 Testing near duplicate scenario:`);
    const result2 = await dataService.detectDuplicates(nearDuplicate);
    console.log(`   Near match: ${result2.duplicates.length} duplicates, ${result2.uniqueTransactions.length} unique`);
    if (result2.duplicates.length > 0) {
      console.log(`   Similarity: ${(result2.duplicates[0].similarity * 100).toFixed(1)}%`);
    }

    // Both should be flagged as duplicates with default settings
    expect(result1.duplicates.length).toBe(1); // Exact match
    expect(result2.duplicates.length).toBe(1); // Near match within tolerance
  });
});