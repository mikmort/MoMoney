import { simplifiedImportExportService } from '../services/simplifiedImportExportService';
import { db } from '../services/db';

// Mock IndexedDB for testing
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';
import FDBKeyRange from 'fake-indexeddb/lib/FDBKeyRange';

// Setup fake IndexedDB
(global as any).indexedDB = new FDBFactory();
(global as any).IDBKeyRange = FDBKeyRange;

describe('ImportExportService', () => {
  beforeEach(async () => {
    // Clear the database before each test
    await db.clearAll();
  });

  afterAll(async () => {
    // Close database connection after tests
    await db.close();
  });

  test('should export data successfully', async () => {
    // Add a test transaction
    const testTransaction = {
      id: 'test-transaction-1',
      date: new Date('2025-08-01'),
      description: 'Test Export Transaction',
      category: 'Groceries',
      subcategory: 'Food',
      amount: -50.25,
      account: 'Test Account',
      type: 'expense' as const,
      confidence: 0.95,
      reasoning: 'Test transaction for export',
      isVerified: true,
      addedDate: new Date(),
      lastModifiedDate: new Date()
    };

    await db.transactions.add(testTransaction);

    // Add test preferences
    const testPreferences = {
      currency: 'USD',
      dateFormat: 'MM/dd/yyyy' as const,
      theme: 'light' as const
    };

    await db.saveUserPreferences(testPreferences);

    // Export data
    const exportData = await simplifiedImportExportService.exportData();

    // Verify export structure
    expect(exportData).toHaveProperty('version');
    expect(exportData).toHaveProperty('exportDate');
    expect(exportData).toHaveProperty('appVersion');
    expect(exportData).toHaveProperty('transactions');
    expect(exportData).toHaveProperty('preferences');
    expect(exportData).toHaveProperty('transactionHistory');

    // Verify transaction data
    expect(exportData.transactions).toHaveLength(1);
    expect(exportData.transactions[0].id).toBe('test-transaction-1');
    expect(exportData.transactions[0].description).toBe('Test Export Transaction');
    expect(exportData.transactions[0].amount).toBe(-50.25);

    // Verify preferences
    expect(exportData.preferences).toEqual(testPreferences);
  });

  test('should import data successfully', async () => {
    const importData = {
      version: '1.0',
      exportDate: '2025-08-09T17:05:00.000Z',
      appVersion: '0.1.0',
      transactions: [
        {
          id: 'test-import-1',
          date: '2025-08-01T00:00:00.000Z',
          description: 'Test Import Transaction',
          category: 'Groceries', 
          subcategory: 'Food',
          amount: -25.50,
          account: 'Chase Checking',
          type: 'expense',
          confidence: 0.90,
          reasoning: 'Test transaction for import validation',
          isVerified: true,
          addedDate: '2025-08-09T17:05:00.000Z',
          lastModifiedDate: '2025-08-09T17:05:00.000Z'
        }
      ],
      preferences: {
        currency: 'EUR',
        dateFormat: 'dd/MM/yyyy',
        theme: 'dark'
      },
      transactionHistory: []
    };

    // Import data
    const result = await simplifiedImportExportService.importData(importData);

    // Verify import result
    expect(result.transactions).toBe(1);
    expect(result.preferences).toBe(true);
    expect(result.historyEntries).toBe(0);

    // Verify transaction was imported
    const transactions = await db.transactions.toArray();
    expect(transactions).toHaveLength(1);
    expect(transactions[0].id).toBe('test-import-1');
    expect(transactions[0].description).toBe('Test Import Transaction');
    expect(transactions[0].amount).toBe(-25.50);

    // Verify preferences were imported
    const preferences = await db.getUserPreferences();
    expect(preferences).toEqual({
      currency: 'EUR',
      dateFormat: 'dd/MM/yyyy',
      theme: 'dark'
    });
  });

  test('should handle round-trip export and import', async () => {
    // Add initial data
    const originalTransaction = {
      id: 'original-transaction',
      date: new Date('2025-08-01'),
      description: 'Original Transaction',
      category: 'Food',
      amount: -30.00,
      account: 'Test Account',
      type: 'expense' as const,
      isVerified: false,
      addedDate: new Date(),
      lastModifiedDate: new Date()
    };

    await db.transactions.add(originalTransaction);

    const originalPreferences = {
      currency: 'CAD',
      dateFormat: 'yyyy-MM-dd' as const,
      theme: 'auto' as const
    };

    await db.saveUserPreferences(originalPreferences);

    // Export data
    const exportData = await simplifiedImportExportService.exportData();

    // Clear database
    await db.clearAll();

    // Verify database is empty
    const emptyTransactions = await db.transactions.toArray();
    const emptyPreferences = await db.getUserPreferences();
    expect(emptyTransactions).toHaveLength(0);
    expect(emptyPreferences).toBeNull();

    // Import the exported data
    const importResult = await simplifiedImportExportService.importData(exportData);

    expect(importResult.transactions).toBe(1);
    expect(importResult.preferences).toBe(true);

    // Verify data was restored
    const restoredTransactions = await db.transactions.toArray();
    const restoredPreferences = await db.getUserPreferences();

    expect(restoredTransactions).toHaveLength(1);
    expect(restoredTransactions[0].id).toBe('original-transaction');
    expect(restoredTransactions[0].description).toBe('Original Transaction');
    expect(restoredTransactions[0].amount).toBe(-30.00);

    expect(restoredPreferences).toEqual(originalPreferences);
  });

  test('should reject invalid import data', async () => {
    const invalidData = {
      // Missing required fields
      invalidField: 'test'
    };

    await expect(
      simplifiedImportExportService.importData(invalidData as any)
    ).rejects.toThrow('Invalid backup file format');
  });
});