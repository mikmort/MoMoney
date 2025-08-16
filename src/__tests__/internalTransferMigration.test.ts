import { dataService } from '../services/dataService';

describe('Internal Transfer Type Migration', () => {
  beforeEach(async () => {
    // Clear any existing data
    dataService['transactions'] = [];
    dataService['history'] = {};
    dataService['isInitialized'] = false;
  });

  afterEach(async () => {
    // Clean up
    dataService['transactions'] = [];
    dataService['history'] = {};
    dataService['isInitialized'] = false;
  });

  it('should fix transactions with Internal Transfer category but wrong type during migration', async () => {
    // Add a transaction with correct type first
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer to Savings',
      amount: -500.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Checking Account',
      type: 'transfer'
    });

    // Manually corrupt the type to simulate existing bad data
    const transactions = dataService['transactions'];
    const transfer = transactions.find(t => t.description === 'Transfer to Savings');
    if (transfer) {
      transfer.type = 'expense'; // Simulate corrupted data
    }

    // Call the migration function directly
    const migrationResult = await dataService['migrateInternalTransferTypes']();

    expect(migrationResult.fixed).toBe(1); // Should fix 1 transaction
    expect(migrationResult.errors.length).toBe(0);

    // Verify the transaction was fixed
    const allTransactions = dataService['transactions'];
    const fixedTransfer = allTransactions.find(t => t.description === 'Transfer to Savings');
    expect(fixedTransfer?.type).toBe('transfer');
  });

  it('should handle migration when no corrupted transactions exist', async () => {
    // Add a correctly typed transaction
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer to Savings',
      amount: -500.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Checking Account',
      type: 'transfer' // Already correct
    });

    // Call the migration function
    const migrationResult = await dataService['migrateInternalTransferTypes']();

    expect(migrationResult.fixed).toBe(0); // Should fix nothing
    expect(migrationResult.errors.length).toBe(0);

    // Verify the transaction type remains correct
    const allTransactions = dataService['transactions'];
    const transfer = allTransactions.find(t => t.description === 'Transfer to Savings');
    expect(transfer?.type).toBe('transfer');
  });

  it('should only fix Internal Transfer transactions and leave others alone', async () => {
    // Add both Internal Transfer and regular transactions
    await dataService.addTransaction({
      date: new Date('2024-01-01'),
      description: 'Transfer to Savings',
      amount: -500.00,
      category: 'Internal Transfer',
      subcategory: 'Between Accounts',
      account: 'Checking Account',
      type: 'transfer'
    });

    await dataService.addTransaction({
      date: new Date('2024-01-02'),
      description: 'Coffee Purchase',
      amount: -5.00,
      category: 'Food & Dining',
      subcategory: 'Coffee',
      account: 'Credit Card',
      type: 'expense'
    });

    // Corrupt the Internal Transfer transaction type
    const transactions = dataService['transactions'];
    const transfer = transactions.find(t => t.category === 'Internal Transfer');
    if (transfer) {
      transfer.type = 'expense'; // Simulate corrupted data
    }

    // Call the migration function
    const migrationResult = await dataService['migrateInternalTransferTypes']();

    expect(migrationResult.fixed).toBe(1); // Should fix only the Internal Transfer
    expect(migrationResult.errors.length).toBe(0);

    // Verify correct fixes
    const allTransactions = dataService['transactions'];
    const fixedTransfer = allTransactions.find(t => t.category === 'Internal Transfer');
    const regularExpense = allTransactions.find(t => t.category === 'Food & Dining');
    
    expect(fixedTransfer?.type).toBe('transfer');
    expect(regularExpense?.type).toBe('expense'); // Should not be touched
  });
});