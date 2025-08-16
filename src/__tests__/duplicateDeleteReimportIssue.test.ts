import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Duplicate Detection After Delete and Re-import Issue', () => {
  beforeEach(async () => {
    // Clear data before each test and prevent re-initialization with sample data
    await dataService.clearAllData();
    // Override the sample data initialization to prevent it from running
    (dataService as any).isInitialized = true;
  });

  it('should NOT flag re-imported transactions as duplicates after original is deleted', async () => {
    // Step 1: Add initial transactions
    const transaction1 = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Starbucks Coffee Shop',
      amount: -5.50,
      category: 'Food & Dining',
      account: 'Chase Checking',
      type: 'expense'
    });

    const transaction2 = await dataService.addTransaction({
      date: new Date('2025-01-16'), 
      description: 'Gas Station',
      amount: -45.00,
      category: 'Transportation',
      account: 'Chase Checking',
      type: 'expense'
    });

    // Verify initial transactions exist
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(2);

    // Step 2: Delete the transactions
    const deleteSuccess = await dataService.deleteTransactions([transaction1.id, transaction2.id]);
    expect(deleteSuccess).toBe(2);

    // Verify transactions are deleted
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);

    // Step 3: Try to re-import the same transactions (simulating CSV re-import)
    const newTransactionsToImport = [
      {
        date: new Date('2025-01-15'),
        description: 'Starbucks Coffee Shop',
        amount: -5.50,
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-16'),
        description: 'Gas Station', 
        amount: -45.00,
        category: 'Transportation',
        account: 'Chase Checking',
        type: 'expense' as const
      }
    ];

    // Step 4: Check for duplicates before re-importing
    const duplicateResult = await dataService.detectDuplicates(newTransactionsToImport);
    
    // ASSERTION: Should NOT find any duplicates since original transactions were deleted
    expect(duplicateResult.duplicates).toHaveLength(0);
    expect(duplicateResult.uniqueTransactions).toHaveLength(2);

    console.log('Duplicate detection result:', duplicateResult);
    
    // Step 5: Actually import the transactions
    const addedTransactions = await dataService.addTransactions(duplicateResult.uniqueTransactions);
    expect(addedTransactions).toHaveLength(2);

    // Verify final state
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(2);
  });

  it('should properly clear transaction history when transactions are deleted', async () => {
    // Add a transaction
    const transaction = await dataService.addTransaction({
      date: new Date('2025-01-20'),
      description: 'Test Transaction for History',
      amount: -25.00,
      category: 'Testing',
      account: 'Test Account',
      type: 'expense'
    });

    // Edit the transaction to create history
    await dataService.updateTransaction(transaction.id, {
      description: 'Updated Test Transaction'
    });

    // Verify history exists
    let history = await dataService.getTransactionHistory(transaction.id);
    expect(history.length).toBeGreaterThan(0);
    console.log('History before deletion:', history.length, 'records');

    // Delete the transaction
    const deleteSuccess = await dataService.deleteTransaction(transaction.id);
    expect(deleteSuccess).toBe(true);

    // Check if history is properly cleaned up after deletion (THIS SHOULD NOW WORK)
    history = await dataService.getTransactionHistory(transaction.id);
    console.log('History after deletion:', history.length, 'records');
    
    // ASSERTION: History should be cleaned up
    expect(history).toHaveLength(0);

    // Try to import the same transaction again (original data)
    const reimportTransactions = [{
      date: new Date('2025-01-20'),
      description: 'Test Transaction for History',
      amount: -25.00,
      category: 'Testing',
      account: 'Test Account',
      type: 'expense' as const
    }];

    // Should NOT detect as duplicate
    const duplicateResult = await dataService.detectDuplicates(reimportTransactions);
    expect(duplicateResult.duplicates).toHaveLength(0);
    expect(duplicateResult.uniqueTransactions).toHaveLength(1);
  });

  it('should investigate potential history interference in duplicate detection', async () => {
    // Let's explore if there's some edge case where history could interfere
    
    // Add a transaction
    const transaction = await dataService.addTransaction({
      date: new Date('2025-01-25'),
      description: 'Potential History Issue Transaction',
      amount: -30.00,
      category: 'Testing',
      account: 'Test Account',
      type: 'expense'
    });

    // Create some history by updating
    await dataService.updateTransaction(transaction.id, {
      category: 'Updated Category'
    });
    
    await dataService.updateTransaction(transaction.id, {
      amount: -35.00
    });

    // Get all transactions to see current state
    let allTransactions = await dataService.getAllTransactions();
    console.log('All transactions before delete:', allTransactions.length);

    // Delete the transaction
    await dataService.deleteTransaction(transaction.id);

    // Check in-memory state
    allTransactions = await dataService.getAllTransactions();
    console.log('All transactions after delete:', allTransactions.length);

    // Check if the deleted transaction's data is properly cleaned up
    const historyAfterDelete = await dataService.getTransactionHistory(transaction.id);
    console.log('History of deleted transaction:', historyAfterDelete.length, 'records');
    
    // ASSERTION: History should be cleaned up
    expect(historyAfterDelete).toHaveLength(0);

    // Try duplicate detection with original transaction data
    const duplicateResult = await dataService.detectDuplicates([{
      date: new Date('2025-01-25'),
      description: 'Potential History Issue Transaction', // Original description
      amount: -30.00, // Original amount
      category: 'Testing', // Original category
      account: 'Test Account',
      type: 'expense' as const
    }]);

    console.log('Duplicate detection result:', duplicateResult.duplicates.length, 'duplicates found');
    
    // Should be no duplicates since transaction was deleted
    expect(duplicateResult.duplicates).toHaveLength(0);
  });

  it('should properly clean up history for bulk transaction deletion', async () => {
    // Add multiple transactions
    const transaction1 = await dataService.addTransaction({
      date: new Date('2025-01-30'),
      description: 'Bulk Delete Test 1',
      amount: -10.00,
      category: 'Testing',
      account: 'Test Account',
      type: 'expense'
    });

    const transaction2 = await dataService.addTransaction({
      date: new Date('2025-01-31'),
      description: 'Bulk Delete Test 2',
      amount: -20.00,
      category: 'Testing',
      account: 'Test Account',
      type: 'expense'
    });

    // Create history for both transactions
    await dataService.updateTransaction(transaction1.id, { amount: -15.00 });
    await dataService.updateTransaction(transaction2.id, { amount: -25.00 });

    // Verify history exists for both
    let history1 = await dataService.getTransactionHistory(transaction1.id);
    let history2 = await dataService.getTransactionHistory(transaction2.id);
    expect(history1.length).toBeGreaterThan(0);
    expect(history2.length).toBeGreaterThan(0);
    console.log('History before bulk delete:', { tx1: history1.length, tx2: history2.length });

    // Bulk delete both transactions
    const deleteCount = await dataService.deleteTransactions([transaction1.id, transaction2.id]);
    expect(deleteCount).toBe(2);

    // Check that history is cleaned up for both
    history1 = await dataService.getTransactionHistory(transaction1.id);
    history2 = await dataService.getTransactionHistory(transaction2.id);
    console.log('History after bulk delete:', { tx1: history1.length, tx2: history2.length });
    
    expect(history1).toHaveLength(0);
    expect(history2).toHaveLength(0);

    // Verify transactions are no longer in the system
    const allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(0);

    // Test duplicate detection with the original transactions
    const reimportResult = await dataService.detectDuplicates([
      {
        date: new Date('2025-01-30'),
        description: 'Bulk Delete Test 1',
        amount: -10.00,
        category: 'Testing',
        account: 'Test Account',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-31'),
        description: 'Bulk Delete Test 2',
        amount: -20.00,
        category: 'Testing',
        account: 'Test Account',
        type: 'expense' as const
      }
    ]);

    // Should detect no duplicates
    expect(reimportResult.duplicates).toHaveLength(0);
    expect(reimportResult.uniqueTransactions).toHaveLength(2);
  });
});