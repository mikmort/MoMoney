import { transferDetectionService } from '../services/transferDetectionService';
import { fileProcessingService } from '../services/fileProcessingService';

describe('End-to-End ACH DEBIT and Withdrawal Processing', () => {
  describe('Real-world transaction scenarios', () => {
    it('should demonstrate the before/after behavior for ACH DEBIT transactions', async () => {
      // Simulate a real ACH DEBIT transaction that could be ambiguous
      const achDebitTransactions = [
        {
          description: 'ACH DEBIT PAYMENT TO UTILITY COMPANY',
          amount: -125.50,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        },
        {
          description: 'ACH DEBIT MONTHLY SUBSCRIPTION',
          amount: -19.99,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        },
        {
          description: 'ACH DEBIT MORTGAGE PAYMENT',
          amount: -2500.00,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        }
      ];

      for (const testCase of achDebitTransactions) {
        const transaction = {
          date: new Date('2024-01-15'),
          description: testCase.description,
          amount: testCase.amount,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense' as const,
          isVerified: false,
          originalText: testCase.description
        };

        const result = transferDetectionService.analyzeTransaction(transaction);
        
        // These should NOT be identified as transfers now
        expect(result.isLikelyTransfer).toBe(false);
        console.log(`✅ "${testCase.description}" -> Not identified as transfer (correct)`);
      }
    });

    it('should demonstrate the before/after behavior for withdrawal transactions', async () => {
      // Simulate real withdrawal transactions that could be ambiguous
      const withdrawalTransactions = [
        {
          description: 'WITHDRAWAL FEE MONTHLY',
          amount: -5.00,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        },
        {
          description: 'WITHDRAWAL PENALTY',
          amount: -25.00,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        },
        {
          description: 'SAVINGS WITHDRAWAL ELECTRONIC',
          amount: -200.00,
          expectedBehavior: 'Should NOT be auto-categorized as transfer'
        }
      ];

      for (const testCase of withdrawalTransactions) {
        const transaction = {
          date: new Date('2024-01-15'),
          description: testCase.description,
          amount: testCase.amount,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense' as const,
          isVerified: false,
          originalText: testCase.description
        };

        const result = transferDetectionService.analyzeTransaction(transaction);
        
        // These should NOT be identified as transfers now
        expect(result.isLikelyTransfer).toBe(false);
        console.log(`✅ "${testCase.description}" -> Not identified as transfer (correct)`);
      }
    });

    it('should still work correctly for legitimate transfer patterns', async () => {
      // These should still be identified as transfers
      const legitimateTransfers = [
        {
          description: 'ATM WITHDRAWAL BANK OF AMERICA #1234',
          amount: -100.00,
          shouldBeTransfer: true
        },
        {
          description: 'CASH WITHDRAWAL FROM ATM',
          amount: -60.00,
          shouldBeTransfer: true
        },
        {
          description: 'ACH CREDIT DEPOSIT FROM EMPLOYER',
          amount: 2500.00,
          shouldBeTransfer: true
        },
        {
          description: 'TRANSFER TO SAVINGS ACCOUNT',
          amount: -500.00,
          shouldBeTransfer: true
        },
        {
          description: 'ZELLE PAYMENT TO JOHN DOE',
          amount: -75.00,
          shouldBeTransfer: true
        }
      ];

      for (const testCase of legitimateTransfers) {
        const transaction = {
          date: new Date('2024-01-15'),
          description: testCase.description,
          amount: testCase.amount,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: testCase.amount > 0 ? 'income' : 'expense' as const,
          isVerified: false,
          originalText: testCase.description
        };

        const result = transferDetectionService.analyzeTransaction(transaction);
        
        if (testCase.shouldBeTransfer) {
          expect(result.isLikelyTransfer).toBe(true);
          console.log(`✅ "${testCase.description}" -> Still identified as transfer (correct)`);
        }
      }
    });

    it('should demonstrate confidence threshold logic for AI processing', () => {
      // Test the requiresHigherConfidence helper method
      const service = fileProcessingService as any;
      
      // These should require 90% confidence
      const highConfidenceRequired = [
        'ACH DEBIT PAYMENT TO VENDOR',
        'ach debit utility bill',
        'WITHDRAWAL FROM SAVINGS',
        'withdrawal fee bank charge',
        'ACH DEBIT INSURANCE PREMIUM'
      ];

      // These should use normal 80% confidence  
      const normalConfidenceOk = [
        'ATM WITHDRAWAL #1234',
        'CASH WITHDRAWAL FROM ATM',
        'GROCERY STORE PURCHASE',
        'STARBUCKS COFFEE',
        'ACH CREDIT SALARY',
        'TRANSFER TO CHECKING'
      ];

      for (const desc of highConfidenceRequired) {
        expect(service.requiresHigherConfidence(desc)).toBe(true);
        console.log(`✅ "${desc}" -> Requires 90% confidence (correct)`);
      }

      for (const desc of normalConfidenceOk) {
        expect(service.requiresHigherConfidence(desc)).toBe(false);
        console.log(`✅ "${desc}" -> Uses normal 80% confidence (correct)`);
      }
    });

    it('should provide a summary of behavior changes', () => {
      console.log('\n=== SUMMARY OF CHANGES ===');
      console.log('1. ❌ Removed "ach debit" from automatic transfer keywords');
      console.log('2. ❌ Removed generic "withdrawal" from automatic transfer keywords');
      console.log('3. ✅ Kept "atm withdrawal" and "cash withdrawal" for legitimate transfers');
      console.log('4. ✅ Added 90% confidence requirement for ACH DEBIT/withdrawal patterns');
      console.log('5. ✅ Transactions with < 90% confidence remain uncategorized for manual review');
      console.log('6. ✅ Auto-rule creation respects higher confidence thresholds');
      console.log('\n💡 This makes the system more cautious about potentially ambiguous transactions');
      console.log('💡 Users will need to manually categorize unclear ACH DEBIT/withdrawal transactions');
      console.log('💡 But the system will still auto-categorize obvious transfer patterns');
      
      // This test always passes - it's just for documentation
      expect(true).toBe(true);
    });
  });
});