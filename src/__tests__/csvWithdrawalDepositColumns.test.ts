/**
 * Test for CSV import with separate Withdrawal and Deposit columns
 * Reproduces the exact issue from the bug report
 */

import { fileProcessingService } from '../services/fileProcessingService';

describe('CSV with Separate Withdrawal/Deposit Columns Bug Reproduction', () => {
  describe('Direct extraction method testing', () => {
    it('should handle "Withdrawal/Deposit" column mapping by checking separate columns', () => {
      // Create a sample row like from the CSV in the bug report
      const sampleRow = {
        'Date': '07/31/2025',
        'Status': 'Posted', 
        'Type': 'INTADJUST',
        'CheckNumber': '',
        'Description': 'Interest Paid',
        'Withdrawal': '',
        'Deposit': '$0.11',
        'RunningBalance': '$2,696.77'
      };

      // Test the private extractAmount method with the problematic column name
      const fileService = fileProcessingService as any;
      
      // Test with the combined column name that causes the issue
      const amount = fileService.extractAmount(sampleRow, 'Withdrawal/Deposit');
      
      // Should return the deposit amount, not null
      expect(amount).not.toBeNull();
      expect(amount).toBe(0.11);
    });

    it('should handle withdrawal amounts correctly', () => {
      const sampleRow = {
        'Date': '04/30/2025',
        'Status': 'Posted',
        'Type': 'CHECK',
        'CheckNumber': '1234',
        'Description': 'Rent Payment',
        'Withdrawal': '$1,200.00',
        'Deposit': '',
        'RunningBalance': '$1,496.47'
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Withdrawal/Deposit');
      
      // Should return withdrawal as negative amount
      expect(amount).not.toBeNull();
      expect(amount).toBe(-1200.00);
    });

    it('should prioritize deposit over withdrawal when both present', () => {
      const sampleRow = {
        'Date': '01/01/2025',
        'Description': 'Test',
        'Withdrawal': '$50.00',
        'Deposit': '$100.00'
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Withdrawal/Deposit');
      
      // Should return deposit amount (positive)
      expect(amount).toBe(100.00);
    });

    it('should return null when both withdrawal and deposit are empty', () => {
      const sampleRow = {
        'Date': '01/01/2025',
        'Description': 'Test',
        'Withdrawal': '',
        'Deposit': ''
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Withdrawal/Deposit');
      
      expect(amount).toBeNull();
    });
  });
});