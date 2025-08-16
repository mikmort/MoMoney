/**
 * Test to reproduce the issue where all 135 transactions are being flagged as duplicates
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Duplicate Detection Issue - All transactions flagged as duplicates', () => {
  beforeEach(async () => {
    // Clear the database before each test
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should not flag all transactions as duplicates when importing to an account with existing transactions', async () => {
    // First, add some existing transactions to simulate a populated account
    const existingTransactions = [
      {
        date: new Date('2025-01-01'),
        description: 'Grocery Store',
        amount: -50.00,
        category: 'Food & Dining',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-02'),
        description: 'Gas Station',
        amount: -30.00,
        category: 'Transportation', 
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-03'),
        description: 'Salary Deposit',
        amount: 2500.00,
        category: 'Income',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'income' as const
      }
    ];

    // Add existing transactions
    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    // Now, create new transactions that are similar but NOT exact duplicates
    const newTransactions = [
      {
        date: new Date('2025-02-01'),
        description: 'Different Grocery Store',
        amount: -45.00,
        category: 'Food & Dining',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-02-02'),
        description: 'Different Gas Station',
        amount: -35.00,
        category: 'Transportation',
        account: 'first-tech-credit-union-first-tech-shared-checking', 
        type: 'expense' as const
      },
      {
        date: new Date('2025-02-03'),
        description: 'Monthly Salary',
        amount: 2600.00,
        category: 'Income',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'income' as const
      }
    ];

    // Check for duplicates - these should NOT all be flagged as duplicates
    const duplicateResult = await dataService.detectDuplicates(newTransactions);
    
    console.log(`Checking ${newTransactions.length} new transactions against ${existingTransactions.length} existing`);
    console.log(`Duplicates found: ${duplicateResult.duplicates.length}`);
    console.log(`Unique transactions: ${duplicateResult.uniqueTransactions.length}`);

    // These should be unique because they have different dates, amounts, and descriptions
    expect(duplicateResult.duplicates.length).toBe(0);
    expect(duplicateResult.uniqueTransactions.length).toBe(3);
  });

  it('should detect actual duplicates correctly', async () => {
    // Add an existing transaction
    const existingTransaction = {
      date: new Date('2025-01-15'),
      description: 'Coffee Shop Purchase',
      amount: -4.50,
      category: 'Food & Dining',
      account: 'first-tech-credit-union-first-tech-shared-checking',
      type: 'expense' as const
    };

    await dataService.addTransaction(existingTransaction);

    // Try to import the same transaction (exact duplicate)
    const newTransactions = [{
      date: new Date('2025-01-15'),
      description: 'Coffee Shop Purchase',
      amount: -4.50,
      category: 'Food & Dining',
      account: 'first-tech-credit-union-first-tech-shared-checking',
      type: 'expense' as const
    }];

    const duplicateResult = await dataService.detectDuplicates(newTransactions);
    
    console.log(`Exact duplicate test - Duplicates found: ${duplicateResult.duplicates.length}`);
    
    // This should be flagged as a duplicate
    expect(duplicateResult.duplicates.length).toBe(1);
    expect(duplicateResult.uniqueTransactions.length).toBe(0);
  });

  it('should handle mixed case with some duplicates and some unique', async () => {
    // Add some existing transactions
    const existingTransactions = [
      {
        date: new Date('2025-01-01'),
        description: 'Target Purchase',
        amount: -25.99,
        category: 'Shopping',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-05'),
        description: 'Netflix Subscription',
        amount: -15.99,
        category: 'Entertainment',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      }
    ];

    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    // Import mix of duplicate and unique transactions
    const newTransactions = [
      // Exact duplicate of first existing transaction
      {
        date: new Date('2025-01-01'),
        description: 'Target Purchase',
        amount: -25.99,
        category: 'Shopping',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      // Unique transaction
      {
        date: new Date('2025-01-10'),
        description: 'Amazon Purchase',
        amount: -39.99,
        category: 'Shopping',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      },
      // Near duplicate (within tolerance)
      {
        date: new Date('2025-01-05'),
        description: 'Netflix Subscription',
        amount: -15.98, // $0.01 difference, should be within tolerance
        category: 'Entertainment',
        account: 'first-tech-credit-union-first-tech-shared-checking',
        type: 'expense' as const
      }
    ];

    const duplicateResult = await dataService.detectDuplicates(newTransactions);
    
    console.log(`Mixed case test - Duplicates: ${duplicateResult.duplicates.length}, Unique: ${duplicateResult.uniqueTransactions.length}`);
    console.log('Duplicate details:', duplicateResult.duplicates.map(d => ({
      existing: d.existingTransaction.description,
      new: d.newTransaction.description,
      similarity: d.similarity,
      matchType: d.matchType
    })));
    
    // Should have 2 duplicates (exact + tolerance match) and 1 unique
    expect(duplicateResult.duplicates.length).toBe(2);
    expect(duplicateResult.uniqueTransactions.length).toBe(1);
  });
});