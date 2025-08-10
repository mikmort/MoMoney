import { simplifiedImportExportService } from '../services/simplifiedImportExportService';
import { dataService } from '../services/dataService';
import { db } from '../services/db';
import { Transaction } from '../types';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('Data Integrity Regression Tests', () => {
  beforeEach(async () => {
    await db.clearAll();
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Import/Export Data Corruption Prevention', () => {
    it('should preserve transaction IDs during export/import to prevent duplicates', async () => {
      const originalTransaction = {
        id: 'critical-transaction-id-123',
        date: new Date('2025-01-15'),
        description: 'Important Transaction',
        category: 'Business',
        amount: -1500.00,
        account: 'Business Account',
        type: 'expense' as const,
        isVerified: true,
        confidence: 0.95,
        reasoning: 'AI classified',
        addedDate: new Date(),
        lastModifiedDate: new Date()
      };

      // Add transaction
      await db.transactions.add(originalTransaction);

      // Export data
      const exportData = await simplifiedImportExportService.exportData();

      // Clear database
      await db.clearAll();

      // Verify database is empty
      const emptyCheck = await db.transactions.count();
      expect(emptyCheck).toBe(0);

      // Import data back
      await simplifiedImportExportService.importData(exportData);

      // Verify exact transaction ID is preserved
      const importedTransaction = await db.transactions.get('critical-transaction-id-123');
      expect(importedTransaction).toBeDefined();
      expect(importedTransaction?.id).toBe('critical-transaction-id-123');
      expect(importedTransaction?.amount).toBe(-1500.00);
    });

    it('should handle corrupted export data without losing existing data', async () => {
      // Add existing data
      const existingTransaction = {
        id: 'existing-tx-1',
        date: new Date('2025-01-10'),
        description: 'Existing Transaction',
        category: 'Food',
        amount: -25.00,
        account: 'Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        lastModifiedDate: new Date()
      };

      await db.transactions.add(existingTransaction);

      // Try to import corrupted data
      const corruptedData = {
        version: '1.0',
        exportDate: 'invalid-date-format',
        appVersion: '0.1.0',
        transactions: [
          {
            // Missing required fields
            description: 'Corrupted Transaction',
            // amount: -50.00, // Missing amount
            // date: new Date(), // Missing date
            category: 'Test'
          }
        ],
        preferences: null, // Invalid preferences
        transactionHistory: 'not an array' // Invalid type
      };

      // Import should fail but not corrupt existing data
      await expect(
        simplifiedImportExportService.importData(corruptedData as any)
      ).rejects.toThrow();

      // Verify existing data is still intact
      const existingStillThere = await db.transactions.get('existing-tx-1');
      expect(existingStillThere).toBeDefined();
      expect(existingStillThere?.amount).toBe(-25.00);

      // Verify no partial import occurred
      const allTransactions = await db.transactions.toArray();
      expect(allTransactions).toHaveLength(1);
      expect(allTransactions[0].id).toBe('existing-tx-1');
    });

    it('should handle extremely large datasets without memory issues', async () => {
      // Generate a large dataset (1000 transactions)
      const largeTransactionSet = [];
      for (let i = 0; i < 1000; i++) {
        largeTransactionSet.push({
          id: `large-tx-${i}`,
          date: new Date(2025, 0, (i % 30) + 1), // Spread across January
          description: `Transaction ${i} with some description text to make it realistic`,
          category: i % 2 === 0 ? 'Food' : 'Transportation',
          amount: -(i * 1.23 + 0.45), // Varied amounts
          account: i % 3 === 0 ? 'Checking' : 'Credit Card',
          type: 'expense' as const,
          isVerified: i % 10 === 0, // Some verified
          confidence: 0.8 + (i % 20) / 100, // Varied confidence
          addedDate: new Date(),
          lastModifiedDate: new Date()
        });
      }

      // Add all transactions
      await db.transactions.bulkAdd(largeTransactionSet);

      const startTime = Date.now();
      
      // Export large dataset
      const exportData = await simplifiedImportExportService.exportData();
      
      const exportTime = Date.now() - startTime;

      // Should complete within reasonable time (30 seconds)
      expect(exportTime).toBeLessThan(30000);

      // Verify all data is in export
      expect(exportData.transactions).toHaveLength(1000);

      // Clear and re-import
      await db.clearAll();
      
      const importStartTime = Date.now();
      const importResult = await simplifiedImportExportService.importData(exportData);
      const importTime = Date.now() - importStartTime;

      // Should complete within reasonable time
      expect(importTime).toBeLessThan(30000);

      // Verify all data imported correctly
      expect(importResult.transactions).toBe(1000);
      const finalCount = await db.transactions.count();
      expect(finalCount).toBe(1000);
    }, 10000); // 10 second timeout for large dataset test
  });

  describe('Database Schema Evolution', () => {
    it('should handle import of data with missing new fields gracefully', async () => {
      // Simulate old version export data without new fields
      const oldVersionData = {
        version: '0.9', // Old version
        exportDate: '2024-12-01T00:00:00.000Z',
        appVersion: '0.0.9',
        transactions: [
          {
            id: 'old-format-tx',
            date: '2025-01-15T00:00:00.000Z',
            description: 'Old Format Transaction',
            category: 'Food',
            amount: -30.00,
            account: 'Checking',
            type: 'expense'
            // Missing: isVerified, confidence, reasoning, addedDate, lastModifiedDate
          }
        ],
        preferences: {
          currency: 'USD'
          // Missing: new preference fields
        },
        transactionHistory: []
      };

      const result = await simplifiedImportExportService.importData(oldVersionData);

      expect(result.transactions).toBe(1);

      // Verify transaction was imported with sensible defaults for missing fields
      const imported = await db.transactions.get('old-format-tx');
      expect(imported).toBeDefined();
      expect(imported?.id).toBe('old-format-tx');
      expect(imported?.amount).toBe(-30.00);
      
      // Should have reasonable defaults for missing fields
      expect(imported?.addedDate).toBeDefined();
      expect(imported?.lastModifiedDate).toBeDefined();
    });

    it('should handle import of data with unknown extra fields without breaking', async () => {
      // Simulate future version export with extra fields
      const futureVersionData = {
        version: '2.0', // Future version
        exportDate: '2025-06-01T00:00:00.000Z',
        appVersion: '2.0.0',
        transactions: [
          {
            id: 'future-format-tx',
            date: '2025-01-15T00:00:00.000Z',
            description: 'Future Format Transaction',
            category: 'Food',
            amount: -40.00,
            account: 'Checking',
            type: 'expense',
            // Extra future fields
            aiVersion: '3.0',
            blockchainHash: 'abc123def456',
            quantumEncrypted: true,
            extraFutureField: { complex: 'object' }
          }
        ],
        preferences: {
          currency: 'USD',
          theme: 'dark',
          // Extra future preferences
          holographicDisplay: true,
          aiAssistantLevel: 'advanced'
        },
        transactionHistory: [],
        // Extra future top-level fields
        aiTrainingData: [],
        blockchainSync: { lastSync: '2025-06-01' }
      };

      const result = await simplifiedImportExportService.importData(futureVersionData);

      expect(result.transactions).toBe(1);

      // Should import core fields successfully, ignoring unknown fields
      const imported = await db.transactions.get('future-format-tx');
      expect(imported).toBeDefined();
      expect(imported?.amount).toBe(-40.00);
      expect(imported?.description).toBe('Future Format Transaction');
    });
  });

  describe('Data Consistency Validation', () => {
    it('should detect and handle inconsistent transaction amounts during import', async () => {
      const inconsistentData = {
        version: '1.0',
        exportDate: '2025-01-15T00:00:00.000Z',
        appVersion: '0.1.0',
        transactions: [
          {
            id: 'consistent-tx',
            date: '2025-01-15T00:00:00.000Z',
            description: 'Normal Transaction',
            category: 'Food',
            amount: -25.50,
            account: 'Checking',
            type: 'expense'
          },
          {
            id: 'inconsistent-tx',
            date: '2025-01-16T00:00:00.000Z', 
            description: 'Problematic Transaction',
            category: 'Income',
            amount: 'not a number', // Invalid amount type
            account: 'Checking',
            type: 'income'
          },
          {
            id: 'infinite-tx',
            date: '2025-01-17T00:00:00.000Z',
            description: 'Infinite Transaction',
            category: 'Error',
            amount: Infinity, // Invalid amount value
            account: 'Checking', 
            type: 'expense'
          }
        ],
        preferences: { currency: 'USD' },
        transactionHistory: []
      };

      // Import should handle invalid data gracefully
      const result = await simplifiedImportExportService.importData(inconsistentData as any);

      // Should import only valid transactions
      expect(result.transactions).toBeLessThanOrEqual(3);

      const allTransactions = await db.transactions.toArray();
      
      // At minimum, the valid transaction should be imported
      const validTransaction = allTransactions.find(tx => tx.id === 'consistent-tx');
      expect(validTransaction).toBeDefined();
      expect(validTransaction?.amount).toBe(-25.50);

      // Invalid transactions should be skipped or fixed
      allTransactions.forEach(tx => {
        expect(typeof tx.amount).toBe('number');
        expect(isFinite(tx.amount)).toBe(true);
        expect(!isNaN(tx.amount)).toBe(true);
      });
    });

    it('should maintain referential integrity across related data', async () => {
      // Create data with relationships
      const exportData = {
        version: '1.0',
        exportDate: '2025-01-15T00:00:00.000Z',
        appVersion: '0.1.0',
        transactions: [
          {
            id: 'parent-tx',
            date: '2025-01-15T00:00:00.000Z',
            description: 'Business Expense',
            category: 'Business',
            amount: -100.00,
            account: 'Credit Card',
            type: 'expense',
            reimbursable: true
          },
          {
            id: 'child-tx',
            date: '2025-01-20T00:00:00.000Z',
            description: 'Reimbursement',
            category: 'Reimbursement', 
            amount: 100.00,
            account: 'Checking',
            type: 'income',
            reimbursementId: 'parent-tx' // References parent transaction
          }
        ],
        preferences: { currency: 'USD' },
        transactionHistory: []
      };

      const result = await simplifiedImportExportService.importData(exportData);
      expect(result.transactions).toBe(2);

      // Verify both transactions imported
      const parent = await db.transactions.get('parent-tx');
      const child = await db.transactions.get('child-tx');

      expect(parent).toBeDefined();
      expect(child).toBeDefined();

      // Verify relationship is maintained
      expect(child?.reimbursementId).toBe('parent-tx');
    });
  });
});