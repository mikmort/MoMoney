/**
 * Test using actual CSV data to understand the duplicate detection issue
 */
import { dataService } from '../services/dataService';
import { fileProcessingService } from '../services/fileProcessingService';
import Papa from 'papaparse';
import fs from 'fs';
import path from 'path';

describe('Real CSV Data Duplicate Detection', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should test duplicate detection with the test-duplicates.csv file', async () => {
    // Read the test CSV file
    const csvPath = path.join(process.cwd(), 'test-duplicates.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    
    console.log('CSV content:');
    console.log(csvContent);
    
    // Parse the CSV
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true
    });
    
    console.log(`Parsed ${parseResult.data.length} rows from CSV`);
    console.log('First few rows:', parseResult.data.slice(0, 3));
    
    // Convert to transaction format
    const transactions = (parseResult.data as any[]).map(row => ({
      date: new Date(row.Date),
      description: row.Description,
      amount: parseFloat(row.Amount),
      account: row.Account || 'test-account',
      category: row.Category || 'Uncategorized',
      type: parseFloat(row.Amount) > 0 ? 'income' as const : 'expense' as const
    }));
    
    console.log(`Converted ${transactions.length} transactions`);
    console.log('Sample transaction:', transactions[0]);
    
    // First, test with no existing transactions
    const duplicateResult1 = await dataService.detectDuplicates(transactions);
    console.log('\n=== Test 1: No existing transactions ===');
    console.log(`Duplicates: ${duplicateResult1.duplicates.length}`);
    console.log(`Unique: ${duplicateResult1.uniqueTransactions.length}`);
    
    // Add some of these transactions as "existing" data
    const existingTransactions = transactions.slice(0, 3);
    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }
    
    console.log(`\nAdded ${existingTransactions.length} existing transactions`);
    
    // Now test importing the remaining transactions
    const newTransactions = transactions.slice(3);
    const duplicateResult2 = await dataService.detectDuplicates(newTransactions);
    
    console.log('\n=== Test 2: With existing transactions ===');
    console.log(`New transactions to check: ${newTransactions.length}`);
    console.log(`Duplicates found: ${duplicateResult2.duplicates.length}`);
    console.log(`Unique transactions: ${duplicateResult2.uniqueTransactions.length}`);
    
    if (duplicateResult2.duplicates.length > 0) {
      console.log('\nDuplicate details:');
      duplicateResult2.duplicates.forEach((dup, index) => {
        console.log(`${index + 1}. New: "${dup.newTransaction.description}" (${dup.newTransaction.date.toISOString().split('T')[0]}) $${dup.newTransaction.amount}`);
        console.log(`   Existing: "${dup.existingTransaction.description}" (${dup.existingTransaction.date.toISOString().split('T')[0]}) $${dup.existingTransaction.amount}`);
        console.log(`   Similarity: ${(dup.similarity * 100).toFixed(1)}% | Fields: [${dup.matchFields.join(', ')}] | Days: ${dup.daysDifference || 0}`);
      });
    }
    
    // Analyze what should be duplicates vs what are flagged
    console.log('\n=== Analysis ===');
    console.log('Existing transactions:');
    existingTransactions.forEach((txn, i) => {
      console.log(`  ${i + 1}. ${txn.description} (${txn.date.toISOString().split('T')[0]}) $${txn.amount}`);
    });
    
    console.log('New transactions:');
    newTransactions.forEach((txn, i) => {
      console.log(`  ${i + 1}. ${txn.description} (${txn.date.toISOString().split('T')[0]}) $${txn.amount}`);
    });
  });

  it('should test with all CSV transactions imported at once', async () => {
    const csvPath = path.join(process.cwd(), 'test-duplicates.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true
    });
    
    const transactions = (parseResult.data as any[]).map(row => ({
      date: new Date(row.Date),
      description: row.Description,
      amount: parseFloat(row.Amount),
      account: row.Account || 'test-account',
      category: row.Category || 'Uncategorized',
      type: parseFloat(row.Amount) > 0 ? 'income' as const : 'expense' as const
    }));
    
    console.log('\n=== All transactions at once test ===');
    console.log(`Testing ${transactions.length} transactions`);
    
    const duplicateResult = await dataService.detectDuplicates(transactions);
    console.log(`Duplicates: ${duplicateResult.duplicates.length}`);
    console.log(`Unique: ${duplicateResult.uniqueTransactions.length}`);
    
    // This tells us if transactions in the same CSV are being matched against each other
    const percentageDuplicates = (duplicateResult.duplicates.length / transactions.length) * 100;
    console.log(`Percentage flagged as duplicates: ${percentageDuplicates.toFixed(1)}%`);
    
    // For this test CSV which has near-duplicates, we expect some matches but not 100%
    expect(percentageDuplicates).toBeLessThan(100);
    expect(duplicateResult.uniqueTransactions.length).toBeGreaterThan(0);
  });

  it('should test similarity calculation directly', async () => {
    // Test the similarity calculation with known examples
    const transaction1 = {
      date: new Date('2025-08-08'),
      description: 'Starbucks Coffee',
      amount: -4.50,
      account: 'Chase Checking',
      category: 'Food & Dining',
      type: 'expense' as const
    };
    
    const transaction2 = {
      date: new Date('2025-08-08'),
      description: 'Starbucks Coffee',
      amount: -4.55,
      account: 'Chase Checking',
      category: 'Food & Dining',
      type: 'expense' as const
    };
    
    await dataService.addTransaction(transaction1);
    
    const duplicateResult = await dataService.detectDuplicates([transaction2]);
    
    console.log('\n=== Similarity calculation test ===');
    console.log('Transaction 1:', transaction1);
    console.log('Transaction 2:', transaction2);
    
    if (duplicateResult.duplicates.length > 0) {
      const dup = duplicateResult.duplicates[0];
      console.log(`Similarity: ${(dup.similarity * 100).toFixed(2)}%`);
      console.log(`Match fields: [${dup.matchFields.join(', ')}]`);
      console.log(`Amount difference: $${dup.amountDifference || 0}`);
      console.log(`Days difference: ${dup.daysDifference || 0}`);
      
      // These should be very similar (same date, description, account, very close amount)
      expect(dup.similarity).toBeGreaterThan(0.8);
    } else {
      console.log('No duplicates found - this might indicate an issue');
      console.log(`Configuration: ${JSON.stringify(duplicateResult.config, null, 2)}`);
    }
  });
});