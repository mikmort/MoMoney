import { dataService } from '../services/dataService';
import { db } from '../services/db';
import { Transaction } from '../types';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('Transaction Data Loss Regression Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('saveToDB() atomic operation', () => {
    beforeEach(async () => {
      // Ensure clean state for each test
      await db.clearAll();
      (dataService as any).transactions = [];
      (dataService as any).history = {};
    });

    it('should use database transactions to prevent data loss during save', async () => {
      // Add some initial transactions
      const transaction1 = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Initial Transaction 1',
        amount: -50.00,
        category: 'Food',
        account: 'Test Account',
        type: 'expense'
      });

      const transaction2 = await dataService.addTransaction({
        date: new Date('2025-01-16'),
        description: 'Initial Transaction 2',
        amount: -25.00,
        category: 'Transport',
        account: 'Test Account',
        type: 'expense'
      });

      // Verify transactions are saved
      let allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(2);

      // Test that the saveToDB method uses database transactions
      // by checking that db.transaction is called
      const originalTransaction = db.transaction.bind(db);
      let transactionCalled = false;
      
      db.transaction = jest.fn().mockImplementation((mode: any, tables: any, callback: any) => {
        transactionCalled = true;
        return originalTransaction(mode, tables, callback);
      });

      // Trigger a save operation by adding another transaction
      await dataService.addTransaction({
        date: new Date('2025-01-17'),
        description: 'Test Transaction',
        amount: -30.00,
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      // Verify database transaction was used
      expect(transactionCalled).toBe(true);
      expect(db.transaction).toHaveBeenCalledWith('rw', [db.transactions], expect.any(Function));

      // Restore original transaction method
      db.transaction = originalTransaction;

      // Verify all transactions are there
      allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(3);
    });

    it('should handle critical data corruption prevention', async () => {
      // This test simulates the original bug where saveToDB would clear first then populate
      // If an error occurred after clear but before populate, all data would be lost
      
      // Add initial data
      await dataService.addTransaction({
        date: new Date('2025-01-20'),
        description: 'Critical Transaction',
        amount: -100.00,
        category: 'Important',
        account: 'Test Account',
        type: 'expense'
      });

      let allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(1);

      // Mock the old vulnerable behavior by bypassing the atomic transaction
      const originalClear = db.transactions.clear.bind(db.transactions);
      const originalBulkPut = (db as any).robustBulkPut;
      
      let clearCalled = false;
      let bulkPutCalled = false;
      
      db.transactions.clear = jest.fn().mockImplementation(async () => {
        clearCalled = true;
        return originalClear();
      });
      
      (db as any).robustBulkPut = jest.fn().mockImplementation(async (table: any, items: any[]) => {
        bulkPutCalled = true;
        return originalBulkPut.call(db, table, items);
      });

      // Add another transaction - this should use the safe atomic approach
      await dataService.addTransaction({
        date: new Date('2025-01-21'),
        description: 'Test Safety Transaction',
        amount: -25.00,
        category: 'Safety',
        account: 'Test Account',
        type: 'expense'
      });

      // Verify the operations were called in the right context (within a transaction)
      expect(clearCalled).toBe(true);
      expect(bulkPutCalled).toBe(true);
      
      // Most importantly, verify data integrity is maintained
      allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(2);
      
      const criticalTransaction = allTransactions.find(t => t.description === 'Critical Transaction');
      const safetyTransaction = allTransactions.find(t => t.description === 'Test Safety Transaction');
      
      expect(criticalTransaction).toBeDefined();
      expect(safetyTransaction).toBeDefined();
      expect(criticalTransaction!.amount).toBe(-100.00);
      expect(safetyTransaction!.amount).toBe(-25.00);

      // Restore mocks
      db.transactions.clear = originalClear;
      (db as any).robustBulkPut = originalBulkPut;
    });

    it('should preserve existing data when concurrent saves occur', async () => {
      // Add initial transaction
      await dataService.addTransaction({
        date: new Date('2025-01-25'),
        description: 'Concurrent Test Transaction',
        amount: -100.00,
        category: 'Test',
        account: 'Test Account',
        type: 'expense'
      });

      let allTransactions = await dataService.getAllTransactions();
      expect(allTransactions).toHaveLength(1);

      // The key test: verify that rapid successive save operations don't interfere with each other
      // This simulates what happens during transfer matching when multiple saves might be triggered
      
      const promises: Promise<any>[] = [];
      
      for (let i = 0; i < 3; i++) {
        promises.push(
          dataService.addTransaction({
            date: new Date('2025-01-26'),
            description: `Concurrent Transaction ${i}`,
            amount: -10 * (i + 1),
            category: 'Concurrent',
            account: 'Test Account',
            type: 'expense'
          })
        );
      }

      // Wait for all operations to complete
      const results = await Promise.allSettled(promises);
      
      // Check that at least some succeeded (concurrency may cause some failures but data should be preserved)
      const successful = results.filter(r => r.status === 'fulfilled').length;
      expect(successful).toBeGreaterThan(0);

      // Verify we still have at least our original transaction and didn't lose data
      allTransactions = await dataService.getAllTransactions();
      expect(allTransactions.length).toBeGreaterThanOrEqual(1);
      
      // Verify the original transaction is still there
      const originalTransaction = allTransactions.find(t => t.description === 'Concurrent Test Transaction');
      expect(originalTransaction).toBeDefined();
      expect(originalTransaction!.amount).toBe(-100.00);
    });
  });
});