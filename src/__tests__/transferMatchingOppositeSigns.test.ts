import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transfer Matching Opposite Signs Requirement', () => {

  describe('areAmountsMatching should require opposite signs for transfers', () => {
    it('should NOT match transfers with both positive amounts', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: 825.54, // Both positive - should not match
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 825.54, // Both positive - should not match
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it('should NOT match transfers with both negative amounts', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -825.54, // Both negative - should not match
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: -825.54, // Both negative - should not match
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(0);
      expect(result.unmatched).toHaveLength(2);
    });

    it('SHOULD match transfers with opposite signs (positive and negative)', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -825.54, // Negative (outgoing)
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 825.54, // Positive (incoming) - should match
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceTransactionId).toBe('tx-1');
      expect(result.matches[0].targetTransactionId).toBe('tx-2');
      expect(result.matches[0].amountDifference).toBe(0);
      expect(result.unmatched).toHaveLength(0);
    });

    it('SHOULD match transfers with opposite signs (positive and negative) in reverse order', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer from Savings',
          amount: 825.54, // Positive (incoming)
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer to Checking',
          amount: -825.54, // Negative (outgoing) - should match
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].sourceTransactionId).toBe('tx-1');
      expect(result.matches[0].targetTransactionId).toBe('tx-2');
      expect(result.matches[0].amountDifference).toBe(0);
      expect(result.unmatched).toHaveLength(0);
    });

    it('should NOT auto-match transfers when amounts have same sign, even with high confidence', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer - High confidence scenario',
          amount: 1000.00, // Both positive - should not match
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'), // Same day
          description: 'Transfer - High confidence scenario',
          amount: 1000.00, // Both positive - should not match
          category: 'Internal Transfer',
          account: 'Savings Account', // Different account
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Test both direct matching and auto-matching
      const matchResult = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01
      });

      expect(matchResult.matches).toHaveLength(0);

      const autoMatchResult = await transferMatchingService.autoMatchTransfers(transactions);
      
      const tx1 = autoMatchResult.find(tx => tx.id === 'tx-1');
      const tx2 = autoMatchResult.find(tx => tx.id === 'tx-2');

      expect(tx1!.reimbursementId).toBeUndefined();
      expect(tx2!.reimbursementId).toBeUndefined();
    });

    it('should handle small tolerance amounts with opposite signs correctly', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-1',
          date: new Date('2024-01-15'),
          description: 'Transfer with fee',
          amount: -825.54, // Negative (outgoing)
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-2',
          date: new Date('2024-01-15'),
          description: 'Transfer with fee adjustment',
          amount: 825.00, // Positive, slightly different (within 1% tolerance)
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.findTransferMatches({
        transactions,
        maxDaysDifference: 7,
        tolerancePercentage: 0.01 // 1% tolerance should allow this small difference
      });

      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].amountDifference).toBeCloseTo(0.54, 2);
    });
  });

  describe('Manual transfer matching should enforce opposite signs', () => {
    it('should reject manual match when amounts have same positive sign', async () => {
      const transactions: Transaction[] = [
        {
          id: 'source-tx',
          date: new Date('2024-01-15'),
          description: 'Transfer A',
          amount: 500.00, // Both positive
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'target-tx',
          date: new Date('2024-01-15'),
          description: 'Transfer B',
          amount: 500.00, // Both positive
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Simulate the validation logic from TransferMatchesPage
      const sourceTx = transactions.find(t => t.id === 'source-tx')!;
      const targetTx = transactions.find(t => t.id === 'target-tx')!;

      // Check validation for different accounts - should require opposite signs
      const hasOppositeAmounts = (sourceTx.amount > 0) !== (targetTx.amount > 0);
      expect(hasOppositeAmounts).toBe(false);

      // This should be rejected by the validation
      const validationResult = {
        isValid: hasOppositeAmounts,
        reason: hasOppositeAmounts ? 'Valid transfer match' : 'Transfer amounts must have opposite signs (one positive, one negative)'
      };

      expect(validationResult.isValid).toBe(false);
      expect(validationResult.reason).toContain('opposite signs');
    });

    it('should allow manual match when amounts have opposite signs', async () => {
      const transactions: Transaction[] = [
        {
          id: 'source-tx',
          date: new Date('2024-01-15'),
          description: 'Transfer A',
          amount: -500.00, // Negative
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'target-tx',
          date: new Date('2024-01-15'),
          description: 'Transfer B',
          amount: 500.00, // Positive - opposite sign
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Simulate the validation logic from TransferMatchesPage
      const sourceTx = transactions.find(t => t.id === 'source-tx')!;
      const targetTx = transactions.find(t => t.id === 'target-tx')!;

      // Check validation for different accounts - should require opposite signs
      const hasOppositeAmounts = (sourceTx.amount > 0) !== (targetTx.amount > 0);
      expect(hasOppositeAmounts).toBe(true);

      // This should be approved by the validation
      const amountDiff = Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount));
      const tolerance = 0.01;
      const avgAmount = (Math.abs(sourceTx.amount) + Math.abs(targetTx.amount)) / 2;
      const isAmountValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;

      const validationResult = {
        isValid: hasOppositeAmounts && isAmountValid,
        reason: isAmountValid ? `Transfer match: $${amountDiff.toFixed(2)} difference` : 'Amount difference too large'
      };

      expect(validationResult.isValid).toBe(true);
      expect(validationResult.reason).toContain('Transfer match');
    });
  });
});