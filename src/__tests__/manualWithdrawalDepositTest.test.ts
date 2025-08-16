/**
 * Manual test to verify the withdrawal/deposit column fix works
 * This test simulates what should happen when AI schema mapping detects 
 * separate withdrawal/deposit columns and maps them to "Withdrawal/Deposit"
 */

import { fileProcessingService } from '../services/fileProcessingService';

describe('Manual Test for Withdrawal/Deposit Fix', () => {
  it('should successfully extract transactions when using direct method calls with proper schema mapping', async () => {
    // Create CSV content that matches the bug report
    const csvContent = `"Date","Status","Type","CheckNumber","Description","Withdrawal","Deposit","RunningBalance"
"07/31/2025","Posted","INTADJUST","","Interest Paid","","$0.11","$2,696.77"
"06/30/2025","Posted","INTADJUST","","Interest Paid","","$0.10","$2,696.66"
"04/30/2025","Posted","CHECK","1234","Rent Payment","$1,200.00","","$1,496.47"
"04/25/2025","Posted","DEBIT","","Grocery Store Purchase","$85.50","","$2,696.47"`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'test.csv', { type: 'text/csv' });

    // Read and parse the file content manually
    const fileService = fileProcessingService as any;
    const content = await fileService.readFileContent(file);
    
    // Parse as CSV
    const Papa = require('papaparse');
    const parseResult = Papa.parse(content, { header: true });
    const rawData = parseResult.data.filter((row: any) => Object.keys(row).some(key => row[key]));
    
    console.log('Raw data rows:', rawData.length);
    console.log('Sample row:', rawData[0]);
    
    // Simulate the problematic schema mapping from the original bug report
    const schemaMapping = {
      hasHeaders: true,
      skipRows: 0,
      dateFormat: 'MM/DD/YYYY',
      amountFormat: 'negative for debits',
      dateColumn: 'Date',
      descriptionColumn: 'Description',
      amountColumn: 'Withdrawal/Deposit' // This is the key fix!
    };
    
    // Test the processTransactions method with the corrected schema mapping
    const categories = []; // Simplified for this test
    const subcategories = [];
    
    const transactions = await fileService.processTransactions(
      'test-file',
      rawData,
      schemaMapping,
      categories,
      subcategories,
      'test-account'
    );
    
    console.log('Processed transactions:', transactions.length);
    
    // Verify transactions were processed
    expect(transactions.length).toBeGreaterThan(0);
    
    // Find specific transactions to verify correct amounts
    const interestTransaction = transactions.find((t: any) => t.description.includes('Interest Paid'));
    expect(interestTransaction).toBeDefined();
    expect(interestTransaction.amount).toBe(0.11); // Positive for deposit
    
    const rentTransaction = transactions.find((t: any) => t.description.includes('Rent Payment'));
    expect(rentTransaction).toBeDefined();
    expect(rentTransaction.amount).toBe(-1200.00); // Negative for withdrawal
    
    console.log('✅ Fix verified: Withdrawal/Deposit column mapping works correctly!');
  });
});