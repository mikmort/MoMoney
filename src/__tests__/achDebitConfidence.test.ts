import { transferDetectionService } from '../services/transferDetectionService';
import { fileProcessingService } from '../services/fileProcessingService';

describe('ACH DEBIT and Withdrawal Confidence Requirements', () => {
  describe('Transfer Detection Service Changes', () => {
    it('should NOT automatically categorize ACH DEBIT as transfer', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'ACH DEBIT PAYMENT TO VENDOR',
        amount: -150.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'ACH DEBIT PAYMENT TO VENDOR'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      // Should NOT identify as transfer since 'ach debit' was removed from keywords
      expect(result.isLikelyTransfer).toBe(false);
      expect(result.reasons).not.toContain(expect.stringContaining('ach debit'));
    });

    it('should NOT automatically categorize generic withdrawal as transfer', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'WITHDRAWAL FEE MONTHLY',
        amount: -10.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'WITHDRAWAL FEE MONTHLY'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      // Should NOT identify as transfer since generic 'withdrawal' was removed from keywords
      expect(result.isLikelyTransfer).toBe(false);
      expect(result.reasons).not.toContain(expect.stringContaining('withdrawal'));
    });

    it('should still identify specific ATM withdrawal as transfer', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'ATM WITHDRAWAL AT BANK',
        amount: -100.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'ATM WITHDRAWAL AT BANK'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      // Should still identify as transfer since 'atm withdrawal' is still in keywords
      expect(result.isLikelyTransfer).toBe(true);
      expect(result.reasons.some(reason => reason.includes('atm withdrawal'))).toBe(true);
    });

    it('should still identify ACH CREDIT as transfer', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'ACH CREDIT DEPOSIT FROM EMPLOYER',
        amount: 2000.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'income' as const,
        isVerified: false,
        originalText: 'ACH CREDIT DEPOSIT FROM EMPLOYER'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      // Should still identify as transfer since 'ach credit' is still in keywords
      expect(result.isLikelyTransfer).toBe(true);
      expect(result.reasons.some(reason => reason.includes('ach credit'))).toBe(true);
    });
  });

  describe('File Processing Service Changes', () => {
    it('should identify ACH DEBIT transactions requiring higher confidence', () => {
      const service = fileProcessingService as any; // Access private method for testing
      
      expect(service.requiresHigherConfidence('ACH DEBIT PAYMENT TO VENDOR')).toBe(true);
      expect(service.requiresHigherConfidence('ach debit monthly fee')).toBe(true);
      expect(service.requiresHigherConfidence('WITHDRAWAL FEE')).toBe(true);
      expect(service.requiresHigherConfidence('withdrawal from savings')).toBe(true);
    });

    it('should NOT require higher confidence for specific withdrawal types', () => {
      const service = fileProcessingService as any; // Access private method for testing
      
      expect(service.requiresHigherConfidence('ATM WITHDRAWAL AT BANK')).toBe(false);
      expect(service.requiresHigherConfidence('CASH WITHDRAWAL FROM ATM')).toBe(false);
      expect(service.requiresHigherConfidence('ACH CREDIT DEPOSIT')).toBe(false);
      expect(service.requiresHigherConfidence('TRANSFER TO SAVINGS')).toBe(false);
    });

    it('should NOT require higher confidence for other transaction types', () => {
      const service = fileProcessingService as any; // Access private method for testing
      
      expect(service.requiresHigherConfidence('GROCERY STORE PURCHASE')).toBe(false);
      expect(service.requiresHigherConfidence('SALARY DEPOSIT')).toBe(false);
      expect(service.requiresHigherConfidence('RESTAURANT BILL')).toBe(false);
      expect(service.requiresHigherConfidence('UTILITY BILL PAYMENT')).toBe(false);
    });
  });
});