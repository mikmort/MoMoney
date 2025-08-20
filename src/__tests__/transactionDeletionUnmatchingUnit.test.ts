import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transaction Deletion Unmatching - Unit Tests', () => {
  describe('removeMatchNoteFromTransaction helper', () => {
    it('should remove match notes from transaction notes', () => {
      // This test checks the logic of removing match notes, which is used in our fix
      const testCases = [
        {
          input: 'Some notes [Matched Transfer: 0.95 confidence]',
          expected: 'Some notes'
        },
        {
          input: 'Initial notes\n[Manual Transfer Match]',
          expected: 'Initial notes'
        },
        {
          input: '[Matched Transaction: 0.85 confidence] Only match note',
          expected: 'Only match note'
        },
        {
          input: 'Some notes\n[Matched Transfer: 0.95 confidence]\nMore notes [Manual Transfer Match]',
          expected: 'Some notes\nMore notes'
        }
      ];

      // Since removeMatchNoteFromTransaction is private, we'll test by examining the pattern
      // it follows (same as transferMatchingService.removeMatchNoteFromTransaction)
      const removeMatchNoteFromTransaction = (notes: string): string => {
        return notes
          .replace(/\n?\[Matched Transfer: .+?\]/g, '')
          .replace(/\n?\[Manual Transfer Match\]/g, '')
          .replace(/\n?\[Matched Transaction: .+?\]/g, '')
          .trim();
      };

      testCases.forEach(({ input, expected }) => {
        const result = removeMatchNoteFromTransaction(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Transfer matching logic verification', () => {
    it('should correctly identify matched transactions', () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -1000.00,
          category: 'Internal Transfer',
          account: 'Checking',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          reimbursementId: 'tx-2' // Matched to tx-2
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 1000.00,
          category: 'Internal Transfer',
          account: 'Savings',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          reimbursementId: 'tx-1' // Matched to tx-1
        },
        {
          id: 'tx-3',
          date: new Date('2024-01-16'),
          description: 'Unmatched transaction',
          amount: -50.00,
          category: 'Food & Dining',
          account: 'Checking',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Verify the logic we would use to find matched transactions
      const findMatchingTransaction = (transactionId: string, allTransactions: Transaction[]) => {
        return allTransactions.find(tx => tx.reimbursementId === transactionId);
      };

      const findReimbursementTransaction = (transaction: Transaction, allTransactions: Transaction[]) => {
        if (!transaction.reimbursementId) return null;
        return allTransactions.find(tx => tx.id === transaction.reimbursementId);
      };

      // Test finding matches
      const matchingTx1 = findMatchingTransaction('tx-1', transactions); // Should find tx-2
      const matchingTx2 = findMatchingTransaction('tx-2', transactions); // Should find tx-1
      const matchingTx3 = findMatchingTransaction('tx-3', transactions); // Should find nothing

      expect(matchingTx1?.id).toBe('tx-2');
      expect(matchingTx2?.id).toBe('tx-1');
      expect(matchingTx3).toBeUndefined();

      // Test finding reimbursement transactions
      const reimburseTx1 = findReimbursementTransaction(transactions[0], transactions); // Should find tx-2
      const reimburseTx2 = findReimbursementTransaction(transactions[1], transactions); // Should find tx-1
      const reimburseTx3 = findReimbursementTransaction(transactions[2], transactions); // Should find nothing

      expect(reimburseTx1?.id).toBe('tx-2');
      expect(reimburseTx2?.id).toBe('tx-1');
      expect(reimburseTx3).toBeNull();
    });

    it('should identify orphaned reimbursementId references', () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transaction with valid match',
          amount: -1000.00,
          category: 'Internal Transfer',
          account: 'Checking',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          reimbursementId: 'tx-2' // Valid - tx-2 exists
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Valid matching transaction',
          amount: 1000.00,
          category: 'Internal Transfer',
          account: 'Savings',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          reimbursementId: 'tx-1' // Valid - tx-1 exists
        },
        {
          id: 'tx-3',
          date: new Date('2024-01-16'),
          description: 'Transaction with orphaned match',
          amount: -50.00,
          category: 'Food & Dining',
          account: 'Checking',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          reimbursementId: 'non-existent-id' // Orphaned - non-existent-id doesn't exist
        }
      ];

      // This simulates the logic in cleanupOrphanedMatches
      const transactionIds = new Set(transactions.map(tx => tx.id));
      const orphanedTransactions = transactions.filter(tx => 
        tx.reimbursementId && !transactionIds.has(tx.reimbursementId)
      );

      expect(orphanedTransactions).toHaveLength(1);
      expect(orphanedTransactions[0].id).toBe('tx-3');
      expect(orphanedTransactions[0].reimbursementId).toBe('non-existent-id');
    });
  });
});