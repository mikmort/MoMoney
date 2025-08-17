/**
 * Test for the TypeError fix in extractAmount method
 * Ensures proper handling of non-string column parameters
 */

import { fileProcessingService } from '../services/fileProcessingService';

describe('extractAmount Type Safety Fix', () => {
  const fileService = fileProcessingService as any;
  
  const sampleRow = {
    'Date': '07/31/2025',
    'Status': 'Posted', 
    'Type': 'INTADJUST',
    'Description': 'Interest Paid',
    'Withdrawal': '',
    'Deposit': '$0.11',
    'RunningBalance': '$2,696.77'
  };

  describe('Type safety for column parameter', () => {
    it('should handle undefined column gracefully', () => {
      expect(() => fileService.extractAmount(sampleRow, undefined)).not.toThrow();
      expect(fileService.extractAmount(sampleRow, undefined)).toBeNull();
    });

    it('should handle null column gracefully', () => {
      expect(() => fileService.extractAmount(sampleRow, null)).not.toThrow();
      expect(fileService.extractAmount(sampleRow, null)).toBeNull();
    });

    it('should handle empty string column gracefully', () => {
      expect(() => fileService.extractAmount(sampleRow, '')).not.toThrow();
      expect(fileService.extractAmount(sampleRow, '')).toBeNull();
    });

    it('should handle array column parameter without error', () => {
      expect(() => fileService.extractAmount(sampleRow, [])).not.toThrow();
      expect(fileService.extractAmount(sampleRow, [])).toBeNull();
    });

    it('should handle object column parameter without error', () => {
      expect(() => fileService.extractAmount(sampleRow, {})).not.toThrow();
      expect(fileService.extractAmount(sampleRow, {})).toBeNull();
    });

    it('should handle number column parameter without error', () => {
      expect(() => fileService.extractAmount(sampleRow, 42)).not.toThrow();
      expect(fileService.extractAmount(sampleRow, 42)).toBeNull();
    });

    it('should handle boolean column parameter without error', () => {
      expect(() => fileService.extractAmount(sampleRow, true)).not.toThrow();
      expect(fileService.extractAmount(sampleRow, true)).toBeNull();
    });

    it('should still work correctly with valid string column', () => {
      expect(() => fileService.extractAmount(sampleRow, 'Withdrawal/Deposit')).not.toThrow();
      expect(fileService.extractAmount(sampleRow, 'Withdrawal/Deposit')).toBe(0.11);
    });

    it('should work with simple column names', () => {
      const simpleRow = { amount: '$100.50' };
      expect(() => fileService.extractAmount(simpleRow, 'amount')).not.toThrow();
      expect(fileService.extractAmount(simpleRow, 'amount')).toBe(100.50);
    });
  });
});