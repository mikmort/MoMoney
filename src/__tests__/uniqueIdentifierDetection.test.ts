import { containsUniqueIdentifiers, getUniqueIdentifierDetails } from '../utils/uniqueIdentifierDetection';

describe('Unique Identifier Detection', () => {
  describe('containsUniqueIdentifiers', () => {
    it('should detect long numeric sequences (10+ digits)', () => {
      expect(containsUniqueIdentifiers('ALASKA AIR 0272388692886')).toBe(true);
      expect(containsUniqueIdentifiers('AIR FRANCE 0572337147166')).toBe(true);
      expect(containsUniqueIdentifiers('Transaction 1234567890')).toBe(true);
      expect(containsUniqueIdentifiers('PSE BILL 4625318566')).toBe(true);
      
      // Should not detect shorter sequences (now allowing up to 9 digits)
      expect(containsUniqueIdentifiers('Order 123456789')).toBe(false);
      expect(containsUniqueIdentifiers('Account 1234')).toBe(false);
    });

    it('should detect alphanumeric transaction codes with separators', () => {
      expect(containsUniqueIdentifiers('AMZNPrime DE*2S28Q87V5')).toBe(true);
      expect(containsUniqueIdentifiers('Purchase ABC*123XYZ789')).toBe(true);
      expect(containsUniqueIdentifiers('Payment DEF-456ABC')).toBe(true);
      
      // Should not detect simple words without separators
      expect(containsUniqueIdentifiers('Transaction WXYZ1234')).toBe(false);
      expect(containsUniqueIdentifiers('McDonalds NYC')).toBe(false);
      expect(containsUniqueIdentifiers('USA Today')).toBe(false);
    });

    it('should detect reference number patterns', () => {
      expect(containsUniqueIdentifiers('Payment REF:ABC123')).toBe(true);
      expect(containsUniqueIdentifiers('Transfer TXN 789XYZ')).toBe(true);
      expect(containsUniqueIdentifiers('Purchase ID-456DEF')).toBe(true);
      expect(containsUniqueIdentifiers('Order CONF ABC789')).toBe(true);
      expect(containsUniqueIdentifiers('AUTH:XYZ123456')).toBe(true);
    });

    it('should detect credit card-style patterns', () => {
      expect(containsUniqueIdentifiers('Card 1234 5678 9012 3456')).toBe(true);
      expect(containsUniqueIdentifiers('Account 4567-8901-2345-6789')).toBe(true);
    });

    it('should detect keyword + identifier combinations', () => {
      expect(containsUniqueIdentifiers('Bill number 1234567890')).toBe(true);  // 10+ digits
      expect(containsUniqueIdentifiers('Invoice: ABCDEF123456')).toBe(true);   // Complex mixed
      expect(containsUniqueIdentifiers('Order #789456123')).toBe(false);       // Only 9 digits
      expect(containsUniqueIdentifiers('Booking reference XYZ789ABC')).toBe(true); // Mixed complex
      expect(containsUniqueIdentifiers('Confirmation 4567891234')).toBe(true); // 10+ digits
      
      // Shorter codes should not be detected
      expect(containsUniqueIdentifiers('Ticket ABC123')).toBe(false);
      expect(containsUniqueIdentifiers('Order #123')).toBe(false);
      // Simple word + number combinations should not match
      expect(containsUniqueIdentifiers('Store ABCD1234')).toBe(false);
    });

    it('should NOT detect common merchant names without unique identifiers', () => {
      expect(containsUniqueIdentifiers('Amazon')).toBe(false);
      expect(containsUniqueIdentifiers('Starbucks')).toBe(false);
      expect(containsUniqueIdentifiers('McDonalds')).toBe(false);
      expect(containsUniqueIdentifiers('Target Store')).toBe(false);
      expect(containsUniqueIdentifiers('Walmart Supercenter')).toBe(false);
      expect(containsUniqueIdentifiers('Shell Gas Station')).toBe(false);
      expect(containsUniqueIdentifiers('Chase Bank')).toBe(false);
      expect(containsUniqueIdentifiers('Electric Company Payment')).toBe(false);
    });

    it('should NOT detect short codes or common abbreviations', () => {
      expect(containsUniqueIdentifiers('ATM Withdrawal')).toBe(false);
      expect(containsUniqueIdentifiers('ACH Transfer')).toBe(false);
      expect(containsUniqueIdentifiers('Wire Transfer')).toBe(false);
      expect(containsUniqueIdentifiers('POS Purchase')).toBe(false);
      expect(containsUniqueIdentifiers('Store #123')).toBe(false);
      expect(containsUniqueIdentifiers('Location 45')).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(containsUniqueIdentifiers('')).toBe(false);
      expect(containsUniqueIdentifiers(' ')).toBe(false);
      expect(containsUniqueIdentifiers('   \n  ')).toBe(false);
    });

    it('should detect real-world examples from the issue', () => {
      // Examples from the problem statement
      expect(containsUniqueIdentifiers('AMZNPrime DE*2S28Q87V5')).toBe(true);
      expect(containsUniqueIdentifiers('ALASKA AIR 0272388692886')).toBe(true);
      expect(containsUniqueIdentifiers('AIR FRANCE 0572337147166')).toBe(true);
      expect(containsUniqueIdentifiers('ACH Debit PUGET SOUND ENER DIRECT DEBITING - PSE BILL 4625318566')).toBe(true);
    });
  });

  describe('getUniqueIdentifierDetails', () => {
    it('should provide detailed information about detected patterns', () => {
      const result = getUniqueIdentifierDetails('AMZNPrime DE*2S28Q87V5');
      
      expect(result.hasUniqueIdentifiers).toBe(true);
      expect(result.detectedPatterns.length).toBeGreaterThan(0);
      expect(result.detectedPatterns.some(p => p.match.includes('DE*2S28Q87V5'))).toBe(true);
      expect(result.detectedPatterns.some(p => p.reason.includes('transaction code'))).toBe(true);
    });

    it('should return no patterns for clean merchant names', () => {
      const result = getUniqueIdentifierDetails('Starbucks Coffee');
      
      expect(result.hasUniqueIdentifiers).toBe(false);
      expect(result.detectedPatterns.length).toBe(0);
    });

    it('should detect multiple patterns in a single description', () => {
      const result = getUniqueIdentifierDetails('Payment REF:123456 Order ABC789XYZ');
      
      expect(result.hasUniqueIdentifiers).toBe(true);
      expect(result.detectedPatterns.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle empty inputs gracefully', () => {
      const result = getUniqueIdentifierDetails('');
      
      expect(result.hasUniqueIdentifiers).toBe(false);
      expect(result.detectedPatterns.length).toBe(0);
    });
  });

  describe('Integration with auto-rule scenarios', () => {
    it('should flag transactions that would create ineffective rules', () => {
      const problematicTransactions = [
        'Amazon Purchase 12345678901', // 11 digits - should trigger
        'Spotify Premium REF:ABC123XYZ789',
        'Netflix Payment TXN 4567891234', // 10 digits 
        'Bank Transfer CONF:789456123ABC',
        'Credit Card Payment AUTH123456',
        'Utility Bill 98765432109 Payment', // 11 digits
        'Online Purchase Order#123ABC456789', // Mixed complex
        'Gas Station Receipt 78912345678' // 11 digits
      ];

      problematicTransactions.forEach(description => {
        expect(containsUniqueIdentifiers(description)).toBe(true);
      });
    });

    it('should allow transactions that would create useful rules', () => {
      const goodTransactions = [
        'Amazon',
        'Spotify Premium',
        'Netflix',
        'Bank of America Transfer',
        'Shell Gas Station',
        'Starbucks Store',
        'Walmart Supercenter',
        'Target',
        'Electric Company',
        'Water Department',
        'Phone Bill Payment',
        'Internet Service'
      ];

      goodTransactions.forEach(description => {
        expect(containsUniqueIdentifiers(description)).toBe(false);
      });
    });
  });
});