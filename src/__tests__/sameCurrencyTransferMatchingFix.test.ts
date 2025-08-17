import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Same Currency Transfer Matching Fix', () => {
  describe('Issue #477 - Transfers should not automatch if amounts are not identical in same currency', () => {
    
    it('should NOT auto-match transfers with different amounts in same currency', async () => {
      // Reproduce the exact scenario from the issue
      const transactions: Transaction[] = [
        {
          id: 'tx-withdrawal',
          date: new Date('2023-12-04'),
          description: 'Withdrawal Transfer To *****9924',
          amount: -6000.00, // USD withdrawal
          category: 'Internal Transfer',
          account: 'First Tech Checking',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-deposit',
          date: new Date('2023-11-30'), // 4 days earlier
          description: 'CONVERSION SHARES DEPOSITED MICROSOFT CORP (MSFT) (Cash)',
          amount: 5974.65, // USD deposit - $25.35 difference
          category: 'Internal Transfer', 
          account: 'Fidelity Individual',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
          // Both transactions have no originalCurrency, so they're both in default currency (USD)
        }
      ];

      // Try automatic matching
      const result = await transferMatchingService.autoMatchTransfers(transactions);
      
      // Verify transactions are NOT automatically matched
      const withdrawalTx = result.find(tx => tx.id === 'tx-withdrawal');
      const depositTx = result.find(tx => tx.id === 'tx-deposit');
      
      expect(withdrawalTx).toBeDefined();
      expect(depositTx).toBeDefined();
      
      // These should NOT be auto-matched due to amount difference in same currency
      expect(withdrawalTx!.reimbursementId).toBeUndefined();
      expect(depositTx!.reimbursementId).toBeUndefined();
    });

    it('should allow manual matching of transfers with different amounts in same currency', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-withdrawal',
          date: new Date('2023-12-04'),
          description: 'Withdrawal Transfer To *****9924',
          amount: -6000.00,
          category: 'Internal Transfer',
          account: 'First Tech Checking',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-deposit',
          date: new Date('2023-11-30'),
          description: 'CONVERSION SHARES DEPOSITED MICROSOFT CORP (MSFT) (Cash)',
          amount: 5974.65,
          category: 'Internal Transfer',
          account: 'Fidelity Individual',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      // Manual matching should still be possible
      const manualResult = await transferMatchingService.findManualTransferMatches({
        transactions,
        maxDaysDifference: 8, // Allow wider date range for manual
        tolerancePercentage: 0.12 // Allow higher tolerance for manual
      });

      // Manual search should find potential matches
      expect(manualResult.matches.length).toBeGreaterThan(0);
      const match = manualResult.matches[0];
      expect(match.reasoning).toContain('Possible manual match');
    });

    it('should still auto-match transfers with identical amounts in same currency', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-identical-out',
          date: new Date('2024-01-15'),
          description: 'Transfer to Savings',
          amount: -1000.00, // Exact amount
          category: 'Internal Transfer',
          account: 'Checking Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-identical-in',
          date: new Date('2024-01-15'),
          description: 'Transfer from Checking',
          amount: 1000.00, // Identical amount
          category: 'Internal Transfer',
          account: 'Savings Account',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);
      
      // These should be auto-matched since amounts are identical
      const outTx = result.find(tx => tx.id === 'tx-identical-out');
      const inTx = result.find(tx => tx.id === 'tx-identical-in');
      
      expect(outTx!.reimbursementId).toBe('tx-identical-in');
      expect(inTx!.reimbursementId).toBe('tx-identical-out');
    });

    it('should allow auto-matching transfers with different currencies (exchange rates)', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-usd-out',
          date: new Date('2024-01-15'),
          description: 'USD to EUR Transfer',
          amount: -1000.00, // USD
          category: 'Internal Transfer',
          account: 'USD Account',
          type: 'transfer',
          originalCurrency: 'USD', // Explicitly USD
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-eur-in',
          date: new Date('2024-01-15'),
          description: 'EUR Deposit',
          amount: 960.00, // EUR - about 4% difference (within 5% tolerance used by autoMatchTransfers)
          category: 'Internal Transfer',
          account: 'EUR Account',
          type: 'transfer',
          originalCurrency: 'EUR', // Explicitly EUR - different currency
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);
      
      // These should be auto-matched since they have different currencies (exchange rate scenario)
      const usdTx = result.find(tx => tx.id === 'tx-usd-out');
      const eurTx = result.find(tx => tx.id === 'tx-eur-in');
      
      expect(usdTx!.reimbursementId).toBe('tx-eur-in');
      expect(eurTx!.reimbursementId).toBe('tx-usd-out');
    });
    
    it('should not auto-match same currency transfers with > 0.5% amount difference', async () => {
      const transactions: Transaction[] = [
        {
          id: 'tx-out-small-diff',
          date: new Date('2024-01-15'),
          description: 'Transfer with small difference',
          amount: -1000.00, // USD
          category: 'Internal Transfer',
          account: 'Account A',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        },
        {
          id: 'tx-in-small-diff',
          date: new Date('2024-01-15'),
          description: 'Transfer with small difference',
          amount: 990.00, // $10 difference = 1% - should not auto-match
          category: 'Internal Transfer',
          account: 'Account B',
          type: 'transfer',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          isVerified: false
        }
      ];

      const result = await transferMatchingService.autoMatchTransfers(transactions);
      
      // Should NOT auto-match due to same currency and non-identical amounts
      const outTx = result.find(tx => tx.id === 'tx-out-small-diff');
      const inTx = result.find(tx => tx.id === 'tx-in-small-diff');
      
      expect(outTx!.reimbursementId).toBeUndefined();
      expect(inTx!.reimbursementId).toBeUndefined();
    });
  });
});