import { fileProcessingService } from '../services/fileProcessingService';
import { dataService } from '../services/dataService';

describe('Transaction Amount Reversal', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  describe('Normal Convention (Expenses Negative, Income Positive)', () => {
    it('should process transactions correctly when expenses are negative and income is positive', async () => {
      // Create a CSV with normal convention: expenses negative, income positive
      const csvContent = `Date,Description,Amount
2025-01-01,Starbucks Coffee,-5.50
2025-01-02,Shell Gas Station,-45.00
2025-01-03,Walmart Store,-85.42
2025-01-04,Salary Deposit,2500.00
2025-01-05,Amazon Purchase,-25.99`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'normal-amounts.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(5);

      // Verify amounts remain as-is (not reversed)
      const starbucks = result.transactions!.find(t => t.description.includes('Starbucks'));
      expect(starbucks?.amount).toBe(-5.50);
      expect(starbucks?.type).toBe('expense');

      const salary = result.transactions!.find(t => t.description.includes('Salary'));
      expect(salary?.amount).toBe(2500.00);
      expect(salary?.type).toBe('income');

      const shell = result.transactions!.find(t => t.description.includes('Shell'));
      expect(shell?.amount).toBe(-45.00);
      expect(shell?.type).toBe('expense');
    });
  });

  describe('Reversed Convention (Expenses Positive, Income Negative)', () => {
    it('should detect and reverse amounts when expenses are positive and income is negative', async () => {
      // Create a CSV with reversed convention: expenses positive, income negative
      const csvContent = `Date,Description,Amount
2025-01-01,Starbucks Coffee,5.50
2025-01-02,Shell Gas Station,45.00
2025-01-03,Walmart Store,85.42
2025-01-04,Salary Deposit,-2500.00
2025-01-05,Amazon Purchase,25.99`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'reversed-amounts.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(5);

      // Verify amounts are automatically reversed to correct convention
      const starbucks = result.transactions!.find(t => t.description.includes('Starbucks'));
      expect(starbucks?.amount).toBe(-5.50); // Should be flipped from positive to negative
      expect(starbucks?.type).toBe('expense');

      const salary = result.transactions!.find(t => t.description.includes('Salary'));
      expect(salary?.amount).toBe(2500.00); // Should be flipped from negative to positive
      expect(salary?.type).toBe('income');

      const shell = result.transactions!.find(t => t.description.includes('Shell'));
      expect(shell?.amount).toBe(-45.00); // Should be flipped from positive to negative
      expect(shell?.type).toBe('expense');

      const amazon = result.transactions!.find(t => t.description.includes('Amazon'));
      expect(amazon?.amount).toBe(-25.99); // Should be flipped from positive to negative
      expect(amazon?.type).toBe('expense');
    });
  });

  describe('Mixed Case (Some Expenses Positive)', () => {
    it('should not reverse amounts when only some expenses are positive (insufficient confidence)', async () => {
      // Create a CSV with mixed convention - not clear which is intended
      const csvContent = `Date,Description,Amount
2025-01-01,Starbucks Coffee,-5.50
2025-01-02,Shell Gas Station,45.00
2025-01-03,Walmart Store,-85.42
2025-01-04,Salary Deposit,2500.00`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'mixed-amounts.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(4);

      // Should not reverse - keep original amounts since pattern is unclear
      const starbucks = result.transactions!.find(t => t.description.includes('Starbucks'));
      expect(starbucks?.amount).toBe(-5.50);

      const shell = result.transactions!.find(t => t.description.includes('Shell'));
      expect(shell?.amount).toBe(45.00); // Remains positive (inconsistent)

      const salary = result.transactions!.find(t => t.description.includes('Salary'));
      expect(salary?.amount).toBe(2500.00);
    });
  });

  describe('Simple Heuristic Fallback', () => {
    it('should use simple heuristic when no keyword matches are found', async () => {
      // Create a CSV with generic descriptions but mostly positive amounts
      const csvContent = `Date,Description,Amount
2025-01-01,Transaction A,15.50
2025-01-02,Transaction B,25.00
2025-01-03,Transaction C,35.42
2025-01-04,Transaction D,45.00
2025-01-05,Transaction E,-500.00`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'generic-mostly-positive.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(5);

      // Should reverse all amounts since 80% are positive (simple heuristic threshold)
      const transactionA = result.transactions!.find(t => t.description.includes('Transaction A'));
      expect(transactionA?.amount).toBe(-15.50); // Should be flipped

      const transactionE = result.transactions!.find(t => t.description.includes('Transaction E'));
      expect(transactionE?.amount).toBe(500.00); // Should be flipped
    });

    it('should not reverse when amounts are more balanced', async () => {
      // Create a CSV with balanced positive/negative amounts
      const csvContent = `Date,Description,Amount
2025-01-01,Transaction A,-15.50
2025-01-02,Transaction B,-25.00
2025-01-03,Transaction C,35.42
2025-01-04,Transaction D,45.00`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'generic-balanced.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(4);

      // Should not reverse - 50% positive doesn't meet 80% threshold
      const transactionA = result.transactions!.find(t => t.description.includes('Transaction A'));
      expect(transactionA?.amount).toBe(-15.50); // Should remain unchanged
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty file without errors', async () => {
      const csvContent = `Date,Description,Amount`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'empty-data.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(0);
    });

    it('should handle file with single transaction', async () => {
      const csvContent = `Date,Description,Amount
2025-01-01,Coffee Shop,5.50`;

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const file = new File([blob], 'single-transaction.csv', { type: 'text/csv' });

      const result = await fileProcessingService.processUploadedFile(file, 'test-account');
      
      expect(result.transactions).toBeDefined();
      expect(result.transactions!.length).toBe(1);
      
      // Single transaction shouldn't trigger reversal (needs minimum 3 samples)
      const transaction = result.transactions![0];
      expect(transaction.amount).toBe(5.50); // Should remain unchanged
    });
  });
});