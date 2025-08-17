import { dataService } from '../services/dataService';
import { fileProcessingService } from '../services/fileProcessingService';

/**
 * Test for Issue #431: No transactions being imported when duplicates are detected
 * 
 * The issue occurs when:
 * 1. User deletes all transactions from an account
 * 2. User re-imports the same CSV file
 * 3. System correctly detects duplicates are actually gone after deletion
 * 4. But multi-file processing returns 0 transactions imported instead of importing unique transactions
 */
describe('Multi-file Processing Duplicate Resolution Issue #431', () => {
  beforeEach(async () => {
    // Clear data before each test
    await dataService.clearAllData();
    // Override the sample data initialization to prevent it from running
    (dataService as any).isInitialized = true;
  });

  it('should import unique transactions when duplicates are detected in multi-file processing', async () => {
    // Step 1: Add some initial transactions to create potential duplicates
    const existingTransaction = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Duplicate Transaction',
      amount: -25.00,
      category: 'Food & Dining',
      account: 'Chase Checking',
      type: 'expense'
    });

    // Verify initial state
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(1);

    // Step 2: Create new transactions for import - some duplicates, some unique
    const transactionsToImport = [
      {
        date: new Date('2025-01-15'),
        description: 'Duplicate Transaction', // This should be detected as duplicate
        amount: -25.00,
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-16'),
        description: 'Unique Transaction 1', // This should be imported
        amount: -15.50,
        category: 'Transportation',
        account: 'Chase Checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-17'),
        description: 'Unique Transaction 2', // This should be imported
        amount: -33.75,
        category: 'Shopping',
        account: 'Chase Checking',
        type: 'expense' as const
      }
    ];

    // Step 3: Test duplicate detection works correctly
    const duplicateResult = await dataService.detectDuplicates(transactionsToImport);
    expect(duplicateResult.duplicates).toHaveLength(1); // One duplicate found
    expect(duplicateResult.uniqueTransactions).toHaveLength(2); // Two unique transactions

    // Step 4: Simulate what multi-file processing should do when duplicates are found
    // Currently it returns 0, but it should import the unique transactions
    const fileId = `test-file-${Date.now()}`;
    
    // This simulates the fix: instead of returning 0, import unique transactions
    await fileProcessingService.resolveDuplicates(
      fileId, 
      false, // Don't import duplicates, only unique transactions
      transactionsToImport,
      duplicateResult
    );

    // Step 5: Verify the correct number of transactions were imported
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(3); // 1 original + 2 unique new = 3 total

    // Verify the unique transactions were imported correctly
    const uniqueTransaction1 = allTransactions.find(t => t.description === 'Unique Transaction 1');
    const uniqueTransaction2 = allTransactions.find(t => t.description === 'Unique Transaction 2');
    
    expect(uniqueTransaction1).toBeDefined();
    expect(uniqueTransaction1?.amount).toBe(-15.50);
    
    expect(uniqueTransaction2).toBeDefined();
    expect(uniqueTransaction2?.amount).toBe(-33.75);

    // Verify the duplicate was not imported again
    const duplicateTransactions = allTransactions.filter(t => t.description === 'Duplicate Transaction');
    expect(duplicateTransactions).toHaveLength(1); // Still only 1 (the original)
  });

  it('should handle the specific scenario from issue #431 logs', async () => {
    // Reproduce the scenario from the logs:
    // - User had transactions, deleted them, then re-imported
    // - 37 transactions processed, 2 duplicates found, but 0 imported
    
    // Step 1: Add transactions that will be "deleted"
    const initialTransactions = [
      {
        date: new Date('2024-07-25'),
        description: 'LØNOVERFØRSEL',
        amount: 167818.38,
        category: 'Income',
        account: 'danske-bank-michael-joseph-morton',
        type: 'income' as const
      },
      {
        date: new Date('2024-12-31'),
        description: 'Interest',
        amount: 125,
        category: 'Investment Income',
        account: 'danske-bank-michael-joseph-morton', 
        type: 'income' as const
      }
    ];

    const addedInitial = await dataService.addTransactions(initialTransactions);
    expect(addedInitial).toHaveLength(2);

    // Step 2: Delete all transactions (simulating user's action)
    const allInitial = await dataService.getAllTransactions();
    const deleteResult = await dataService.deleteTransactions(allInitial.map(t => t.id));
    expect(deleteResult).toBe(2);

    // Verify deletion
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);

    // Step 3: Try to re-import the same transactions (simulating CSV re-upload)
    const reimportTransactions = [
      {
        date: new Date('2024-07-25'),
        description: 'LØNOVERFØRSEL',
        amount: 167818.38,
        category: 'Income',
        account: 'danske-bank-michael-joseph-morton',
        type: 'income' as const
      },
      {
        date: new Date('2024-12-31'), 
        description: 'Interest',
        amount: 125,
        category: 'Investment Income',
        account: 'danske-bank-michael-joseph-morton',
        type: 'income' as const
      },
      {
        date: new Date('2024-08-15'),
        description: 'New Transaction',
        amount: -500,
        category: 'Shopping',
        account: 'danske-bank-michael-joseph-morton',
        type: 'expense' as const
      }
    ];

    // Step 4: Check for duplicates (should find none since transactions were deleted)
    const duplicateResult = await dataService.detectDuplicates(reimportTransactions);
    
    // CRITICAL: Should be NO duplicates since transactions were deleted
    expect(duplicateResult.duplicates).toHaveLength(0);
    expect(duplicateResult.uniqueTransactions).toHaveLength(3);

    // Step 5: Import the unique transactions (this is what should happen)
    const fileId = `test-reimage-${Date.now()}`;
    await fileProcessingService.resolveDuplicates(
      fileId,
      false,
      reimportTransactions,
      duplicateResult  
    );

    // Step 6: Verify all transactions were imported correctly
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(3); // Should have imported all 3

    // Verify specific transactions
    const salaryTx = allTransactions.find(t => t.description === 'LØNOVERFØRSEL');
    const interestTx = allTransactions.find(t => t.description === 'Interest');
    const newTx = allTransactions.find(t => t.description === 'New Transaction');

    expect(salaryTx).toBeDefined();
    expect(salaryTx?.amount).toBe(167818.38);
    
    expect(interestTx).toBeDefined(); 
    expect(interestTx?.amount).toBe(125);
    
    expect(newTx).toBeDefined();
    expect(newTx?.amount).toBe(-500);
  });
});