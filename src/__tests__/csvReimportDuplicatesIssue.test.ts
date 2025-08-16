import { dataService } from '../services/dataService';
import { fileProcessingService } from '../services/fileProcessingService';
import { Transaction } from '../types';

describe('CSV Re-import Duplicates Issue (Issue #407)', () => {
  beforeEach(async () => {
    // Clear data before each test
    await dataService.clearAllData();
    // Override the sample data initialization to prevent it from running
    (dataService as any).isInitialized = true;
  });

  it('should NOT create duplicate transactions with flipped amounts when re-importing CSV after deletion', async () => {
    // Step 1: Create initial transactions that simulate a CSV import for an account
    // For accounts where expenses are positive and income negative (as mentioned in the issue)
    const initialTransactions = [
      {
        date: new Date('2025-01-15'),
        description: 'Insurance',
        amount: 242.30, // Positive amount (expense)
        category: 'Insurance',
        account: 'Chase Checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-16'),
        description: 'Salary Deposit',
        amount: -3000.00, // Negative amount (income)
        category: 'Income',
        account: 'Chase Checking',
        type: 'income' as const
      },
      {
        date: new Date('2025-01-17'),
        description: 'Gas Station',
        amount: 45.50, // Positive amount (expense)
        category: 'Transportation',
        account: 'Chase Checking',
        type: 'expense' as const
      }
    ];

    // Add the initial transactions (simulating first CSV import)
    const addedTransactions = await dataService.addTransactions(initialTransactions);
    expect(addedTransactions).toHaveLength(3);

    // Verify initial state
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(3);
    
    // Check that we have the expected amounts
    const insuranceTransaction = allTransactions.find(t => t.description === 'Insurance');
    expect(insuranceTransaction?.amount).toBe(242.30);

    console.log('Initial transactions added:', allTransactions.map(t => `${t.description}: ${t.amount}`));

    // Step 2: Delete all transactions for the account (user deletes transactions)
    const transactionIds = allTransactions.map(t => t.id);
    const deletedCount = await dataService.deleteTransactions(transactionIds);
    expect(deletedCount).toBe(3);

    // Verify transactions are deleted
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);
    
    console.log('All transactions deleted, count now:', allTransactions.length);

    // Step 3: Re-import the same transactions (simulating user re-uploading same CSV file)
    // This should NOT detect the deleted transactions as duplicates
    const duplicateDetectionResult = await dataService.detectDuplicates(initialTransactions);
    
    console.log('Duplicate detection result after deletion:', {
      duplicatesFound: duplicateDetectionResult.duplicates.length,
      uniqueTransactions: duplicateDetectionResult.uniqueTransactions.length
    });

    // CRITICAL ASSERTION: Should NOT find any duplicates since transactions were deleted
    expect(duplicateDetectionResult.duplicates).toHaveLength(0);
    expect(duplicateDetectionResult.uniqueTransactions).toHaveLength(3);

    // Step 4: Add the "re-imported" transactions
    const reimportedTransactions = await dataService.addTransactions(duplicateDetectionResult.uniqueTransactions);
    expect(reimportedTransactions).toHaveLength(3);

    // Step 5: Verify final state - should have original amounts, NO duplicates with flipped signs
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(3);

    // Check specific transaction amounts to ensure no duplicates with flipped signs
    const finalInsuranceTransactions = allTransactions.filter(t => t.description === 'Insurance');
    expect(finalInsuranceTransactions).toHaveLength(1); // Should be exactly 1, not multiple
    expect(finalInsuranceTransactions[0].amount).toBe(242.30); // Should be positive as originally imported

    const finalSalaryTransactions = allTransactions.filter(t => t.description === 'Salary Deposit');
    expect(finalSalaryTransactions).toHaveLength(1); // Should be exactly 1, not multiple  
    expect(finalSalaryTransactions[0].amount).toBe(-3000.00); // Should be negative as originally imported

    const finalGasTransactions = allTransactions.filter(t => t.description === 'Gas Station');
    expect(finalGasTransactions).toHaveLength(1); // Should be exactly 1, not multiple
    expect(finalGasTransactions[0].amount).toBe(45.50); // Should be positive as originally imported

    console.log('Final transactions after re-import:', allTransactions.map(t => `${t.description}: ${t.amount}`));

    // CRITICAL ASSERTION: No transaction should have a duplicate with flipped sign
    const descriptions = new Set(allTransactions.map(t => t.description));
    expect(descriptions.size).toBe(3); // Should have 3 unique descriptions, no duplicates

    // Verify no amount flipping has occurred
    allTransactions.forEach(transaction => {
      const matchingOriginal = initialTransactions.find(orig => orig.description === transaction.description);
      expect(transaction.amount).toBe(matchingOriginal?.amount);
    });
  });

  it('should handle app reload scenarios without re-adding deleted transactions', async () => {
    // This test simulates the "reloading the app" scenario mentioned in the issue
    
    // Step 1: Add initial transactions
    const initialTransactions = [
      {
        date: new Date('2025-01-20'),
        description: 'Insurance',
        amount: 242.30,
        category: 'Insurance',
        account: 'Chase Checking',
        type: 'expense' as const
      }
    ];

    await dataService.addTransactions(initialTransactions);
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(1);

    // Step 2: Delete the transaction
    const deleteResult = await dataService.deleteTransaction(allTransactions[0].id);
    expect(deleteResult).toBe(true);
    
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);

    // Step 3: Simulate app reload by re-initializing dataService
    // Force re-initialization to simulate app reload
    (dataService as any).isInitialized = false;
    await dataService.ensureInitialized();

    // Step 4: Verify transactions are still deleted after "reload"
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);
    
    console.log('Transactions after simulated app reload:', allTransactions.length);

    // Step 5: Try to import the same transaction again
    const duplicateResult = await dataService.detectDuplicates(initialTransactions);
    expect(duplicateResult.duplicates).toHaveLength(0); // Should not detect as duplicate

    // Step 6: Add the transaction
    const addedTransactions = await dataService.addTransactions(duplicateResult.uniqueTransactions);
    expect(addedTransactions).toHaveLength(1);

    // Step 7: Final verification - should have exactly 1 transaction, no duplicates
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(1);
    expect(allTransactions[0].amount).toBe(242.30); // Original amount
  });
});