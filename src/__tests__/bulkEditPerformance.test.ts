import { dataService } from '../services/dataService';
import { db } from '../services/db';
import { Transaction } from '../types';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('Bulk Edit Performance Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('batchUpdateTransactions vs individual updateTransaction calls', () => {
    beforeEach(async () => {
      // Ensure clean state for each test
      await db.clearAll();
      (dataService as any).transactions = [];
      (dataService as any).history = {};
    });

    it('should use single database save for batch operations', async () => {
      // Add some test transactions
      const transactions = [];
      for (let i = 0; i < 5; i++) {
        const transaction = await dataService.addTransaction({
          date: new Date('2025-01-15'),
          description: `Test Transaction ${i}`,
          amount: -50.00 * (i + 1),
          category: 'Food',
          account: 'Test Account',
          type: 'expense'
        });
        transactions.push(transaction);
      }

      // Mock saveToDB to count how many times it's called
      let saveToDBCallCount = 0;
      const originalSaveToDB = (dataService as any).saveToDB.bind(dataService);
      (dataService as any).saveToDB = jest.fn().mockImplementation(async () => {
        saveToDBCallCount++;
        return originalSaveToDB();
      });

      // Test batch update - should call saveToDB only once
      const batchUpdates = transactions.map(t => ({
        id: t.id,
        updates: { category: 'Transport' } as Partial<Transaction>,
        note: 'Bulk test update'
      }));

      await dataService.batchUpdateTransactions(batchUpdates, { skipHistory: true });

      // Verify saveToDB was called only once for the batch operation
      expect(saveToDBCallCount).toBe(1);

      // Reset counter and restore original method
      saveToDBCallCount = 0;
      (dataService as any).saveToDB = originalSaveToDB;

      // For comparison, test individual updates - would call saveToDB multiple times
      let individualSaveCount = 0;
      (dataService as any).saveToDB = jest.fn().mockImplementation(async () => {
        individualSaveCount++;
        return originalSaveToDB();
      });

      // Update the same transactions individually
      for (const transaction of transactions) {
        await dataService.updateTransaction(transaction.id, { category: 'Entertainment' }, 'Individual update');
      }

      // Verify saveToDB was called multiple times for individual updates
      expect(individualSaveCount).toBe(transactions.length); // One call per transaction

      // Restore original method
      (dataService as any).saveToDB = originalSaveToDB;
    });

    it('should handle bulk category updates efficiently', async () => {
      // Add test transactions
      const transactions = [];
      for (let i = 0; i < 10; i++) {
        const transaction = await dataService.addTransaction({
          date: new Date('2025-01-15'),
          description: `Bulk Test Transaction ${i}`,
          amount: -25.00,
          category: 'Uncategorized',
          account: 'Test Account',
          type: 'expense'
        });
        transactions.push(transaction);
      }

      // Prepare batch updates similar to what handleBulkEditSubmit would do
      const batchUpdates = transactions.map(t => ({
        id: t.id,
        updates: {
          category: 'Food & Dining',
          subcategory: 'Restaurants',
          lastModifiedDate: new Date()
        } as Partial<Transaction>,
        note: 'Bulk edit: Set category to Food & Dining → Restaurants'
      }));

      // Perform batch update
      const updatedTransactions = await dataService.batchUpdateTransactions(batchUpdates, { skipHistory: true });

      // Verify all transactions were updated
      expect(updatedTransactions).toHaveLength(transactions.length);
      
      // Verify the updates were applied
      const allTransactions = await dataService.getAllTransactions();
      const updatedCount = allTransactions.filter(t => 
        t.category === 'Food & Dining' && t.subcategory === 'Restaurants'
      ).length;
      
      expect(updatedCount).toBe(transactions.length);
    });

    it('should handle bulk verification updates efficiently', async () => {
      // Add unverified test transactions
      const transactions = [];
      for (let i = 0; i < 8; i++) {
        const transaction = await dataService.addTransaction({
          date: new Date('2025-01-16'),
          description: `Unverified Transaction ${i}`,
          amount: -15.00,
          category: 'Transport',
          account: 'Test Account',
          type: 'expense',
          isVerified: false
        });
        transactions.push(transaction);
      }

      // Prepare batch verification updates similar to what handleBulkMarkAsVerified would do
      const batchUpdates = transactions.map(t => ({
        id: t.id,
        updates: {
          isVerified: true,
          lastModifiedDate: new Date()
        } as Partial<Transaction>,
        note: 'Bulk operation: Mark as verified'
      }));

      // Perform batch update
      const updatedTransactions = await dataService.batchUpdateTransactions(batchUpdates, { skipHistory: true });

      // Verify all transactions were updated
      expect(updatedTransactions).toHaveLength(transactions.length);
      
      // Verify the verification updates were applied
      const allTransactions = await dataService.getAllTransactions();
      const verifiedCount = allTransactions.filter(t => t.isVerified === true).length;
      
      expect(verifiedCount).toBe(transactions.length);
    });
  });
});