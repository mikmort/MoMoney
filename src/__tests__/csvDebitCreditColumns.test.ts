/**
 * Test for CSV import with separate Debit and Credit columns
 * Tests the enhancement to handle Debit/Credit columns as requested in Issue #449
 */

import { fileProcessingService } from '../services/fileProcessingService';

describe('CSV with Separate Debit/Credit Columns (Issue #449)', () => {
  describe('Direct extraction method testing for Debit/Credit columns', () => {
    it('should handle "Debit/Credit" column mapping by checking separate columns', () => {
      // Create a sample row like from the CSV in the issue description
      const sampleRow = {
        'Transaction Date': '8/13/2024',
        'Posted Date': '8/13/2024',
        'Card No.': '623',
        'Description': 'CAPITAL ONE AUTOPAY PYMT',
        'Category': 'Payment/Credit',
        'Debit': '',
        'Credit': '4648.01'
      };

      // Test the private extractAmount method with the combined column name
      const fileService = fileProcessingService as any;
      
      // Test with the combined column name that should trigger debit/credit handling
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      // Should return the credit amount as positive
      expect(amount).not.toBeNull();
      expect(amount).toBe(4648.01);
    });

    it('should handle debit amounts correctly (as negative)', () => {
      const sampleRow = {
        'Transaction Date': '8/12/2024',
        'Posted Date': '8/13/2024',
        'Card No.': '623',
        'Description': 'Amazon Prime*DP7AN06N5',
        'Category': 'Other Services',
        'Debit': '11.49',
        'Credit': ''
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      // Should return debit as negative amount
      expect(amount).not.toBeNull();
      expect(amount).toBe(-11.49);
    });

    it('should prioritize credit over debit when both present', () => {
      const sampleRow = {
        'Transaction Date': '01/01/2025',
        'Description': 'Test Transaction',
        'Debit': '50.00',
        'Credit': '100.00'
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      // Should return credit amount (positive), prioritizing credit over debit
      expect(amount).toBe(100.00);
    });

    it('should return null when both debit and credit are empty', () => {
      const sampleRow = {
        'Transaction Date': '01/01/2025',
        'Description': 'Empty Transaction',
        'Debit': '',
        'Credit': ''
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      expect(amount).toBeNull();
    });

    it('should handle debit amounts with currency symbols', () => {
      const sampleRow = {
        'Transaction Date': '8/6/2024',
        'Description': 'LYNGBY LOEVE APOTEK',
        'Category': 'Health Care',
        'Debit': '$7.68',
        'Credit': ''
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      // Should parse the amount and return as negative
      expect(amount).not.toBeNull();
      expect(amount).toBe(-7.68);
    });

    it('should handle credit amounts with currency symbols', () => {
      const sampleRow = {
        'Transaction Date': '8/13/2024',
        'Description': 'Payment Received',
        'Debit': '',
        'Credit': '$1,234.56'
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRow, 'Debit/Credit');
      
      // Should parse the amount and return as positive
      expect(amount).not.toBeNull();
      expect(amount).toBe(1234.56);
    });

    it('should handle case-insensitive debit/credit column names', () => {
      const sampleRowLowerCase = {
        'date': '01/01/2025',
        'description': 'Test',
        'debit': '25.00',
        'credit': ''
      };

      const fileService = fileProcessingService as any;
      const amount = fileService.extractAmount(sampleRowLowerCase, 'debit/credit');
      
      // Should work with lowercase column names
      expect(amount).not.toBeNull();
      expect(amount).toBe(-25.00);
    });
  });

  describe('Integration with sample data from Issue #449', () => {
    it('should correctly process all transactions from the issue example', () => {
      const sampleTransactions = [
        {
          'Transaction Date': '8/13/2024',
          'Posted Date': '8/13/2024',
          'Card No.': '623',
          'Description': 'CAPITAL ONE AUTOPAY PYMT',
          'Category': 'Payment/Credit',
          'Debit': '',
          'Credit': '4648.01'
        },
        {
          'Transaction Date': '8/12/2024',
          'Posted Date': '8/13/2024',
          'Card No.': '623',
          'Description': 'Amazon Prime*DP7AN06N5',
          'Category': 'Other Services',
          'Debit': '11.49',
          'Credit': ''
        },
        {
          'Transaction Date': '8/6/2024',
          'Posted Date': '8/7/2024',
          'Card No.': '623',
          'Description': 'LYNGBY LOEVE APOTEK',
          'Category': 'Health Care',
          'Debit': '7.68',
          'Credit': ''
        }
      ];

      const fileService = fileProcessingService as any;
      const expectedAmounts = [4648.01, -11.49, -7.68];

      sampleTransactions.forEach((transaction, index) => {
        const amount = fileService.extractAmount(transaction, 'Debit/Credit');
        expect(amount).toBe(expectedAmounts[index]);
      });
    });
  });
});