import { dataService } from '../services/dataService';
import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

// Increase timeout for these tests since they involve complex initialization
jest.setTimeout(15000);

describe('Transaction Deletion Unmatching', () => {
  beforeEach(async () => {
    // Clear data before each test
    try {
      const allTransactions = await dataService.getAllTransactions();
      if (allTransactions.length > 0) {
        await dataService.deleteTransactions(allTransactions.map(t => t.id));
      }
    } catch (error) {
      // If dataService is not initialized, just ensure it's ready
      await dataService.getAllTransactions(); // This triggers initialization
    }
  });

  describe('Fix 1: Unmatch before deletion', () => {
    it('should unmatch transactions before deleting a single transaction', async () => {
      // Create two matched transfer transactions
      const sourceTransaction = await dataService.addTransaction({
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer'
      });

      const targetTransaction = await dataService.addTransaction({
        date: new Date('2024-01-15'),
        description: 'Transfer from Checking',
        amount: 1000.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'transfer'
      });

      // Manually match them to simulate the existing matching process
      let transactions = await dataService.getAllTransactions();
      const matchedTransactions = await transferMatchingService.manuallyMatchTransfers(
        transactions,
        sourceTransaction.id,
        targetTransaction.id
      );

      // Update transactions in dataService
      for (const tx of matchedTransactions) {
        await dataService.updateTransaction(tx.id, {
          reimbursementId: tx.reimbursementId,
          notes: tx.notes
        });
      }

      // Verify they are matched
      transactions = await dataService.getAllTransactions();
      const source = transactions.find(tx => tx.id === sourceTransaction.id);
      const target = transactions.find(tx => tx.id === targetTransaction.id);
      expect(source?.reimbursementId).toBe(targetTransaction.id);
      expect(target?.reimbursementId).toBe(sourceTransaction.id);

      // Delete the source transaction
      const deleted = await dataService.deleteTransaction(sourceTransaction.id);
      expect(deleted).toBe(true);

      // Verify the target transaction is unmatched (reimbursementId removed)
      transactions = await dataService.getAllTransactions();
      const remainingTarget = transactions.find(tx => tx.id === targetTransaction.id);
      expect(remainingTarget).toBeDefined();
      expect(remainingTarget?.reimbursementId).toBeUndefined();
      expect(remainingTarget?.notes?.includes('[Manual Transfer Match]')).toBe(false);
    });

    it('should unmatch transactions before bulk deletion', async () => {
      // Create four transactions: two matched pairs
      const transactions = [
        {
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings 1',
          amount: -1000.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer' as const
        },
        {
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking 1',
          amount: 1000.00,
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer' as const
        },
        {
          date: new Date('2024-01-16'),
          description: 'Transfer to Savings 2',
          amount: -500.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer' as const
        },
        {
          date: new Date('2024-01-16'),
          description: 'Transfer from Checking 2',
          amount: 500.00,
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer' as const
        }
      ];

      const addedTransactions = [];
      for (const tx of transactions) {
        addedTransactions.push(await dataService.addTransaction(tx));
      }

      // Match the pairs manually
      let allTransactions = await dataService.getAllTransactions();
      
      // Match first pair
      let matchedTransactions = await transferMatchingService.manuallyMatchTransfers(
        allTransactions,
        addedTransactions[0].id,
        addedTransactions[1].id
      );
      for (const tx of matchedTransactions) {
        if (tx.reimbursementId) {
          await dataService.updateTransaction(tx.id, {
            reimbursementId: tx.reimbursementId,
            notes: tx.notes
          });
        }
      }

      // Match second pair
      allTransactions = await dataService.getAllTransactions();
      matchedTransactions = await transferMatchingService.manuallyMatchTransfers(
        allTransactions,
        addedTransactions[2].id,
        addedTransactions[3].id
      );
      for (const tx of matchedTransactions) {
        if (tx.reimbursementId) {
          await dataService.updateTransaction(tx.id, {
            reimbursementId: tx.reimbursementId,
            notes: tx.notes
          });
        }
      }

      // Verify all are matched
      allTransactions = await dataService.getAllTransactions();
      expect(allTransactions.every(tx => tx.reimbursementId)).toBe(true);

      // Delete two transactions (one from each pair)
      const deletedCount = await dataService.deleteTransactions([addedTransactions[0].id, addedTransactions[2].id]);
      expect(deletedCount).toBe(2);

      // Verify the remaining transactions are unmatched
      allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(2);
      
      const remaining1 = allTransactions.find(tx => tx.id === addedTransactions[1].id);
      const remaining2 = allTransactions.find(tx => tx.id === addedTransactions[3].id);
      
      expect(remaining1?.reimbursementId).toBeUndefined();
      expect(remaining2?.reimbursementId).toBeUndefined();
      expect(remaining1?.notes?.includes('[Manual Transfer Match]')).toBe(false);
      expect(remaining2?.notes?.includes('[Manual Transfer Match]')).toBe(false);
    });
  });

  describe('Fix 2: One-time cleanup of orphaned reimbursementId references', () => {
    it('should clean up orphaned reimbursementId references', async () => {
      // Create transactions with orphaned reimbursementId references 
      // (simulating the bug state before the fix)
      const transaction1 = await dataService.addTransaction({
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer'
      });

      const transaction2 = await dataService.addTransaction({
        date: new Date('2024-01-16'),
        description: 'Regular expense',
        amount: -50.00,
        category: 'Food & Dining',
        account: 'Checking Account',
        type: 'expense'
      });

      // Manually create orphaned references by updating the database directly
      // This simulates the buggy state where reimbursementId points to non-existent transactions
      await dataService.updateTransaction(transaction1.id, {
        reimbursementId: 'non-existent-id-1',
        notes: '[Matched Transfer: 0.95 confidence]'
      });

      await dataService.updateTransaction(transaction2.id, {
        reimbursementId: 'non-existent-id-2',
        notes: 'Some notes [Manual Transfer Match]'
      });

      // Verify orphaned references exist
      let allTransactions = await dataService.getAllTransactions();
      expect(allTransactions.find(tx => tx.id === transaction1.id)?.reimbursementId).toBe('non-existent-id-1');
      expect(allTransactions.find(tx => tx.id === transaction2.id)?.reimbursementId).toBe('non-existent-id-2');

      // Run the cleanup migration (this will be implemented)
      await (dataService as any).cleanupOrphanedMatches();

      // Verify orphaned references are cleaned up
      allTransactions = await dataService.getAllTransactions();
      const cleaned1 = allTransactions.find(tx => tx.id === transaction1.id);
      const cleaned2 = allTransactions.find(tx => tx.id === transaction2.id);

      expect(cleaned1?.reimbursementId).toBeUndefined();
      expect(cleaned2?.reimbursementId).toBeUndefined();
      
      // Verify match notes are also cleaned up
      expect(cleaned1?.notes?.includes('[Matched Transfer:')).toBe(false);
      expect(cleaned2?.notes?.includes('[Manual Transfer Match]')).toBe(false);
      expect(cleaned2?.notes).toBe('Some notes'); // Other notes should remain
    });

    it('should preserve valid reimbursementId references during cleanup', async () => {
      // Create properly matched transactions
      const sourceTransaction = await dataService.addTransaction({
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer'
      });

      const targetTransaction = await dataService.addTransaction({
        date: new Date('2024-01-15'),
        description: 'Transfer from Checking',
        amount: 1000.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'transfer'
      });

      // Create a properly matched pair
      await dataService.updateTransaction(sourceTransaction.id, {
        reimbursementId: targetTransaction.id,
        notes: '[Manual Transfer Match]'
      });

      await dataService.updateTransaction(targetTransaction.id, {
        reimbursementId: sourceTransaction.id,
        notes: '[Manual Transfer Match]'
      });

      // Add an orphaned transaction
      const orphanedTransaction = await dataService.addTransaction({
        date: new Date('2024-01-16'),
        description: 'Orphaned transaction',
        amount: -200.00,
        category: 'Food & Dining',
        account: 'Checking Account',
        type: 'expense'
      });

      await dataService.updateTransaction(orphanedTransaction.id, {
        reimbursementId: 'non-existent-id',
        notes: 'Some notes [Matched Transfer: 0.85 confidence]'
      });

      // Run cleanup
      await (dataService as any).cleanupOrphanedMatches();

      // Verify valid matches are preserved
      const allTransactions = await dataService.getAllTransactions();
      const source = allTransactions.find(tx => tx.id === sourceTransaction.id);
      const target = allTransactions.find(tx => tx.id === targetTransaction.id);
      const orphaned = allTransactions.find(tx => tx.id === orphanedTransaction.id);

      expect(source?.reimbursementId).toBe(targetTransaction.id);
      expect(target?.reimbursementId).toBe(sourceTransaction.id);
      expect(source?.notes).toContain('[Manual Transfer Match]');
      expect(target?.notes).toContain('[Manual Transfer Match]');

      // Verify orphaned reference is cleaned up
      expect(orphaned?.reimbursementId).toBeUndefined();
      expect(orphaned?.notes?.includes('[Matched Transfer:')).toBe(false);
      expect(orphaned?.notes).toBe('Some notes');
    });
  });
});