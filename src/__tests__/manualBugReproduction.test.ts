/**
 * Manual reproduction test of the original error scenario
 * This simulates the exact conditions that caused the TypeError
 */

import { fileProcessingService } from '../services/fileProcessingService';

describe('Manual Bug Reproduction - Column Type Error', () => {
  const fileService = fileProcessingService as any;
  
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

  it('should reproduce the original TypeError scenario', () => {
    // These are the types of values that might have been passed
    // causing the original "TypeError: column.toLowerCase is not a function"
    const problematicInputs = [
      [], // Empty array (truthy but no toLowerCase method)
      {}, // Empty object (truthy but no toLowerCase method) 
      { withdrawal: 'Withdrawal', deposit: 'Deposit' }, // Complex object
      ['Withdrawal', 'Deposit'], // Array with column names
      42, // Number
      true, // Boolean
      null, // Null
      undefined // Undefined
    ];

    console.log('🧪 Testing each problematic input type that could cause the original error:');
    
    problematicInputs.forEach((input, index) => {
      console.log(`\n📋 Test ${index + 1}: ${typeof input} - ${JSON.stringify(input)}`);
      
      // Before fix: This would throw "TypeError: column.toLowerCase is not a function"
      // After fix: Should return null safely
      expect(() => {
        const result = fileService.extractAmount(sampleRow, input);
        console.log(`  ✅ Result: ${result} (no error thrown)`);
        expect(result).toBeNull(); // Should safely return null for non-string inputs
      }).not.toThrow();
    });
  });

  it('should still work correctly with valid string inputs after the fix', () => {
    console.log('\n🧪 Testing valid string inputs still work:');
    
    const validInputs = [
      'Withdrawal/Deposit',
      'Amount',
      'Deposit',
      'amount'
    ];
    
    validInputs.forEach((input, index) => {
      console.log(`\n📋 Valid test ${index + 1}: "${input}"`);
      
      expect(() => {
        const result = fileService.extractAmount(sampleRow, input);
        console.log(`  ✅ Result: ${result} (no error thrown)`);
        // Should not throw and can return either null or a number
        expect(typeof result === 'number' || result === null).toBe(true);
      }).not.toThrow();
    });
    
    // Test the specific case from the bug report
    const result = fileService.extractAmount(sampleRow, 'Withdrawal/Deposit');
    expect(result).toBe(0.11); // Should extract the deposit amount
  });
});