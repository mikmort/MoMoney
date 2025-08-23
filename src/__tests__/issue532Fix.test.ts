import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Issue #532 - Internal Transfer Data Validation Fix', () => {
  beforeEach(async () => {
    // Clear any existing data
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  afterEach(async () => {
    // Clean up
    dataService['transactions'] = [];
    dataService['isInitialized'] = false;
  });

  it('should fix the exact issue described in #532', async () => {
    // Reproduce the exact problematic transaction from the issue description
    const problematicTransaction: Transaction = {
      id: "0381d188-e08b-4206-b2f8-fa4649d012ab",
      date: new Date("2024-02-13T23:00:00.000Z"),
      description: "ACH Debit CAPITAL ONE  - CRCARDPMT",
      amount: -1199.31,
      notes: "",
      category: "Internal Transfer",
      account: "First Tech Shared",
      type: "expense", // This is the problem - should be "transfer"
      isVerified: false,
      originalText: "ACH Debit CAPITAL ONE  - CRCARDPMT",
      subcategory: "Payment Transfer",
      confidence: 1,
      reasoning: "Matched rule: Auto: ACH Debit CAPITAL ONE  - CRCARDPMT (First Tech Shared)",
      addedDate: new Date("2025-08-17T22:41:07.159Z"),
      lastModifiedDate: new Date("2025-08-17T22:41:07.159Z")
    };

    // Initialize dataService and inject the problematic transaction
    await dataService['ensureInitialized']();
    // Disable audit to test manual migration
    dataService['internalTransferTypeAuditDone'] = true;
    dataService['transactions'] = [problematicTransaction];

    // Verify the problem exists when audit is disabled
    let transactions = [...dataService['transactions']]; // Direct access without audit
    expect(transactions).toHaveLength(1);
    expect(transactions[0].category).toBe("Internal Transfer");
    expect(transactions[0].type).toBe("expense"); // Problem!

    // Run the migration to fix it
    const migrationResult = await dataService['migrateInternalTransferTypes']();

    // Verify the fix
    expect(migrationResult.fixed).toBe(1);
    expect(migrationResult.errors).toHaveLength(0);

    // Verify the transaction is now correct
    const fixedTransaction = dataService['transactions'].find(t => t.id === problematicTransaction.id);
    expect(fixedTransaction?.category).toBe("Internal Transfer");
    expect(fixedTransaction?.type).toBe("transfer"); // Fixed!
  });

  it('should prevent the issue from happening when adding new transactions', async () => {
    // Try to add a transaction that would have the same problem
    const transaction = await dataService.addTransaction({
      date: new Date("2024-02-13T23:00:00.000Z"),
      description: "ACH Debit CAPITAL ONE  - CRCARDPMT",
      amount: -1199.31,
      notes: "",
      category: "Internal Transfer", // This should force type to be "transfer"
      account: "First Tech Shared",
      type: "expense", // This should be overridden
      isVerified: false,
      originalText: "ACH Debit CAPITAL ONE  - CRCARDPMT",
      subcategory: "Payment Transfer",
      confidence: 1,
      reasoning: "Matched rule: Auto: ACH Debit CAPITAL ONE  - CRCARDPMT (First Tech Shared)"
    });

    // Verify the transaction was corrected automatically
    expect(transaction.category).toBe("Internal Transfer");
    expect(transaction.type).toBe("transfer"); // Should be automatically corrected
  });

  it('should prevent the issue when updating existing transactions', async () => {
    // Create a normal transaction first
    const transaction = await dataService.addTransaction({
      date: new Date("2024-02-13"),
      description: "Grocery store",
      amount: -50.00,
      category: "Food",
      account: "Credit Card",
      type: "expense"
    });

    expect(transaction.type).toBe("expense");
    expect(transaction.category).toBe("Food");

    // Update it to be an Internal Transfer - type should automatically change
    const updatedTransaction = await dataService.updateTransaction(transaction.id, {
      category: "Internal Transfer",
      subcategory: "Between Accounts"
    });

    expect(updatedTransaction?.category).toBe("Internal Transfer");
    expect(updatedTransaction?.type).toBe("transfer"); // Should be automatically set
  });

  it('should handle Asset Allocation similarly to Internal Transfer', async () => {
    // Test that Asset Allocation also gets proper type sync
    const transaction = await dataService.addTransaction({
      date: new Date("2024-02-13"),
      description: "Asset rebalancing",
      amount: -1000.00,
      category: "Asset Allocation", // Special category
      account: "Investment Account",
      type: "expense" // Should be overridden
    });

    expect(transaction.category).toBe("Asset Allocation");
    expect(transaction.type).toBe("asset-allocation"); // Should be automatically corrected
  });

  it('should work correctly in bulk operations', async () => {
    // Test adding multiple transactions with problematic data
    const transactions = await dataService.addTransactions([
      {
        date: new Date("2024-01-01"),
        description: "Transfer 1",
        amount: -500.00,
        category: "Internal Transfer",
        account: "Account 1",
        type: "expense" // Should be corrected
      },
      {
        date: new Date("2024-01-02"),
        description: "Asset allocation 1", 
        amount: -1000.00,
        category: "Asset Allocation",
        account: "Investment Account",
        type: "expense" // Should be corrected
      },
      {
        date: new Date("2024-01-03"),
        description: "Regular expense",
        amount: -25.00,
        category: "Food",
        account: "Credit Card", 
        type: "expense" // Should remain unchanged
      }
    ]);

    expect(transactions).toHaveLength(3);
    
    // Check that the special categories got corrected types
    expect(transactions[0].category).toBe("Internal Transfer");
    expect(transactions[0].type).toBe("transfer");
    
    expect(transactions[1].category).toBe("Asset Allocation");
    expect(transactions[1].type).toBe("asset-allocation");
    
    expect(transactions[2].category).toBe("Food");
    expect(transactions[2].type).toBe("expense"); // Unchanged
  });
});