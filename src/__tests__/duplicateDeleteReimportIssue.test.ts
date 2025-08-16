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
    console.log('History before deletion:', history);

    // Delete the transaction
    const deleteSuccess = await dataService.deleteTransaction(transaction.id);
    expect(deleteSuccess).toBe(true);

    // Check if history still exists after deletion (THIS MIGHT BE THE ISSUE)
    history = await dataService.getTransactionHistory(transaction.id);
    console.log('History after deletion:', history);
    // Note: History might still exist - this could be the problem!

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
    console.log('All transactions before delete:', allTransactions.map(t => ({ id: t.id, desc: t.description })));

    // Delete the transaction
    await dataService.deleteTransaction(transaction.id);

    // Check in-memory state
    allTransactions = await dataService.getAllTransactions();
    console.log('All transactions after delete:', allTransactions.map(t => ({ id: t.id, desc: t.description })));

    // Check if the deleted transaction's data is somehow still accessible through history
    const historyAfterDelete = await dataService.getTransactionHistory(transaction.id);
    console.log('History of deleted transaction:', historyAfterDelete);

    // Try duplicate detection with original transaction data
    const duplicateResult = await dataService.detectDuplicates([{
      date: new Date('2025-01-25'),
      description: 'Potential History Issue Transaction', // Original description
      amount: -30.00, // Original amount
      category: 'Testing', // Original category
      account: 'Test Account',
      type: 'expense' as const
    }]);

    console.log('Duplicate detection result with history present:', duplicateResult);
    
    // Should be no duplicates since transaction was deleted
    expect(duplicateResult.duplicates).toHaveLength(0);
  });
});