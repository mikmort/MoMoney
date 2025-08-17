import { dataService } from '../services/dataService';
import { db } from '../services/db';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('Issue #435 - Transaction Deletion Bug Reproduction', () => {
  beforeEach(async () => {
    await db.clearAll();
    (dataService as any).transactions = [];
    (dataService as any).history = {};
  });

  afterAll(async () => {
    await db.close();
  });

  it('should NOT delete all transactions during transfer matching operations', async () => {
    // Reproduce the exact scenario from the bug report:
    // 1. User has transactions
    // 2. User performs transfer matching on Transfer Matching page
    // 3. After clicking refresh, all transactions are gone but history remains

    // Step 1: Simulate user having real financial data
    const userTransactions = [
      {
        date: new Date('2025-01-10'),
        description: 'Salary Payment',
        amount: 5000.00,
        category: 'Income',
        account: 'Checking Account',
        type: 'income' as const
      },
      {
        date: new Date('2025-01-10'),
        description: 'Transfer to Savings',
        amount: -1000.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer' as const
      },
      {
        date: new Date('2025-01-10'),
        description: 'Transfer from Checking',
        amount: 1000.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'transfer' as const
      },
      {
        date: new Date('2025-01-11'),
        description: 'Grocery Store',
        amount: -150.00,
        category: 'Food & Dining',
        account: 'Checking Account',
        type: 'expense' as const
      },
      {
        date: new Date('2025-01-12'),
        description: 'Gas Station',
        amount: -45.00,
        category: 'Transportation',
        account: 'Checking Account',
        type: 'expense' as const
      }
    ];

    // Add all the user's transactions
    for (const txData of userTransactions) {
      await dataService.addTransaction(txData);
    }

    // Verify transactions were added
    let allTransactions = await dataService.getAllTransactions();
    expect(allTransactions).toHaveLength(5);
    console.log(`✅ Initial state: ${allTransactions.length} transactions loaded`);

    // Step 2: Simulate some transaction edits to create history (like the 1594 history entries mentioned)
    const transactions = await dataService.getAllTransactions();
    for (let i = 0; i < Math.min(3, transactions.length); i++) {
      const tx = transactions[i];
      await dataService.updateTransaction(tx.id, { 
        description: tx.description + ' (edited)' 
      });
      await dataService.updateTransaction(tx.id, { 
        notes: 'Added some notes' 
      });
    }

    // Verify we have some history entries (simulating the 1594 mentioned in bug report)
    let totalHistoryEntries = 0;
    for (const tx of transactions) {
      const history = await dataService.getTransactionHistory(tx.id);
      totalHistoryEntries += history.length;
    }
    expect(totalHistoryEntries).toBeGreaterThan(0);
    console.log(`✅ Created ${totalHistoryEntries} history entries`);

    // Step 3: Simulate transfer matching operations that trigger multiple saveToDB calls
    // This is what happens when user uses Transfer Matching page
    console.log('🔄 Simulating transfer matching operations...');

    // Trigger multiple rapid save operations (simulating transfer matching page operations)
    const promises = [];
    for (let i = 0; i < 3; i++) {
      // Simulate rapid operations that would trigger saveToDB
      promises.push(
        (async () => {
          const tx = await dataService.getAllTransactions();
          if (tx.length > 0) {
            // Simulate updating transfer matches (what happens during transfer matching)
            await dataService.updateTransaction(tx[0].id, {
              reimbursementId: tx.length > 1 ? tx[1].id : undefined,
              notes: (tx[0].notes || '') + `\n[Transfer Match Applied ${i}]`
            });
          }
        })()
      );
    }

    // Wait for all concurrent operations
    await Promise.allSettled(promises);

    // Step 4: Simulate user clicking refresh (reloading data)
    console.log('🔄 Simulating page refresh (reloading data)...');
    
    // Clear in-memory cache and reload from database (simulating page refresh)
    (dataService as any).transactions = [];
    (dataService as any).history = {};
    await (dataService as any).loadFromDB();

    // Step 5: Verify the bug is FIXED
    allTransactions = await dataService.getAllTransactions();
    
    // Before the fix: This would be 0 (transactions lost)
    // After the fix: This should still be 5 (transactions preserved)
    console.log(`✅ After refresh: ${allTransactions.length} transactions found`);
    expect(allTransactions).toHaveLength(5);

    // Verify we still have history (as mentioned in original bug report)
    totalHistoryEntries = 0;
    for (const tx of allTransactions) {
      const history = await dataService.getTransactionHistory(tx.id);
      totalHistoryEntries += history.length;
    }
    expect(totalHistoryEntries).toBeGreaterThan(0);
    console.log(`✅ History preserved: ${totalHistoryEntries} history entries`);

    // Verify specific transactions are intact
    const salaryTx = allTransactions.find(t => t.description.includes('Salary'));
    const transferOut = allTransactions.find(t => t.description.includes('Transfer to Savings'));
    const transferIn = allTransactions.find(t => t.description.includes('Transfer from Checking'));
    const groceryTx = allTransactions.find(t => t.description.includes('Grocery'));
    const gasTx = allTransactions.find(t => t.description.includes('Gas'));

    expect(salaryTx).toBeDefined();
    expect(transferOut).toBeDefined();
    expect(transferIn).toBeDefined();
    expect(groceryTx).toBeDefined();
    expect(gasTx).toBeDefined();

    console.log('✅ All original transactions preserved:');
    console.log(`   - Salary: $${salaryTx!.amount}`);
    console.log(`   - Transfer Out: $${transferOut!.amount}`);
    console.log(`   - Transfer In: $${transferIn!.amount}`);
    console.log(`   - Grocery: $${groceryTx!.amount}`);
    console.log(`   - Gas: $${gasTx!.amount}`);

    console.log('🎉 Issue #435 is FIXED - No transaction data loss occurred!');
  });
});