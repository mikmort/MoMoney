import { dataService } from '../services/dataService';
import { fileProcessingService } from '../services/fileProcessingService';

describe('Opposite Amount Duplicate Issue', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
  });

  it('should detect transactions with opposite amounts as duplicates', async () => {
    // First, add a transaction with a positive amount (from an import where amounts got reversed)
    const originalTransaction = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Insurance Payment',
      amount: 242.30, // Positive amount due to reversed import
      category: 'Insurance',
      account: 'Checking Account',
      type: 'expense' // Even though amount is positive, it's marked as expense
    });

    console.log('Original transaction added:', originalTransaction);

    // Now try to import the same transaction with the correct (negative) amount
    const newTransactionsToImport = [{
      date: new Date('2025-01-15'),
      description: 'Insurance Payment',
      amount: -242.30, // Correct negative amount for expense
      category: 'Insurance',
      account: 'Checking Account',
      type: 'expense' as const
    }];

    // Check for duplicates - this should detect the opposite amount transaction as a duplicate
    const duplicateResult = await dataService.detectDuplicates(newTransactionsToImport);
    
    console.log('Duplicate detection result:', duplicateResult);
    
    // This test demonstrates the current issue: opposite amounts are NOT detected as duplicates
    // We expect this to fail with current logic, but after fixing it should pass
    expect(duplicateResult.duplicates).toHaveLength(1); // Should detect the opposite amount as duplicate
    expect(duplicateResult.uniqueTransactions).toHaveLength(0); // Should be empty since it's a duplicate
    
    // The duplicate should match based on description, date, account, but opposite amount
    const duplicate = duplicateResult.duplicates[0];
    expect(duplicate.existingTransaction.amount).toBe(242.30);
    expect(duplicate.newTransaction.amount).toBe(-242.30);
    expect(duplicate.similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('should reproduce the multi-import duplicate issue scenario', async () => {
    // Simulate the scenario described in the issue:
    // 1. Import a file with reversed amounts (expenses positive)
    // 2. Import the same file again after system corrects amounts
    // 3. Result: same transactions with both positive and negative amounts

    // Step 1: Create a CSV file with reversed amounts (expenses positive)
    const csvContentReversed = `Date,Description,Amount
2025-01-15,Insurance Payment,242.30
2025-01-16,Grocery Store,85.50`;

    // Process this file (amounts should get reversed to negative by the system)
    const blob1 = new Blob([csvContentReversed], { type: 'text/csv' });
    const file1 = new File([blob1], 'insurance-reversed.csv', { type: 'text/csv' });
    const result1 = await fileProcessingService.processUploadedFile(file1, 'checking-account');
    
    console.log('First import result:', result1.transactions?.length, 'transactions');
    if (result1.transactions) {
      result1.transactions.forEach((tx, i) => {
        console.log(`Transaction ${i + 1}: ${tx.description} = ${tx.amount}`);
      });
    }

    // Add these transactions to the system
    if (result1.transactions) {
      await dataService.addTransactions(result1.transactions);
    }

    // Step 2: Import the same file again (or a corrected version with negative amounts)
    const csvContentCorrected = `Date,Description,Amount
2025-01-15,Insurance Payment,-242.30
2025-01-16,Grocery Store,-85.50`;

    const blob2 = new Blob([csvContentCorrected], { type: 'text/csv' });
    const file2 = new File([blob2], 'insurance-corrected.csv', { type: 'text/csv' });
    const result2 = await fileProcessingService.processUploadedFile(file2, 'checking-account');

    console.log('Second import result:', result2.transactions?.length, 'transactions');
    if (result2.transactions) {
      result2.transactions.forEach((tx, i) => {
        console.log(`Transaction ${i + 1}: ${tx.description} = ${tx.amount}`);
      });
    }

    // Check if duplicates are detected
    if (result2.transactions) {
      const duplicateCheck = await dataService.detectDuplicates(result2.transactions);
      console.log('Duplicate check on second import:', duplicateCheck.duplicates.length, 'duplicates found');
      
      // This should detect duplicates (opposite amounts)
      expect(duplicateCheck.duplicates.length).toBeGreaterThan(0);
      
      // Add only the unique transactions (should be none if duplicates are detected correctly)
      const addedTransactions = await dataService.addTransactions(duplicateCheck.uniqueTransactions);
      console.log('Added from second import:', addedTransactions.length, 'transactions');
    }

    // Final check: get all transactions and verify we don't have duplicates with opposite amounts
    const allTransactions = await dataService.getAllTransactions();
    console.log('Final transaction count:', allTransactions.length);
    
    allTransactions.forEach(tx => {
      console.log(`Final: ${tx.description} = ${tx.amount}`);
    });

    // Group by description to check for duplicates
    const groupedByDescription: { [key: string]: number[] } = {};
    allTransactions.forEach(tx => {
      if (!groupedByDescription[tx.description]) {
        groupedByDescription[tx.description] = [];
      }
      groupedByDescription[tx.description].push(tx.amount);
    });

    // Check that we don't have the same transaction with opposite amounts
    Object.keys(groupedByDescription).forEach(description => {
      const amounts = groupedByDescription[description];
      console.log(`${description}: amounts = [${amounts.join(', ')}]`);
      
      // Should not have both positive and negative versions of the same amount
      const uniqueAbsAmounts = new Set(amounts.map(a => Math.abs(a)));
      if (uniqueAbsAmounts.size < amounts.length) {
        // We have duplicate absolute amounts, check if they're opposite signs
        const hasOpposites = amounts.some((amt, i) => 
          amounts.slice(i + 1).some(otherAmt => Math.abs(amt + otherAmt) < 0.01)
        );
        expect(hasOpposites).toBe(false); // Should not have opposite amounts
      }
    });
  });
});