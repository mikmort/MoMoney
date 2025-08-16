import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Same Account Matching (Matched Transactions)', () => {

  describe('findSameAccountMatches', () => {
    it('should find same-account opposite transactions on the same day', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Insurance Payment',
          amount: -142.32,
          category: 'Insurance',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'), // Same day
          description: 'Insurance Refund',
          amount: 142.32, // Opposite amount
          category: 'Insurance',
          account: 'Checking Account', // Same account
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceTransactionId).toBe('tx-1');
      expect(result.matches[0].targetTransactionId).toBe('tx-2');
      expect(result.matches[0].dateDifference).toBe(0);
      expect(result.matches[0].amountDifference).toBe(0);
      expect(result.matches[0].confidence).toBeGreaterThan(0.7);
      expect(result.matches[0].matchType).toBe('exact');
    });

    it('should find same-account opposite transactions within 1 day', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Purchase',
          amount: -50.00,
          category: 'Shopping',
          account: 'Credit Card',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-16'), // Next day
          description: 'Purchase Refund',
          amount: 50.00, // Opposite amount
          category: 'Shopping',
          account: 'Credit Card', // Same account
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].dateDifference).toBe(1);
      expect(result.matches[0].confidence).toBeGreaterThan(0.6);
    });

    it('should NOT match transactions in different accounts', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Payment',
          amount: -100.00,
          category: 'Utilities',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Refund',
          amount: 100.00,
          category: 'Utilities',
          account: 'Savings Account', // Different account
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
    });

    it('should NOT match transactions with same sign amounts', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Payment A',
          amount: -100.00, // Both negative
          category: 'Utilities',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Payment B',
          amount: -100.00, // Both negative
          category: 'Utilities',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
    });

    it('should NOT match transactions beyond date tolerance', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Purchase',
          amount: -75.00,
          category: 'Shopping',
          account: 'Credit Card',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-20'), // 5 days later, beyond tolerance
          description: 'Refund',
          amount: 75.00,
          category: 'Shopping',
          account: 'Credit Card',
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1, // Only 1 day tolerance
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
    });

    it('should NOT match transactions with amounts beyond tolerance', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Purchase',
          amount: -100.00,
          category: 'Shopping',
          account: 'Credit Card',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Partial Refund',
          amount: 50.00, // 50% different, beyond tolerance
          category: 'Shopping',
          account: 'Credit Card',
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01 // 1% tolerance
      });

      expect(result.matches).toHaveLength(0);
    });

    it('should NOT match transfer transactions (handled by different matching)', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer Out',
          amount: -200.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer', // Transfer type should be excluded
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer In',
          amount: 200.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer', // Transfer type should be excluded
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findSameAccountMatches({
        transactions,
        maxDaysDifference: 1,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
    });
  });

  describe('applySameAccountMatches', () => {
    it('should apply matches by linking transactions with reimbursementId', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Charge',
          amount: -25.00,
          category: 'Fees',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Charge Reversal',
          amount: 25.00,
          category: 'Fees',
          account: 'Checking Account',
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const matches = [{
        id: 'same-account-match-tx-1-tx-2',
        sourceTransactionId: 'tx-1',
        targetTransactionId: 'tx-2',
        confidence: 0.85,
        matchType: 'exact' as const,
        dateDifference: 0,
        amountDifference: 0,
        reasoning: 'Same account matched transaction',
        isVerified: false
      }];

      const result = await transferMatchingService.applySameAccountMatches(transactions, matches);

      const tx1 = result.find(tx => tx.id === 'tx-1');
      const tx2 = result.find(tx => tx.id === 'tx-2');

      expect(tx1).toBeDefined();
      expect(tx2).toBeDefined();
      expect(tx1!.reimbursementId).toBe('tx-2');
      expect(tx2!.reimbursementId).toBe('tx-1');
      expect(tx1!.notes).toContain('[Matched Transaction: 0.85 confidence]');
      expect(tx2!.notes).toContain('[Matched Transaction: 0.85 confidence]');
    });
  });

  describe('autoMatchSameAccountTransactions', () => {
    it('should automatically apply high-confidence same-account matches', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Insurance Premium',
          amount: -142.32,
          category: 'Insurance',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'), // Same day
          description: 'Insurance Correction',
          amount: 142.32, // Exact opposite
          category: 'Insurance',
          account: 'Checking Account',
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.autoMatchSameAccountTransactions(transactions);

      const tx1 = result.find(tx => tx.id === 'tx-1');
      const tx2 = result.find(tx => tx.id === 'tx-2');

      expect(tx1).toBeDefined();
      expect(tx2).toBeDefined();
      expect(tx1!.reimbursementId).toBe('tx-2');
      expect(tx2!.reimbursementId).toBe('tx-1');
      expect(tx1!.notes).toContain('[Matched Transaction:');
      expect(tx2!.notes).toContain('[Matched Transaction:');
    });

    it('should not automatically apply low-confidence matches', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Some Payment',
          amount: -100.00,
          category: 'Utilities',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-16'), // Next day, but generic descriptions
          description: 'Different Description', // Very different description
          amount: 95.00, // 5% different amount, which should be within tolerance but low confidence due to other factors
          category: 'Utilities',
          account: 'Checking Account',
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.autoMatchSameAccountTransactions(transactions);

      // Should not be matched due to low confidence
      const tx1 = result.find(tx => tx.id === 'tx-1');
      const tx2 = result.find(tx => tx.id === 'tx-2');

      expect(tx1!.reimbursementId).toBeUndefined();
      expect(tx2!.reimbursementId).toBeUndefined();
    });
  });

  describe('Integration with existing transfer matching', () => {
    it('should work alongside existing transfer matching without conflict', async () => {
      const transactions: Transaction[] = [
        // Regular transfer between accounts
        {
          id: 'transfer-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -500.00,
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'transfer-2',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 500.00,
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        // Same-account matched transaction
        {
          id: 'matched-1',
          date: new Date('2024-01-15'),
          description: 'Fee Charge',
          amount: -35.00,
          category: 'Fees',
          account: 'Checking Account',
          type: 'expense',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'matched-2',
          date: new Date('2024-01-15'),
          description: 'Fee Reversal',
          amount: 35.00,
          category: 'Fees',
          account: 'Checking Account', // Same account
          type: 'income',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Apply both types of matching
      const afterTransfers = await transferMatchingService.autoMatchTransfers(transactions);
      const afterSameAccount = await transferMatchingService.autoMatchSameAccountTransactions(afterTransfers);

      // Transfer should be matched
      const transfer1 = afterSameAccount.find(tx => tx.id === 'transfer-1');
      const transfer2 = afterSameAccount.find(tx => tx.id === 'transfer-2');
      expect(transfer1!.reimbursementId).toBe('transfer-2');
      expect(transfer2!.reimbursementId).toBe('transfer-1');

      // Same-account transaction should be matched
      const matched1 = afterSameAccount.find(tx => tx.id === 'matched-1');
      const matched2 = afterSameAccount.find(tx => tx.id === 'matched-2');
      expect(matched1!.reimbursementId).toBe('matched-2');
      expect(matched2!.reimbursementId).toBe('matched-1');
    });
  });
});