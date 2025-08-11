import {
  sanitizeTransactionDescription,
  sanitizeTransactionAmount,
  sanitizeFileContent,
  sanitizeTransactionForAI,
  validateMaskedAccountNumber
} from '../utils/piiSanitization';

describe('PII Sanitization', () => {
  describe('sanitizeTransactionDescription', () => {
    it('should mask account numbers while preserving last 3 digits', () => {
      const result = sanitizeTransactionDescription('Payment to 1234567890');
      expect(result).toBe('Payment to *******890');
    });

    it('should remove email addresses', () => {
      const result = sanitizeTransactionDescription('Transfer to john.doe@example.com');
      expect(result).toBe('Transfer to [EMAIL]');
    });

    it('should remove phone numbers in various formats', () => {
      expect(sanitizeTransactionDescription('Call (555) 123-4567')).toBe('Call [PHONE]');
      expect(sanitizeTransactionDescription('Text 555-123-4567')).toBe('Text [PHONE]');
      expect(sanitizeTransactionDescription('Contact 555.123.4567')).toBe('Contact [PHONE]');
      expect(sanitizeTransactionDescription('Number 5551234567')).toBe('Number [PHONE]');
    });

    it('should sanitize street addresses', () => {
      const result = sanitizeTransactionDescription('Delivery to 123 Main Street');
      expect(result).toBe('Delivery to [ADDRESS]');
      
      expect(sanitizeTransactionDescription('456 Oak Ave purchase')).toBe('[ADDRESS] purchase');
      expect(sanitizeTransactionDescription('789 Pine Road delivery')).toBe('[ADDRESS] delivery');
    });

    it('should handle multiple PII types in one description', () => {
      const result = sanitizeTransactionDescription('Payment 1234567890 to john@test.com at 123 Main St, call (555) 123-4567');
      expect(result).toBe('Payment *******890 to [EMAIL] at [ADDRESS], call [PHONE]');
    });

    it('should preserve normal merchant names and transaction details', () => {
      const result = sanitizeTransactionDescription('STARBUCKS STORE #123 PURCHASE');
      expect(result).toBe('STARBUCKS STORE #123 PURCHASE');
    });

    it('should handle empty and null inputs', () => {
      expect(sanitizeTransactionDescription('')).toBe('');
      expect(sanitizeTransactionDescription('   ')).toBe('');
    });

    it('should not mask shorter number sequences', () => {
      const result = sanitizeTransactionDescription('Store #12345 purchase');
      expect(result).toBe('Store #12345 purchase');
    });

    it('should allow disabling specific sanitization options', () => {
      const result = sanitizeTransactionDescription(
        'Account 1234567890 email john@test.com',
        { maskAccountNumbers: false, removeEmails: true }
      );
      expect(result).toBe('Account 1234567890 email [EMAIL]');
    });
  });

  describe('sanitizeTransactionAmount', () => {
    it('should return exact amount when rounding is disabled', () => {
      expect(sanitizeTransactionAmount(123.45)).toBe(123.45);
      expect(sanitizeTransactionAmount(-1234.56)).toBe(-1234.56);
    });

    it('should round large amounts when enabled', () => {
      const result = sanitizeTransactionAmount(1234.56, { 
        roundLargeAmounts: true, 
        largeAmountThreshold: 1000 
      });
      expect(result).toBe(1250); // Rounded to nearest $50
    });

    it('should preserve sign when rounding', () => {
      const result = sanitizeTransactionAmount(-1234.56, { 
        roundLargeAmounts: true, 
        largeAmountThreshold: 1000 
      });
      expect(result).toBe(-1250);
    });

    it('should not round amounts below threshold', () => {
      const result = sanitizeTransactionAmount(567.89, { 
        roundLargeAmounts: true, 
        largeAmountThreshold: 1000 
      });
      expect(result).toBe(567.89);
    });
  });

  describe('sanitizeFileContent', () => {
    it('should mask credit card numbers', () => {
      const content = 'Card ending in 1234 5678 9012 3456';
      const result = sanitizeFileContent(content);
      expect(result).toContain('****-****-****-3456');
    });

    it('should mask bank account numbers', () => {
      const content = 'Account number: 123456789012345';
      const result = sanitizeFileContent(content);
      expect(result).toContain('***2345');
    });

    it('should remove SSN patterns', () => {
      const content = 'SSN: 123-45-6789';
      const result = sanitizeFileContent(content);
      expect(result).toBe('SSN: [SSN]');
    });

    it('should mask routing numbers', () => {
      const content = 'Routing: 123456789';
      const result = sanitizeFileContent(content);
      expect(result).toBe('Routing: [ROUTING]');
    });

    it('should remove ZIP codes', () => {
      const content = 'Address: 123 Main St, City, ST 12345-6789';
      const result = sanitizeFileContent(content);
      expect(result).toContain('[ZIP]');
    });

    it('should handle bank statement-like content', () => {
      const content = `
        Account Statement
        Account: 123456789012345
        SSN: 123-45-6789
        Email: john.doe@bank.com
        Phone: (555) 123-4567
        Address: 123 Main Street, City, ST 12345
      `;
      
      const result = sanitizeFileContent(content);
      expect(result).not.toContain('123456789012345');
      expect(result).not.toContain('123-45-6789');
      expect(result).not.toContain('john.doe@bank.com');
      expect(result).not.toContain('(555) 123-4567');
      expect(result).not.toContain('123 Main Street');
      expect(result).not.toContain('12345');
    });
  });

  describe('sanitizeTransactionForAI', () => {
    it('should sanitize all transaction data fields', () => {
      const result = sanitizeTransactionForAI(
        'Payment to account 1234567890 at john@test.com',
        -1500,
        '2024-01-15'
      );

      expect(result.description).toBe('Payment to account *******890 at [EMAIL]');
      expect(result.amount).toBe(-1500);
      expect(result.date).toBe('2024-01-15');
    });

    it('should preserve transaction context while removing PII', () => {
      const result = sanitizeTransactionForAI(
        'AMAZON PURCHASE 1234567890 shipped to 123 Main St',
        -45.99,
        '2024-01-15'
      );

      expect(result.description).toContain('AMAZON PURCHASE');
      expect(result.description).not.toContain('1234567890');
      expect(result.description).not.toContain('123 Main St');
    });
  });

  describe('validateMaskedAccountNumber', () => {
    it('should create proper masked format from account number', () => {
      expect(validateMaskedAccountNumber('1234567890')).toBe('Ending in 890');
    });

    it('should handle various input formats', () => {
      expect(validateMaskedAccountNumber('123-456-7890')).toBe('Ending in 890');
      expect(validateMaskedAccountNumber('123 456 7890')).toBe('Ending in 890');
    });

    it('should return undefined for insufficient digits', () => {
      expect(validateMaskedAccountNumber('12')).toBeUndefined();
      expect(validateMaskedAccountNumber('')).toBeUndefined();
      expect(validateMaskedAccountNumber(null)).toBeUndefined();
      expect(validateMaskedAccountNumber(undefined)).toBeUndefined();
    });

    it('should handle non-string inputs', () => {
      expect(validateMaskedAccountNumber(1234567890)).toBe('Ending in 890');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000) + ' account 1234567890';
      const result = sanitizeTransactionDescription(longDescription);
      expect(result).toContain('*******890');
      expect(result.length).toBeLessThanOrEqual(longDescription.length);
    });

    it('should handle special characters and unicode', () => {
      const result = sanitizeTransactionDescription('Café payment 1234567890 ñoño@test.com');
      expect(result).toBe('Café payment *******890 [EMAIL]');
    });

    it('should preserve merchant codes and identifiers', () => {
      const result = sanitizeTransactionDescription('VISA POS 4532**** AMAZON.COM WA');
      expect(result).toBe('VISA POS 4532**** AMAZON.COM WA');
    });
  });
});