import { transferDetectionService } from '../services/transferDetectionService';

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
          shouldBeTransfer: false
        },
        {
          description: 'TRANSFER TO SAVINGS ACCOUNT',
          amount: -500.00,
          shouldBeTransfer: true
        },
        {
          description: 'ZELLE PAYMENT TO JOHN DOE',
          amount: -75.00,
          shouldBeTransfer: false
        }
      ];

      for (const testCase of legitimateTransfers) {
        const transaction = {
          date: new Date('2024-01-15'),
          description: testCase.description,
          amount: testCase.amount,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: testCase.amount > 0 ? 'income' as const : 'expense' as const,
          isVerified: false,
          originalText: testCase.description
        };

        const result = transferDetectionService.analyzeTransaction(transaction);
        
        expect(result.isLikelyTransfer).toBe(testCase.shouldBeTransfer);
      }
    });

  });
});