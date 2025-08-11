import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Automatic Transfer Matching', () => {

  describe('autoMatchTransfers with confidence threshold', () => {
    it('should automatically apply matches with 80% or higher confidence', async () => {
      // Create a high-confidence transfer pair (same day, exact amounts, different accounts)
      const transactions: Transaction[] = [
        {
          id: 'source-tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -1000.00, // Outgoing
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer to Savings'
        },
        {
          id: 'target-tx-1',
          date: new Date('2024-01-15'), // Same day
          description: 'Transfer from Checking',
          amount: 1000.00, // Incoming, exact same amount
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer from Checking'
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);

      // Both transactions should be matched via reimbursementId
      const sourceTx = result.find(tx => tx.id === 'source-tx-1');
      const targetTx = result.find(tx => tx.id === 'target-tx-1');

      expect(sourceTx).toBeDefined();
      expect(targetTx).toBeDefined();
      expect(sourceTx!.reimbursementId).toBe('target-tx-1');
      expect(targetTx!.reimbursementId).toBe('source-tx-1');
      expect(sourceTx!.notes).toContain('Matched Transfer:');
      expect(targetTx!.notes).toContain('Matched Transfer:');
    });

  it('should automatically apply matches with at least 40% confidence', async () => {
      // Create a lower-confidence transfer pair (different days, slightly different amounts)
      const transactions: Transaction[] = [
        {
          id: 'source-tx-2',
          date: new Date('2024-01-15'),
          description: 'ATM Withdrawal',
          amount: -100.00, // Outgoing
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'ATM Withdrawal'
        },
        {
          id: 'target-tx-2',
          date: new Date('2024-01-18'), // 3 days later
          description: 'Cash Deposit',
          amount: 102.50, // Slightly different amount (fees)
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Cash Deposit'
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);

  // With 40% threshold, this pair should be automatically matched
      const sourceTx = result.find(tx => tx.id === 'source-tx-2');
      const targetTx = result.find(tx => tx.id === 'target-tx-2');

      expect(sourceTx).toBeDefined();
      expect(targetTx).toBeDefined();
  expect(sourceTx!.reimbursementId).toBe('target-tx-2');
  expect(targetTx!.reimbursementId).toBe('source-tx-2');
    });

    it('should handle mixed confidence scenarios correctly', async () => {
      const transactions: Transaction[] = [
        // High confidence pair (should match)
        {
          id: 'high-source',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -500.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer to Savings'
        },
        {
          id: 'high-target',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 500.00,
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer from Checking'
        },
        // Low confidence pair (should not match)
        {
          id: 'low-source',
          date: new Date('2024-01-10'),
          description: 'Payment',
          amount: -75.00,
          category: 'Internal Transfer',
          account: 'Credit Card',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Payment'
        },
        {
          id: 'low-target',
          date: new Date('2024-01-16'), // 6 days later
          description: 'Deposit',
          amount: 80.00, // Different amount
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Deposit'
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);

      // High confidence pair should be matched
      const highSource = result.find(tx => tx.id === 'high-source');
      const highTarget = result.find(tx => tx.id === 'high-target');
      expect(highSource!.reimbursementId).toBe('high-target');
      expect(highTarget!.reimbursementId).toBe('high-source');

      // Low confidence pair should NOT be matched
      const lowSource = result.find(tx => tx.id === 'low-source');
      const lowTarget = result.find(tx => tx.id === 'low-target');
      expect(lowSource!.reimbursementId).toBeUndefined();
      expect(lowTarget!.reimbursementId).toBeUndefined();
    });

    it('should not match transfers from the same account', async () => {
      const transactions: Transaction[] = [
        {
          id: 'same-account-1',
          date: new Date('2024-01-15'),
          description: 'Transfer Out',
          amount: -200.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer Out'
        },
        {
          id: 'same-account-2',
          date: new Date('2024-01-15'),
          description: 'Transfer In',
          amount: 200.00,
          category: 'Internal Transfer',
          account: 'Checking Account', // Same account - should not match
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Transfer In'
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);

      const tx1 = result.find(tx => tx.id === 'same-account-1');
      const tx2 = result.find(tx => tx.id === 'same-account-2');

      expect(tx1!.reimbursementId).toBeUndefined();
      expect(tx2!.reimbursementId).toBeUndefined();
    });

    it('should only process transfer-type transactions', async () => {
      const transactions: Transaction[] = [
        {
          id: 'non-transfer-1',
          date: new Date('2024-01-15'),
          description: 'Coffee Shop',
          amount: -5.00,
          category: 'Food & Dining',
          account: 'Checking Account',
          type: 'expense', // Not a transfer
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Coffee Shop'
        },
        {
          id: 'non-transfer-2',
          date: new Date('2024-01-15'),
          description: 'Salary',
          amount: 3000.00,
          category: 'Income',
          account: 'Checking Account',
          type: 'income', // Not a transfer
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false,
          originalText: 'Salary'
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);

      // Should return original transactions unchanged since none are transfers
      expect(result).toEqual(transactions);
    });
  });
});