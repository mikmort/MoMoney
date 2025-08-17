import { dataService } from '../services/dataService';
import { backupService } from '../services/backupService';
import { db } from '../services/db';
import { Transaction } from '../types';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('Bulk Edit Performance Integration Test', () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  afterAll(async () => {
    await db.close();
  });

  it('should demonstrate the performance improvement from issue #481', async () => {
    // Setup: Create a realistic scenario with multiple transactions like the issue described
    await db.clearAll();
    (dataService as any).transactions = [];
    (dataService as any).history = {};

    // Create test data similar to the 2912 transactions mentioned in the issue, but smaller for testing
    const testTransactions = [];
    for (let i = 0; i < 20; i++) {
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: `MobilePay Transaction ${i}`,
        amount: -50.00,
        category: 'Uncategorized', // Will be changed in bulk edit
        account: 'Danske Konto',
        type: 'expense',
        isVerified: false
      });
      testTransactions.push(transaction);
    }

    console.log(`✅ Created ${testTransactions.length} test transactions`);

    // Mock backup service to count notifications (this is what was causing the noise in the issue)
    let backupNotificationCount = 0;
    const originalNotifyDataChange = backupService.notifyDataChange;
    backupService.notifyDataChange = jest.fn().mockImplementation(() => {
      backupNotificationCount++;
      console.log(`[BACKUP] Data change detected at ${new Date().toISOString()}`);
      // Don't actually check for backup to avoid timing issues in tests
    });

    // Mock saveToDB to count database saves
    let dbSaveCount = 0;
    const originalSaveToDB = (dataService as any).saveToDB.bind(dataService);
    (dataService as any).saveToDB = jest.fn().mockImplementation(async () => {
      dbSaveCount++;
      console.log(`[DB] Bulk operation successful: ${(dataService as any).transactions.length} items`);
      return originalSaveToDB();
    });

    // Test 1: Bulk category edit using the new batchUpdateTransactions method
    console.log('\n🔧 Testing bulk category edit (AFTER fix)...');
    
    const categoryUpdates = testTransactions.map(t => ({
      id: t.id,
      updates: {
        category: 'Food & Dining',
        subcategory: 'Restaurants',
        lastModifiedDate: new Date()
      } as Partial<Transaction>,
      note: 'Bulk edit: Set category to Food & Dining → Restaurants'
    }));

    // Reset counters
    dbSaveCount = 0;
    backupNotificationCount = 0;

    // Perform bulk update - this simulates the fixed handleBulkEditSubmit function
    await dataService.batchUpdateTransactions(categoryUpdates, { skipHistory: true });

    console.log(`✅ Category edit applied to ${testTransactions.length} transactions`);
    console.log(`📊 Database saves: ${dbSaveCount} (should be 1)`);
    console.log(`📊 Backup notifications: ${backupNotificationCount} (should be 1)`);

    // Verify the fix: should be only 1 database save and 1 backup notification
    expect(dbSaveCount).toBe(1);
    expect(backupNotificationCount).toBe(1);

    // Test 2: Bulk verification using the new batch approach  
    console.log('\n🔧 Testing bulk verification (AFTER fix)...');
    
    const verificationUpdates = testTransactions.map(t => ({
      id: t.id,
      updates: {
        isVerified: true,
        lastModifiedDate: new Date()
      } as Partial<Transaction>,
      note: 'Bulk operation: Mark as verified'
    }));

    // Reset counters
    dbSaveCount = 0;
    backupNotificationCount = 0;

    // Perform bulk verification - this simulates the fixed handleBulkMarkAsVerified function
    await dataService.batchUpdateTransactions(verificationUpdates, { skipHistory: true });

    console.log(`✅ Verification applied to ${testTransactions.length} transactions`);
    console.log(`📊 Database saves: ${dbSaveCount} (should be 1)`);
    console.log(`📊 Backup notifications: ${backupNotificationCount} (should be 1)`);

    // Verify the fix: should be only 1 database save and 1 backup notification
    expect(dbSaveCount).toBe(1);
    expect(backupNotificationCount).toBe(1);

    // Test 3: Demonstrate what the OLD approach would have done (for comparison)
    console.log('\n⚠️ Demonstrating OLD approach impact (for comparison)...');
    
    // Reset counters
    dbSaveCount = 0;
    backupNotificationCount = 0;

    // Simulate the old individual update approach (what was causing the issue)
    for (let i = 0; i < 5; i++) { // Just test with 5 transactions to keep test fast
      await dataService.updateTransaction(
        testTransactions[i].id, 
        { category: 'Transport' },
        'Individual update (old approach)'
      );
    }

    console.log(`⚠️ Individual updates to 5 transactions (OLD approach)`);
    console.log(`📊 Database saves: ${dbSaveCount} (would be ${testTransactions.length} for all transactions)`);
    console.log(`📊 Backup notifications: ${backupNotificationCount} (would be ${testTransactions.length} for all transactions)`);

    // This demonstrates the old problem: N saves and N notifications
    expect(dbSaveCount).toBe(5); // One per transaction
    expect(backupNotificationCount).toBe(5); // One per transaction

    console.log('\n🎉 Performance improvement demonstrated:');
    console.log(`   OLD: ${testTransactions.length} × (DB save + backup notification) = ${testTransactions.length * 2} operations`);
    console.log(`   NEW: 1 × (DB save + backup notification) = 2 operations`);
    console.log(`   Improvement: ${Math.round((testTransactions.length * 2) / 2)}x faster!`);

    // Restore original methods
    (dataService as any).saveToDB = originalSaveToDB;
    backupService.notifyDataChange = originalNotifyDataChange;
  });
});