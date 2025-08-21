/**
 * Test to verify bulk deletion properly handles matched transfer pairs
 * and doesn't create orphaned reimbursementId references
 */

import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Bulk Deletion Orphan Prevention', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
  });

  afterEach(async () => {
    await dataService.clearAllData();
  });

  test('should not create orphaned references when deleting both transactions in a matched pair', async () => {
    // Create a matched transfer pair
    const transactionA: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer A',
      category: 'Internal Transfer',
      amount: -100,
      account: 'Account A',
      type: 'transfer'
    };

    const transactionB: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer B',
      category: 'Internal Transfer',
      amount: 100,
      account: 'Account B',
      type: 'transfer'
    };

    // Add transactions
    const [addedA, addedB] = await dataService.addTransactions([transactionA, transactionB]);

    // Create proper match between A and B
    await dataService.updateTransaction(addedA.id, { reimbursementId: addedB.id });
    await dataService.updateTransaction(addedB.id, { reimbursementId: addedA.id });

    // Verify they are matched
    const beforeDeletion = await dataService.diagnoseTransferMatchingInconsistencies();
    expect(beforeDeletion.actualMatches).toBe(1);
    expect(beforeDeletion.matchedTransferTransactions).toBe(2);
    expect(beforeDeletion.orphanedReimbursementIds).toHaveLength(0);

    // Delete both transactions in bulk
    const deletedCount = await dataService.deleteTransactions([addedA.id, addedB.id]);
    expect(deletedCount).toBe(2);

    // Verify no orphaned references remain
    const afterDeletion = await dataService.diagnoseTransferMatchingInconsistencies();
    expect(afterDeletion.actualMatches).toBe(0);
    expect(afterDeletion.matchedTransferTransactions).toBe(0);
    expect(afterDeletion.orphanedReimbursementIds).toHaveLength(0);
  });

  test('should properly unmatch when deleting only one transaction from a matched pair', async () => {
    // Create a matched transfer pair
    const transactionA: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer A',
      category: 'Internal Transfer',
      amount: -100,
      account: 'Account A',
      type: 'transfer'
    };

    const transactionB: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer B',
      category: 'Internal Transfer',
      amount: 100,
      account: 'Account B',
      type: 'transfer'
    };

    // Add transactions
    const [addedA, addedB] = await dataService.addTransactions([transactionA, transactionB]);

    // Create proper match between A and B
    await dataService.updateTransaction(addedA.id, { reimbursementId: addedB.id });
    await dataService.updateTransaction(addedB.id, { reimbursementId: addedA.id });

    // Delete only transaction A
    const deletedCount = await dataService.deleteTransactions([addedA.id]);
    expect(deletedCount).toBe(1);

    // Verify transaction B has been unmatched and no orphaned references remain
    const afterDeletion = await dataService.diagnoseTransferMatchingInconsistencies();
    expect(afterDeletion.actualMatches).toBe(0);
    expect(afterDeletion.matchedTransferTransactions).toBe(0);
    expect(afterDeletion.orphanedReimbursementIds).toHaveLength(0);

    // Verify transaction B still exists but is unmatched
    const transactionBAfter = await dataService.getTransactionById(addedB.id);
    expect(transactionBAfter).not.toBeNull();
    expect(transactionBAfter?.reimbursementId).toBeUndefined();
  });

  test('should handle mixed bulk deletion (some matched, some unmatched)', async () => {
    // Create mixed scenario: matched pair + unmatched transfer
    const transactionA: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer A',
      category: 'Internal Transfer',
      amount: -100,
      account: 'Account A',
      type: 'transfer'
    };

    const transactionB: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer B',
      category: 'Internal Transfer',
      amount: 100,
      account: 'Account B',
      type: 'transfer'
    };

    const transactionC: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer C - Unmatched',
      category: 'Internal Transfer',
      amount: -50,
      account: 'Account A',
      type: 'transfer'
    };

    // Add transactions
    const [addedA, addedB, addedC] = await dataService.addTransactions([transactionA, transactionB, transactionC]);

    // Create match between A and B only
    await dataService.updateTransaction(addedA.id, { reimbursementId: addedB.id });
    await dataService.updateTransaction(addedB.id, { reimbursementId: addedA.id });

    // Delete A and C in bulk (leaving B unmatched)
    const deletedCount = await dataService.deleteTransactions([addedA.id, addedC.id]);
    expect(deletedCount).toBe(2);

    // Verify no orphaned references remain
    const afterDeletion = await dataService.diagnoseTransferMatchingInconsistencies();
    expect(afterDeletion.actualMatches).toBe(0);
    expect(afterDeletion.matchedTransferTransactions).toBe(0);
    expect(afterDeletion.orphanedReimbursementIds).toHaveLength(0);

    // Verify transaction B still exists but is unmatched
    const transactionBAfter = await dataService.getTransactionById(addedB.id);
    expect(transactionBAfter).not.toBeNull();
    expect(transactionBAfter?.reimbursementId).toBeUndefined();
  });
});
