import { dataService } from '../services/dataService';

describe('Fix Transaction Duplication Issue (Issue #405)', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should prevent repeated migration execution that caused the issue logs', async () => {
    // This test demonstrates that the fix prevents the repeated migration logs
    // that were seen in the original issue:
    // [TX] Fixed transaction f9305c4c...: expense -> transfer
    // [TX] Fixed transaction f9305c4c...: transfer -> transfer (repeated for same ID)
    
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Add a transaction with "Internal Transfer" category and incorrect type
      const transaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Insurance Payment',
        amount: 242.30,
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense' // This will trigger the migration
      });

      console.log('=== SIMULATING MULTIPLE PAGE NAVIGATIONS/RELOADS ===');
      
      let migrationRunCount = 0;
      const originalLog = console.log;
      
      // Count how many times the migration actually fixes this transaction
      console.log = (...args) => {
        const message = args.join(' ');
        if (message.includes(`Fixed transaction ${transaction.id}`)) {
          migrationRunCount++;
        }
        originalLog.apply(console, args);
      };
      
      try {
        // Simulate multiple page reloads/navigations that would trigger re-initialization
        for (let i = 0; i < 5; i++) {
          console.log(`--- Navigation/Reload ${i + 1} ---`);
          (dataService as any).isInitialized = false;
          await dataService.getAllTransactions();
        }
        
        console.log(`Migration ran ${migrationRunCount} times for transaction ${transaction.id}`);
        
        // ✅ ASSERTION: The migration should only run ONCE even with multiple re-initializations
        expect(migrationRunCount).toBe(1);
        
        // Verify the transaction was fixed correctly
        const allTransactions = await dataService.getAllTransactions();
        expect(allTransactions).toHaveLength(1);
        expect(allTransactions[0].type).toBe('transfer');
        expect(allTransactions[0].id).toBe(transaction.id);
        
      } finally {
        console.log = originalLog;
      }
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should handle concurrent initialization without duplicate migration execution', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Add multiple transactions that would trigger migration
      await dataService.addTransaction({
        date: new Date('2025-01-20'),
        description: 'Transfer Payment 1',
        amount: 100.00,
        category: 'Internal Transfer',
        account: 'Account A',
        type: 'expense'
      });

      await dataService.addTransaction({
        date: new Date('2025-01-21'),
        description: 'Transfer Payment 2', 
        amount: -50.00,
        category: 'Internal Transfer',
        account: 'Account B',
        type: 'expense'
      });

      // Force re-initialization and simulate concurrent calls
      (dataService as any).isInitialized = false;
      
      // Simulate concurrent page loads/API calls
      const promises = [
        dataService.getAllTransactions(),
        dataService.getAllTransactions(), 
        dataService.getAllTransactions(),
        dataService.getAllTransactions(),
        dataService.getAllTransactions()
      ];

      await Promise.all(promises);

      // Verify all transactions are properly fixed and no duplicates created
      const finalTransactions = await dataService.getAllTransactions();
      expect(finalTransactions).toHaveLength(2);
      expect(finalTransactions.every(tx => tx.type === 'transfer')).toBe(true);
      expect(finalTransactions.every(tx => tx.category === 'Internal Transfer')).toBe(true);
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('should demonstrate the fix prevents the original issue scenario', async () => {
    // This test simulates the exact scenario from the issue:
    // "For accounts where expenses are shown as positive numbers and income as negative, 
    //  there appears to be a bug where at some point transactions get added back to the system, 
    //  and it ends up with many of the same transactions with positive and negative amounts."

    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    try {
      // Add a transaction that mimics the issue scenario
      await dataService.addTransaction({
        date: new Date('2025-01-25'),
        description: 'Insurance',
        amount: 242.30, // Positive expense (reversed convention)
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense'
      });

      let transactions = await dataService.getAllTransactions();
      console.log('Initial state:', transactions.map(t => ({ 
        desc: t.description, 
        amount: t.amount, 
        type: t.type 
      })));

      // Simulate the "navigating or reloading pages" that triggered the issue
      for (let i = 0; i < 3; i++) {
        console.log(`--- Simulate page navigation ${i + 1} ---`);
        (dataService as any).isInitialized = false;
        transactions = await dataService.getAllTransactions();
        
        // Log current state to see if duplicates appear
        console.log(`After navigation ${i + 1}:`, transactions.map(t => ({ 
          desc: t.description, 
          amount: t.amount, 
          type: t.type 
        })));
      }

      // ✅ ASSERTION: Should still have exactly 1 transaction, not duplicates
      expect(transactions).toHaveLength(1);
      expect(transactions[0].description).toBe('Insurance');
      expect(transactions[0].type).toBe('transfer'); // Should be fixed by migration
      
      // ❌ The original issue would show something like:
      // [
      //   { desc: 'Insurance', amount: 242.30, type: 'transfer' },
      //   { desc: 'Insurance', amount: -242.30, type: 'transfer' },
      //   { desc: 'Insurance', amount: 242.30, type: 'transfer' }
      // ]
      
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });
});