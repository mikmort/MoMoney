/**
 * Integration test for CSV import with separate Debit and Credit columns
 * Tests the complete workflow from CSV parsing to transaction creation
 */

import { fileProcessingService } from '../services/fileProcessingService';
import Papa from 'papaparse';

describe('CSV Debit/Credit Integration Test (Issue #449)', () => {
  it('should process a CSV file with separate Debit and Credit columns from end to end', async () => {
    // CSV content from the issue example
    const csvContent = `Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit
8/13/2024,8/13/2024,623,CAPITAL ONE AUTOPAY PYMT,Payment/Credit,,4648.01
8/12/2024,8/13/2024,623,Amazon Prime*DP7AN06N5,Other Services,11.49,
8/6/2024,8/7/2024,623,LYNGBY LOEVE APOTEK,Health Care,7.68,
8/3/2024,8/5/2024,623,IKEA MALMO HFB ECO,Merchandise,468.37,`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const file = new File([blob], 'test-debit-credit.csv', { type: 'text/csv' });

    // Read and parse the file content manually
    const fileService = fileProcessingService as any;
    const content = await fileService.readFileContent(file);
    
    // Parse as CSV
    const parseResult = Papa.parse(content, { header: true });
    const rawData = parseResult.data.filter((row: any) => Object.keys(row).some(key => row[key]));
    
    console.log('Raw data rows:', rawData.length);
    console.log('Sample row:', rawData[0]);
    
    // Create a schema mapping that uses Debit/Credit columns
    const schemaMapping = {
      hasHeaders: true,
      skipRows: 0,
      dateFormat: 'MM/DD/YYYY',
      amountFormat: 'negative for debits',
      dateColumn: 'Transaction Date',
      descriptionColumn: 'Description',
      amountColumn: 'Debit/Credit' // This should trigger our new debit/credit handling
    };
    
    // Test the processTransactions method with the debit/credit schema mapping
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
    const paymentTransaction = transactions.find((t: any) => t.description.includes('CAPITAL ONE AUTOPAY'));
    expect(paymentTransaction).toBeDefined();
    expect(paymentTransaction.amount).toBe(4648.01); // Credit should be positive
    
    const amazonTransaction = transactions.find((t: any) => t.description.includes('Amazon Prime'));
    expect(amazonTransaction).toBeDefined();
    expect(amazonTransaction.amount).toBe(-11.49); // Debit should be negative
    
    const apotekTransaction = transactions.find((t: any) => t.description.includes('LYNGBY LOEVE APOTEK'));
    expect(apotekTransaction).toBeDefined();
    expect(apotekTransaction.amount).toBe(-7.68); // Debit should be negative
    
    const ikeaTransaction = transactions.find((t: any) => t.description.includes('IKEA'));
    expect(ikeaTransaction).toBeDefined();
    expect(ikeaTransaction.amount).toBe(-468.37); // Debit should be negative
    
    console.log('✅ Integration test verified: All debit/credit amounts processed correctly!');
  }, 30000); // Increase timeout for integration test
});