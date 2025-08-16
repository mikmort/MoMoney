import { dataService } from '../services/dataService';

describe('Concurrent Migration Issue', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should investigate concurrent initialization causing repeated migration', async () => {
    // Override NODE_ENV to see migration logs
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Add a transaction that will trigger the migration
      await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Insurance Payment',
        amount: 242.30, 
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense' // This will be fixed by migration
      });

      console.log('=== TESTING CONCURRENT INITIALIZATION ===');
      
      // Simulate multiple concurrent initializations
      (dataService as any).isInitialized = false;
      
      const promises = [
        dataService.getAllTransactions(),
        dataService.getAllTransactions(),
        dataService.getAllTransactions()
      ];
      
      // Wait for all to complete
      await Promise.all(promises);
      
      // Check final state
      const allTransactions = await dataService.getAllTransactions();
      console.log('Final state:', allTransactions.length, 'transactions');
      console.log('Transaction types:', allTransactions.map(t => ({ id: t.id.substring(0, 8), type: t.type })));
      
      // Should have exactly 1 transaction, not duplicates
      expect(allTransactions.length).toBe(1);
      expect(allTransactions[0].type).toBe('transfer');
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should investigate category change cycle causing repeated migration', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Add a transaction that will trigger the migration
      await dataService.addTransaction({
        date: new Date('2025-01-20'),
        description: 'Transfer Payment',
        amount: 100.00,
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense'
      });

      console.log('=== TESTING CATEGORY CHANGE CYCLE ===');

      // Add a transaction that will trigger the migration
      const initialTransaction = await dataService.addTransaction({
        date: new Date('2025-01-20'),
        description: 'Transfer Payment',
        amount: 100.00,
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense'
      });

      console.log('=== TESTING CATEGORY CHANGE CYCLE ===');

      // Simulate the category change cycle that might cause issues
      console.log('Initial:', initialTransaction.type, initialTransaction.category);

      // Change away from Internal Transfer
      await dataService.updateTransaction(initialTransaction.id, { category: 'Food & Dining' });
      let updated = (await dataService.getAllTransactions())[0];
      console.log('After changing to Food:', updated.type, updated.category);

      // Change back to Internal Transfer
      await dataService.updateTransaction(initialTransaction.id, { category: 'Internal Transfer' });
      updated = (await dataService.getAllTransactions())[0];
      console.log('After changing back:', updated.type, updated.category);

      // Force re-initialization to see if migration runs again
      (dataService as any).isInitialized = false;
      await dataService.getAllTransactions();
      
      const finalTransactions = await dataService.getAllTransactions();
      console.log('After re-init:', finalTransactions.length, 'transactions');
      
      expect(finalTransactions.length).toBe(1);
      expect(finalTransactions[0].type).toBe('transfer');
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should investigate if amount processing creates duplicates', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      console.log('=== TESTING AMOUNT PROCESSING DUPLICATES ===');

      // Simulate what might happen during file upload with amount reversal
      const transactionData = {
        date: new Date('2025-01-25'),
        description: 'Insurance Payment',
        amount: 242.30, // Positive amount
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense' as const
      };

      // Add the transaction first time
      const tx1 = await dataService.addTransaction(transactionData);
      console.log('First add:', tx1.id.substring(0, 8), tx1.amount, tx1.type);

      // Simulate amount reversal scenario - add the same transaction with negative amount
      const tx2 = await dataService.addTransaction({
        ...transactionData,
        amount: -242.30 // Negative amount  
      });
      console.log('Second add:', tx2.id.substring(0, 8), tx2.amount, tx2.type);

      let allTransactions = await dataService.getAllTransactions();
      console.log('Before re-init:', allTransactions.length, 'transactions');
      
      // Force re-initialization to trigger migration
      (dataService as any).isInitialized = false;
      await dataService.getAllTransactions();
      
      allTransactions = await dataService.getAllTransactions();
      console.log('After re-init:', allTransactions.length, 'transactions');
      console.log('Final transactions:', allTransactions.map(t => ({ 
        id: t.id.substring(0, 8), 
        amount: t.amount, 
        type: t.type 
      })));

      // This might reveal the duplication issue
      expect(allTransactions.length).toBeGreaterThanOrEqual(1);
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});