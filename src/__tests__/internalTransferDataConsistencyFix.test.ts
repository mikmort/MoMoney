import { dataService } from '../services/dataService';
import { rulesService } from '../services/rulesService';
import { Transaction, CategoryRule } from '../types';

describe('Internal Transfer Data Consistency Fix', () => {
  beforeEach(async () => {
    // Clear any existing data
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
    
    // Clear rules
    await rulesService.clearAllRules();
  });

  afterEach(async () => {
    // Clean up
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
    
    // Clear rules
    await rulesService.clearAllRules();
  });

  it('should fix existing transactions with Internal Transfer category but wrong type', async () => {
    // First, initialize the dataService normally to ensure proper setup
    await dataService['ensureInitialized']();
    
    // Clear any existing data to start clean
    dataService['transactions'] = [];
    
    // Directly create transactions with the problematic state (simulating existing bad data)
    // This bypasses the normal validation to reproduce the issue
    const problematicTransactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-02-13T23:00:00.000Z'),
        description: 'ACH Debit CAPITAL ONE  - CRCARDPMT',
        amount: -1199.31,
        notes: '',
        category: 'Internal Transfer', // Correct category
        account: 'First Tech Shared',
        type: 'expense', // WRONG TYPE - should be 'transfer'
        isVerified: false,
        originalText: 'ACH Debit CAPITAL ONE  - CRCARDPMT',
        subcategory: 'Payment Transfer',
        confidence: 1,
        reasoning: 'Matched rule: Auto: ACH Debit CAPITAL ONE  - CRCARDPMT (First Tech Shared)',
        addedDate: new Date('2025-08-17T22:41:07.159Z'),
        lastModifiedDate: new Date('2025-08-17T22:41:07.159Z')
      },
      {
        id: 'tx-2',
        date: new Date('2024-03-15T10:00:00.000Z'),
        description: 'Transfer from Checking to Savings',
        amount: 500.00,
        notes: '',
        category: 'Internal Transfer', // Correct category
        account: 'Savings Account',
        type: 'income', // WRONG TYPE - should be 'transfer'
        isVerified: false,
        originalText: 'Transfer from Checking to Savings',
        subcategory: 'Between Accounts',
        confidence: 1,
        reasoning: 'Matched transfer detection',
        addedDate: new Date('2025-08-17T22:41:07.159Z'),
        lastModifiedDate: new Date('2025-08-17T22:41:07.159Z')
      },
      {
        id: 'tx-3',
        date: new Date('2024-04-20T14:30:00.000Z'),
        description: 'Regular grocery purchase',
        amount: -75.50,
        notes: '',
        category: 'Food & Dining', // Normal transaction
        account: 'Credit Card',
        type: 'expense', // Correct type
        isVerified: false,
        originalText: 'WALMART SUPERCENTER',
        subcategory: 'Groceries',
        addedDate: new Date('2025-08-17T22:41:07.159Z'),
        lastModifiedDate: new Date('2025-08-17T22:41:07.159Z')
      }
    ];

    // Add the problematic transactions directly to the in-memory store
    // Disable audit to test manual migration
    dataService['internalTransferTypeAuditDone'] = true;
    dataService['transactions'] = [...problematicTransactions];

    // Verify the problematic state exists when audit is disabled
    let allTransactions = [...dataService['transactions']]; // Direct access without audit
    expect(allTransactions).toHaveLength(3);
    
    const problemTx1 = allTransactions.find(t => t.id === 'tx-1');
    const problemTx2 = allTransactions.find(t => t.id === 'tx-2');
    const normalTx = allTransactions.find(t => t.id === 'tx-3');
    
    expect(problemTx1?.category).toBe('Internal Transfer');
    expect(problemTx1?.type).toBe('expense'); // Wrong!
    
    expect(problemTx2?.category).toBe('Internal Transfer');
    expect(problemTx2?.type).toBe('income'); // Wrong!
    
    expect(normalTx?.category).toBe('Food & Dining');
    expect(normalTx?.type).toBe('expense'); // Correct

    // Now run the migration manually to fix the issues
    const migrationResult = await dataService['migrateInternalTransferTypes']();
    
    // Verify the migration fixed the issues
    expect(migrationResult.fixed).toBe(2); // Should fix 2 transactions
    expect(migrationResult.errors).toHaveLength(0); // No errors
    
    // Check that the transactions were fixed in memory
    const fixedTx1 = dataService['transactions'].find(t => t.id === 'tx-1');
    const fixedTx2 = dataService['transactions'].find(t => t.id === 'tx-2');
    const unchangedTx = dataService['transactions'].find(t => t.id === 'tx-3');
    
    expect(fixedTx1?.category).toBe('Internal Transfer');
    expect(fixedTx1?.type).toBe('transfer'); // Now correct!
    
    expect(fixedTx2?.category).toBe('Internal Transfer');
    expect(fixedTx2?.type).toBe('transfer'); // Now correct!
    
    expect(unchangedTx?.category).toBe('Food & Dining');
    expect(unchangedTx?.type).toBe('expense'); // Unchanged
    
    // Also verify via getAllTransactions (this should not clear the data)
    allTransactions = await dataService.getAllTransactions();
    
    const verifyTx1 = allTransactions.find(t => t.id === 'tx-1');
    const verifyTx2 = allTransactions.find(t => t.id === 'tx-2');
    
    expect(verifyTx1?.type).toBe('transfer');
    expect(verifyTx2?.type).toBe('transfer');
  });

  it('should prevent creating new transactions with Internal Transfer category but wrong type', async () => {
    // Attempt to add a transaction with the problematic combination
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Test Transfer',
      amount: -100.00,
      category: 'Internal Transfer', // Should force type to be 'transfer'
      subcategory: 'Between Accounts',
      account: 'Test Account',
      type: 'expense' // This should be overridden
    });

    // The dataService should have corrected the type
    expect(transaction.category).toBe('Internal Transfer');
    expect(transaction.type).toBe('transfer'); // Should be corrected automatically
  });

  it('should fix transactions when rules with Internal Transfer are applied to existing data', async () => {
    // Create a regular transaction first
    const transaction = await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'ACH TRANSFER TO ACCOUNT',
      amount: -500.00,
      category: 'Other', // Will be changed by rule
      account: 'Checking Account',
      type: 'expense' // Will be changed by rule
    });

    expect(transaction.category).toBe('Other');
    expect(transaction.type).toBe('expense');

    // Create a rule that categorizes this as Internal Transfer
    const transferRule: CategoryRule = {
      id: 'test-transfer-rule',
      name: 'Test Transfer Detection',
      description: 'Test rule for transfer detection',
      priority: 1,
      isActive: true,
      conditions: [
        {
          field: 'description',
          operator: 'contains',
          value: 'ach transfer',
          caseSensitive: false
        }
      ],
      action: {
        categoryId: 'internal-transfer',
        categoryName: 'Internal Transfer',
        subcategoryId: 'transfer-between-accounts',
        subcategoryName: 'Between Accounts',
        transactionType: 'transfer' // This should be applied
      },
      createdDate: new Date(),
      lastModifiedDate: new Date()
    };

    await rulesService.addRule(transferRule);

    // Apply the rule to existing transactions
    const reclassifiedCount = await rulesService.reclassifyExistingTransactions(transferRule);
    expect(reclassifiedCount).toBe(1);

    // Verify the transaction was properly updated with both category and type
    const allTransactions = await dataService.getAllTransactions();
    const updatedTransaction = allTransactions.find(t => t.id === transaction.id);
    
    expect(updatedTransaction?.category).toBe('Internal Transfer');
    expect(updatedTransaction?.type).toBe('transfer'); // Should be set by the rule or sync logic
    expect(updatedTransaction?.subcategory).toBe('Between Accounts');
  });

  it('should handle edge case where migration runs on empty database', async () => {
    // Ensure database is empty
    dataService['transactions'] = [];
    
    // Run migration on empty database
    const migrationResult = await dataService['migrateInternalTransferTypes']();
    
    // Should not crash and should report no fixes needed
    expect(migrationResult.fixed).toBe(0);
    expect(migrationResult.errors).toHaveLength(0);
  });

  it('should automatically fix transactions through audit in getAllTransactions', async () => {
    // Test that the automatic audit feature works correctly
    await dataService['ensureInitialized']();
    dataService['transactions'] = [];
    
    // Add problematic transactions and reset audit flag
    const problematicTransactions: Transaction[] = [
      {
        id: 'audit-tx-1',
        date: new Date('2024-04-01T10:00:00.000Z'),
        description: 'Auto Transfer',
        amount: -100.00,
        notes: '',
        category: 'Internal Transfer',
        account: 'Test Account',
        type: 'expense', // Wrong type - should trigger audit
        isVerified: false,
        originalText: 'Auto Transfer',
        subcategory: 'Test',
        confidence: 1,
        reasoning: 'Test transaction',
        addedDate: new Date(),
        lastModifiedDate: new Date()
      }
    ];
    
    dataService['transactions'] = [...problematicTransactions];
    dataService['internalTransferTypeAuditDone'] = false; // Enable audit
    
    // Call getAllTransactions which should trigger the audit
    const allTransactions = await dataService.getAllTransactions();
    
    // Verify audit fixed the transaction
    expect(allTransactions).toHaveLength(1);
    const fixedTx = allTransactions.find(t => t.id === 'audit-tx-1');
    expect(fixedTx?.category).toBe('Internal Transfer');
    expect(fixedTx?.type).toBe('transfer'); // Should be fixed by audit
    
    // Verify audit flag was set
    expect(dataService['internalTransferTypeAuditDone']).toBe(true);
  });
});