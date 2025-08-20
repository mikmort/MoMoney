import { dataService } from '../services/dataService';
import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transfer Matching Deletion Bug Fix', () => {
  beforeEach(async () => {
    // Clear data before each test
    await dataService.clearAllData();
  });

  test('deleteTransaction should unmatch any transactions referencing the deleted transaction', async () => {
    console.log('🧪 Testing that deleteTransaction unmatches referencing transactions...');
    
    // Create transactions that will auto-match when added as transfers
    const sourceTransaction: Omit<Transaction, 'id'> = {
      date: new Date('2024-01-15'),
      description: 'Transfer to Savings',
      amount: -1000.00,
      category: 'Internal Transfer',
      account: 'Checking Account',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const targetTransaction: Omit<Transaction, 'id'> = {
      date: new Date('2024-01-15'),
      description: 'Transfer from Checking',
      amount: 1000.00,
      category: 'Internal Transfer',
      account: 'Savings Account',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    // Add transactions and let auto-matching create the links
    const addedSource = await dataService.addTransaction(sourceTransaction);
    const addedTarget = await dataService.addTransaction(targetTransaction);

    // Verify the match was created by auto-matching
    let allTransactions = await dataService.getAllTransactions();
    let sourceTx = allTransactions.find(tx => tx.id === addedSource.id);
    let targetTx = allTransactions.find(tx => tx.id === addedTarget.id);
    
    expect(sourceTx).toBeDefined();
    expect(targetTx).toBeDefined();
    
    // Auto-matching should have created a match between these transactions
    expect(sourceTx?.reimbursementId).toBeTruthy();
    expect(targetTx?.reimbursementId).toBeTruthy();
    expect(sourceTx?.notes).toContain('Matched Transfer');
    expect(targetTx?.notes).toContain('Matched Transfer');

    // The reimbursementIds should point to each other
    expect(sourceTx?.reimbursementId).toBe(targetTx?.id);
    expect(targetTx?.reimbursementId).toBe(sourceTx?.id);

    // Delete the target transaction
    const deleteResult = await dataService.deleteTransaction(addedTarget.id);
    expect(deleteResult).toBe(true);

    // Check that the source transaction no longer has a reimbursementId
    allTransactions = await dataService.getAllTransactions();
    const remainingSourceTx = allTransactions.find(tx => tx.id === addedSource.id);
    const deletedTargetTx = allTransactions.find(tx => tx.id === addedTarget.id);
    
    expect(remainingSourceTx).toBeDefined();
    expect(deletedTargetTx).toBeUndefined(); // Should be deleted
    expect(remainingSourceTx?.reimbursementId).toBeUndefined(); // Should be unmatched
    expect(remainingSourceTx?.notes || '').not.toContain('Matched Transfer'); // Match note should be removed
    
    console.log('✅ Single transaction deletion correctly unmaches referencing transactions');
  });

  test('deleteTransactions should unmatch any transactions referencing the deleted transactions', async () => {
    console.log('🧪 Testing that deleteTransactions unmatches referencing transactions...');
    
    // Create transactions without automatic matching by using non-transfer types initially
    const baseTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'expense', // Start as expense
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        date: new Date('2024-01-15'),
        description: 'Transfer from Checking',
        amount: 1000.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'income', // Start as income
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        date: new Date('2024-01-16'),
        description: 'Another Transfer',
        amount: -500.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'expense', // Start as expense
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        date: new Date('2024-01-16'),
        description: 'Another Transfer In',
        amount: 500.00,
        category: 'Internal Transfer',
        account: 'Investment Account',
        type: 'income', // Start as income
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    // Add all transactions
    const addedTransactions: Transaction[] = [];
    for (const baseTx of baseTransactions) {
      const added = await dataService.addTransaction(baseTx);
      addedTransactions.push(added);
    }

    // Now manually create matches by updating them to transfers with reimbursementId
    const tx1 = addedTransactions[0];
    const tx2 = addedTransactions[1];
    const tx3 = addedTransactions[2];
    const tx4 = addedTransactions[3];

    await dataService.updateTransaction(tx1.id, {
      ...tx1,
      type: 'transfer',
      reimbursementId: tx2.id,
      notes: '[Matched Transfer: 0.95 confidence]'
    });

    await dataService.updateTransaction(tx2.id, {
      ...tx2,
      type: 'transfer',
      reimbursementId: tx1.id,
      notes: '[Matched Transfer: 0.95 confidence]'
    });

    await dataService.updateTransaction(tx3.id, {
      ...tx3,
      type: 'transfer',
      reimbursementId: tx4.id,
      notes: '[Matched Transfer: 0.92 confidence]'
    });

    await dataService.updateTransaction(tx4.id, {
      ...tx4,
      type: 'transfer',
      reimbursementId: tx3.id,
      notes: '[Matched Transfer: 0.92 confidence]'
    });

    // Verify matches exist
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions.length).toBe(4);
    expect(allTransactions.every(tx => tx.reimbursementId)).toBe(true);

    // Delete tx-2 and tx-4 (bulk delete)
    const deletedCount = await dataService.deleteTransactions([tx2.id, tx4.id]);
    expect(deletedCount).toBe(2);

    // Check that tx-1 and tx-3 no longer have reimbursementId
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions.length).toBe(2);
    
    const remainingTx1 = allTransactions.find(tx => tx.id === tx1.id);
    const remainingTx3 = allTransactions.find(tx => tx.id === tx3.id);
    
    expect(remainingTx1?.reimbursementId).toBeUndefined();
    expect(remainingTx3?.reimbursementId).toBeUndefined();
    expect(remainingTx1?.notes || '').not.toContain('Matched Transfer');
    expect(remainingTx3?.notes || '').not.toContain('Matched Transfer');
    
    console.log('✅ Bulk transaction deletion correctly unmatches referencing transactions');
  });

  test('cleanupOrphanedReimbursementIds should fix existing database with orphaned references', async () => {
    console.log('🧪 Testing orphaned reimbursementId cleanup...');
    
    // Create corrupted transactions by adding them as non-transfers first to avoid automatic matching
    const baseTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-15'),
        description: 'Transfer with orphaned reference',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'expense', // Start as expense to avoid auto-matching
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        date: new Date('2024-01-16'),
        description: 'Valid transaction',
        amount: -500.00,
        category: 'Food & Dining',
        account: 'Checking Account',
        type: 'expense',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
        // No reimbursementId - this is valid
      },
      {
        date: new Date('2024-01-17'),
        description: 'Another orphaned reference',
        amount: 200.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'income', // Start as income to avoid auto-matching
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    // Add all transactions first
    const addedTransactions: Transaction[] = [];
    for (const baseTx of baseTransactions) {
      const added = await dataService.addTransaction(baseTx);
      addedTransactions.push(added);
    }

    // Now manually corrupt them by adding orphaned reimbursementId references
    const tx1 = addedTransactions[0];
    const tx3 = addedTransactions[2];

    await dataService.updateTransaction(tx1.id, {
      ...tx1,
      type: 'transfer',
      reimbursementId: 'non-existent-tx', // Points to non-existent transaction
      notes: '[Matched Transfer: 0.95 confidence] Some other notes'
    });

    await dataService.updateTransaction(tx3.id, {
      ...tx3,
      type: 'transfer',
      reimbursementId: 'another-missing-tx', // Another orphaned reference
      notes: 'Some notes [Matched Transfer: 0.88 confidence] more notes'
    });

    // Verify initial corrupted state
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions.length).toBe(3);
    expect(allTransactions.filter(tx => tx.reimbursementId).length).toBe(2); // Two have orphaned references

    // Run the cleanup
    const cleanedCount = await dataService.cleanupOrphanedReimbursementIds();
    expect(cleanedCount).toBe(2); // Should clean up 2 orphaned references

    // Verify cleanup worked
    allTransactions = await dataService.getAllTransactions();
    expect(allTransactions.length).toBe(3); // All transactions should still exist
    expect(allTransactions.filter(tx => tx.reimbursementId).length).toBe(0); // No orphaned references

    const cleanedTx1 = allTransactions.find(tx => tx.id === tx1.id);
    const cleanedTx3 = allTransactions.find(tx => tx.id === tx3.id);
    
    expect(cleanedTx1?.reimbursementId).toBeUndefined();
    expect(cleanedTx3?.reimbursementId).toBeUndefined();
    // Verify match notes were removed but other notes preserved
    expect(cleanedTx1?.notes).toBe('Some other notes');
    expect(cleanedTx3?.notes).toBe('Some notes more notes');
    
    console.log('✅ Orphaned reimbursementId cleanup works correctly');
  });

  test('transferMatchingService helper methods work correctly', async () => {
    console.log('🧪 Testing transferMatchingService helper methods...');
    
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'Transaction 1',
        amount: -100.00,
        category: 'Test',
        account: 'Account A',
        type: 'expense',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false,
        reimbursementId: 'tx-2'
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-15'),
        description: 'Transaction 2',
        amount: 100.00,
        category: 'Test',
        account: 'Account B',
        type: 'income',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false,
        reimbursementId: 'tx-1'
      },
      {
        id: 'tx-3',
        date: new Date('2024-01-16'),
        description: 'Transaction 3',
        amount: -50.00,
        category: 'Test',
        account: 'Account A',
        type: 'expense',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false,
        reimbursementId: 'tx-2' // Also references tx-2
      }
    ];

    // Test findTransactionsReferencingId
    const referencingTx2 = transferMatchingService.findTransactionsReferencingId(transactions, 'tx-2');
    expect(referencingTx2.length).toBe(2); // tx-1 and tx-3 both reference tx-2
    expect(referencingTx2.map(tx => tx.id)).toContain('tx-1');
    expect(referencingTx2.map(tx => tx.id)).toContain('tx-3');

    // Test unmatchTransactionsReferencingIds
    const updatedTransactions = await transferMatchingService.unmatchTransactionsReferencingIds(transactions, ['tx-2']);
    
    // tx-1 and tx-3 should no longer reference tx-2
    const updatedTx1 = updatedTransactions.find(tx => tx.id === 'tx-1');
    const updatedTx3 = updatedTransactions.find(tx => tx.id === 'tx-3');
    const updatedTx2 = updatedTransactions.find(tx => tx.id === 'tx-2');
    
    expect(updatedTx1?.reimbursementId).toBeUndefined();
    expect(updatedTx3?.reimbursementId).toBeUndefined();
    expect(updatedTx2?.reimbursementId).toBe('tx-1'); // tx-2 still references tx-1 since tx-1 wasn't deleted
    
    console.log('✅ TransferMatchingService helper methods work correctly');
  });
});