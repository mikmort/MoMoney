/**
 * Test for transfer matching diagnostic to identify the 109 vs 217 discrepancy
 */

import { dataService } from '../services/dataService';
import { Transaction } from '../types';
import { v4 as uuidv4 } from 'uuid';

describe('Transfer Matching Diagnostic', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
  });

  afterEach(async () => {
    await dataService.clearAllData();
  });

  test('should identify orphaned reimbursementId references', async () => {
    // Create test transactions with orphaned references
    const transactionA: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer A',
      category: 'Internal Transfer',
      amount: -100,
      account: 'Account A',
      type: 'transfer'
    };

    const transactionB: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer B',
      category: 'Internal Transfer',
      amount: 100,
      account: 'Account B',
      type: 'transfer'
    };

    const transactionC: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer C - Orphaned',
      category: 'Internal Transfer',
      amount: -50,
      account: 'Account A',
      type: 'transfer'
    };

    // Add transactions
    const [addedA, addedB, addedC] = await dataService.addTransactions([transactionA, transactionB, transactionC]);

    // Create proper match between A and B
    await dataService.updateTransaction(addedA.id, { reimbursementId: addedB.id });
    await dataService.updateTransaction(addedB.id, { reimbursementId: addedA.id });

    // Create orphaned reference in C (pointing to non-existent transaction)
    const orphanedId = uuidv4();
    await dataService.updateTransaction(addedC.id, { reimbursementId: orphanedId });

    // Run diagnostic
    const diagnostic = await dataService.diagnoseTransferMatchingInconsistencies();

    expect(diagnostic.totalTransactions).toBe(3);
    expect(diagnostic.transferTransactions).toBe(3);
    expect(diagnostic.matchedTransferTransactions).toBe(3); // A, B, and C all have reimbursementId
    expect(diagnostic.actualMatches).toBe(1); // Only A-B pair is bidirectional
    expect(diagnostic.orphanedReimbursementIds).toHaveLength(1);
    expect(diagnostic.orphanedReimbursementIds[0].transactionId).toBe(addedC.id);
    expect(diagnostic.orphanedReimbursementIds[0].reimbursementId).toBe(orphanedId);
    expect(diagnostic.bidirectionalMatchIssues).toHaveLength(0);
  });

  test('should identify bidirectional match issues', async () => {
    // Create test transactions with bidirectional issues
    const transactionA: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer A',
      category: 'Internal Transfer',
      amount: -100,
      account: 'Account A',
      type: 'transfer'
    };

    const transactionB: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'> = {
      date: new Date('2025-01-01'),
      description: 'Transfer B',
      category: 'Internal Transfer',
      amount: 100,
      account: 'Account B',
      type: 'transfer'
    };

    // Add transactions (they will be automatically matched since they are matching transfers)
    const [addedA, addedB] = await dataService.addTransactions([transactionA, transactionB]);

    // The automatic matching should have created bidirectional matches
    // Run diagnostic
    const diagnostic = await dataService.diagnoseTransferMatchingInconsistencies();

    expect(diagnostic.totalTransactions).toBe(2);
    expect(diagnostic.transferTransactions).toBe(2);
    expect(diagnostic.matchedTransferTransactions).toBe(2); // Both should be matched automatically
    expect(diagnostic.actualMatches).toBe(1); // One bidirectional match pair
    expect(diagnostic.orphanedReimbursementIds).toHaveLength(0);
    expect(diagnostic.bidirectionalMatchIssues).toHaveLength(0); // No issues since auto-matching creates proper bidirectional matches
  });

  test('should run diagnostic on real data to identify current issue', async () => {
    // This test will run the diagnostic on whatever data currently exists
    // Skip if no transfers exist
    const allTransactions = await dataService.getAllTransactions();
    const hasTransfers = allTransactions.some(tx => tx.type === 'transfer');
    
    if (!hasTransfers) {
      console.log('No transfer transactions found, skipping real data diagnostic');
      return;
    }

    // Run diagnostic on real data
    const diagnostic = await dataService.diagnoseTransferMatchingInconsistencies();

    console.log('=== TRANSFER MATCHING DIAGNOSTIC REPORT ===');
    console.log(`Total Transactions: ${diagnostic.totalTransactions}`);
    console.log(`Transfer Transactions: ${diagnostic.transferTransactions}`);
    console.log(`Matched Transfer Transactions: ${diagnostic.matchedTransferTransactions}`);
    console.log(`Actual Valid Matches: ${diagnostic.actualMatches}`);
    console.log(`Expected Matched Transaction Count: ${diagnostic.actualMatches * 2}`);
    console.log(`Discrepancy: ${diagnostic.matchedTransferTransactions - (diagnostic.actualMatches * 2)}`);
    
    console.log('\n=== ORPHANED REIMBURSEMENT IDs ===');
    if (diagnostic.orphanedReimbursementIds.length > 0) {
      diagnostic.orphanedReimbursementIds.forEach((orphan, idx) => {
        console.log(`${idx + 1}. Transaction ${orphan.transactionId.substring(0, 8)}... pointing to non-existent ${orphan.reimbursementId.substring(0, 8)}...`);
        console.log(`   Description: ${orphan.description}`);
        console.log(`   Amount: ${orphan.amount}`);
        console.log(`   Date: ${orphan.date}`);
      });
    } else {
      console.log('No orphaned reimbursementId references found');
    }

    console.log('\n=== BIDIRECTIONAL MATCH ISSUES ===');
    if (diagnostic.bidirectionalMatchIssues.length > 0) {
      diagnostic.bidirectionalMatchIssues.forEach((issue, idx) => {
        console.log(`${idx + 1}. Transaction ${issue.transactionId.substring(0, 8)}... -> ${issue.reimbursementId.substring(0, 8)}...`);
        console.log(`   Issue: ${issue.issue}`);
      });
    } else {
      console.log('No bidirectional match issues found');
    }

    // The diagnostic should help explain the 109 vs 217 discrepancy
    expect(diagnostic.actualMatches).toBeGreaterThan(0);
  });
});
