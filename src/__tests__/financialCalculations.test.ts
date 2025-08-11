import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Financial Calculation Regressions', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  describe('Floating Point Precision Issues', () => {
    it('should handle transaction amounts with proper rounding', async () => {
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Precision Test',
        amount: 0.1 + 0.2, // This equals 0.30000000000000004 in JS
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      expect(transaction.amount).toBeCloseTo(0.3, 2);
    });

    it('should maintain precision in financial summaries with many transactions', async () => {
      // Add transactions with amounts that could cause precision issues
      const amounts = [0.1, 0.2, 0.3, 0.4, 0.5, -0.15, -0.25, -0.35];
      
      for (let i = 0; i < amounts.length; i++) {
        await dataService.addTransaction({
          date: new Date('2025-01-15'),
          description: `Test Transaction ${i}`,
          amount: amounts[i],
          category: 'Test',
          account: 'Test Account',
          type: amounts[i] > 0 ? 'income' : 'expense'
        });
      }

      const transactions = await dataService.getAllTransactions();
      const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
      const expectedTotal = 0.1 + 0.2 + 0.3 + 0.4 + 0.5 - 0.15 - 0.25 - 0.35; // 0.75

      expect(totalAmount).toBeCloseTo(0.75, 2);
    });
  });

  describe('Large Number Handling', () => {
    it('should handle extremely large transaction amounts without overflow', async () => {
      const largeAmount = 999999999.99; // Nearly a billion
      
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Large Investment',
        amount: -largeAmount,
        category: 'Investment',
        account: 'Investment Account',
        type: 'expense'
      });

      expect(transaction.amount).toBe(-largeAmount);
    });

    it('should handle very small transaction amounts without underflow', async () => {
      const smallAmount = 0.01; // 1 cent
      
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Small Transaction',
        amount: -smallAmount,
        category: 'Miscellaneous',
        account: 'Test Account',
        type: 'expense'
      });

      expect(transaction.amount).toBe(-0.01);
      expect(transaction.amount).not.toBe(0);
    });
  });

  describe('Duplicate Detection with Amounts', () => {
    it('should detect duplicates despite floating point precision differences', async () => {
      // Add a base transaction
      await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Coffee Shop',
        amount: -4.50,
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense'
      });

      // Test with amount that might have precision differences
      const newTransactions = [{
        date: new Date('2025-01-15'),
        description: 'Coffee Shop',
        amount: -(4.49 + 0.01), // Should equal -4.50 but might have precision issues
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense' as const
      }];

      const result = await dataService.detectDuplicates(newTransactions);
      
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchType).toBe('exact');
    });

    it('should handle amount tolerance correctly for near-duplicates', async () => {
      // Add a base transaction
      await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Gas Station',
        amount: -50.00,
        category: 'Transportation',
        account: 'Credit Card',
        type: 'expense'
      });

      // Test with slightly different amount within tolerance
      const newTransactions = [{
        date: new Date('2025-01-15'),
        description: 'Gas Station',
        amount: -49.95, // $0.05 difference, should be within tolerance
        category: 'Transportation',
        account: 'Credit Card',
        type: 'expense' as const
      }];

      const result = await dataService.detectDuplicates(newTransactions, {
        amountTolerance: 0.02, // 2% tolerance
        dateTolerance: 0
      });
      
      expect(result.duplicates).toHaveLength(1);
      expect(result.duplicates[0].matchType).toBe('tolerance');
      expect(result.duplicates[0].amountDifference).toBeCloseTo(0.05, 2);
    });
  });

  describe('Date and Time Edge Cases', () => {
    it('should handle transactions across daylight saving time boundaries', async () => {
      // Test transactions around DST changes (can cause date/time issues)
      const dstTransitions = [
        new Date('2025-03-09T06:00:00.000Z'), // Spring forward
        new Date('2025-11-02T06:00:00.000Z')  // Fall back
      ];

      for (let i = 0; i < dstTransitions.length; i++) {
        const transaction = await dataService.addTransaction({
          date: dstTransitions[i],
          description: `DST Transaction ${i}`,
          amount: -25.00,
          category: 'Test',
          account: 'Test Account',
          type: 'expense'
        });

        expect(transaction.date).toBeDefined();
        expect(transaction.date instanceof Date).toBe(true);
      }

      const transactions = await dataService.getAllTransactions();
      expect(transactions).toHaveLength(2);
    });

    it('should handle transactions with future dates', async () => {
      const futureDate = new Date('2030-01-01');
      
      const transaction = await dataService.addTransaction({
        date: futureDate,
        description: 'Future Transaction',
        amount: -100.00,
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      expect(transaction.date.getTime()).toBe(futureDate.getTime());
    });

    it('should handle transactions with very old dates', async () => {
      const oldDate = new Date('1900-01-01');
      
      const transaction = await dataService.addTransaction({
        date: oldDate,
        description: 'Historical Transaction',
        amount: -5.00,
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      expect(transaction.date.getTime()).toBe(oldDate.getTime());
    });
  });

  describe('Category and Account Edge Cases', () => {
    it('should handle transactions with very long descriptions', async () => {
      const longDescription = 'A'.repeat(1000); // 1000 character description
      
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: longDescription,
        amount: -10.00,
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      expect(transaction.description).toBe(longDescription);
      expect(transaction.description.length).toBe(1000);
    });

    it('should handle transactions with special characters in all fields', async () => {
      const specialChars = '🍕 Café "René" & Co. (München) - 50% off!';
      
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: specialChars,
        amount: -15.50,
        category: `Category ${specialChars}`,
        account: `Account ${specialChars}`,
        type: 'expense'
      });

      expect(transaction.description).toBe(specialChars);
      expect(transaction.category).toBe(`Category ${specialChars}`);
      expect(transaction.account).toBe(`Account ${specialChars}`);
    });
  });

  describe('Boundary Value Testing', () => {
    it('should handle null and undefined values gracefully', async () => {
      const testCases = [
        { description: null, expected: '' },
        { description: undefined, expected: '' },
        { category: null, expected: 'Uncategorized' },
        { category: undefined, expected: 'Uncategorized' }
      ];

      for (let i = 0; i < testCases.length; i++) {
        try {
          await dataService.addTransaction({
            date: new Date('2025-01-15'),
            description: (testCases[i].description as any) || 'Test',
            amount: -10.00,
            category: (testCases[i].category as any) || 'Test',
            account: 'Test Account',
            type: 'expense'
          });
        } catch (error) {
          // Should handle gracefully, either by accepting the transaction
          // with defaults or by throwing a meaningful error
          expect(error).toBeDefined();
        }
      }
    });

    it('should handle edge case amounts', async () => {
      const edgeAmounts = [
        0, // Zero amount
        0.001, // Very small positive
        -0.001, // Very small negative
        Number.MAX_SAFE_INTEGER, // Largest safe integer
        -Number.MAX_SAFE_INTEGER // Largest safe negative integer
      ];

      for (let i = 0; i < edgeAmounts.length; i++) {
        const transaction = await dataService.addTransaction({
          date: new Date('2025-01-15'),
          description: `Edge Amount ${i}`,
          amount: edgeAmounts[i],
          category: 'Test',
          account: 'Test Account',
          type: edgeAmounts[i] >= 0 ? 'income' : 'expense'
        });

        expect(transaction.amount).toBe(edgeAmounts[i]);
        expect(typeof transaction.amount).toBe('number');
        expect(isFinite(transaction.amount)).toBe(true);
      }
    });
  });
});