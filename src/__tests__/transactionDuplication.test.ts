import { dataService } from '../services/dataService';

describe('Transaction Duplication Issue', () => {
  beforeEach(async () => {
    // Clear data and prevent sample data initialization
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should investigate repeated initialization causing transaction duplication', async () => {
    // Temporarily override NODE_ENV to see migration logs
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Step 1: Add transactions that might trigger the migration (Internal Transfer category)
      const transaction1 = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Insurance Payment',
        amount: 242.30, // Positive amount (reversed convention)
        category: 'Internal Transfer', // This triggers the migration
        account: 'Test Account',
        type: 'expense' // This will be "fixed" to 'transfer' by the migration
      });

      console.log('Added transaction 1:', transaction1);

      // Get initial state
      let allTransactions = await dataService.getAllTransactions();
      console.log('Initial transactions count:', allTransactions.length);

      // Step 2: Force multiple re-initializations to see if we get repeated migration
      console.log('=== FIRST RE-INITIALIZATION ===');
      (dataService as any).isInitialized = false;
      await dataService.getAllTransactions();
      
      console.log('=== SECOND RE-INITIALIZATION ===');
      (dataService as any).isInitialized = false;
      await dataService.getAllTransactions();
      
      console.log('=== THIRD RE-INITIALIZATION ===');
      (dataService as any).isInitialized = false;
      await dataService.getAllTransactions();
      
      // Check final state
      allTransactions = await dataService.getAllTransactions();
      console.log('Final transactions count:', allTransactions.length);
      console.log('Final transactions:', allTransactions.map(t => ({ 
        id: t.id.substring(0, 8), 
        amount: t.amount, 
        type: t.type, 
        category: t.category 
      })));

      // Verify no duplication occurred
      expect(allTransactions.length).toBe(1);
      expect(allTransactions[0].type).toBe('transfer'); // Should be fixed by migration
      
    } finally {
      // Restore NODE_ENV
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should check if migration creates duplicate transactions', async () => {
    // Add a transaction that will trigger migration
    const originalTransaction = {
      date: new Date('2025-01-20'),
      description: 'Bank Transfer',
      amount: -100.00, // Normal convention 
      category: 'Internal Transfer',
      account: 'Checking Account',
      type: 'expense' as const // This will be "fixed" to 'transfer'
    };

    await dataService.addTransaction(originalTransaction);

    // Get transactions before forced re-init
    let transactions = await dataService.getAllTransactions();
    console.log('Before re-init:', transactions.length, 'transactions');
    console.log('Transaction types:', transactions.map(t => t.type));

    // Force re-initialization to trigger migration again
    (dataService as any).isInitialized = false;
    await dataService.getAllTransactions();

    // Check if migration created duplicates
    transactions = await dataService.getAllTransactions();
    console.log('After re-init:', transactions.length, 'transactions');
    console.log('Transaction types:', transactions.map(t => t.type));
    
    // Should still have only 1 transaction, not duplicated
    expect(transactions.length).toBe(1);
    expect(transactions[0].type).toBe('transfer');
  });
});