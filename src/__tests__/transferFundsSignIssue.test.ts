import { FileProcessingService } from '../services/fileProcessingService';
import { dataService } from '../services/dataService';

describe('Transfer Funds Sign Issue - Issue #536', () => {
  let fileProcessingService: FileProcessingService;

  beforeEach(async () => {
    fileProcessingService = new FileProcessingService();
    await dataService.initialize();
  });

  afterEach(async () => {
    await dataService.clearAllData();
  });

  it('should keep transfer funds from bank transactions positive (not reverse the sign)', async () => {
    // Create test data based on the issue description - Schwab Bank transfer data
    const csvContent = `Date,Action,Description,Amount
12/9/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,37000.00
12/6/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,116000.00
6/13/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,65000.00
6/7/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,46000.00
6/5/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,25000.00
4/18/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,10000.00
3/12/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,47500.00
3/11/2024,Journal,TRANSFER FUNDS FROM SCHWAB BANK - ...964,37500.00`;

    // Create a mock file
    const mockFile = new File([csvContent], 'schwab-transfers.csv', { type: 'text/csv' });
    const accountId = 'test-account';

    // Process the file
    const result = await fileProcessingService.processUploadedFile(mockFile, accountId);

    expect(result.transactions).toBeDefined();
    expect(result.transactions!.length).toBe(8);

    // All transfer transactions should remain POSITIVE since they are funds coming IN
    const transferTransactions = result.transactions!;
    
    console.log('🔍 Processed transactions:');
    transferTransactions.forEach((tx, idx) => {
      console.log(`  ${idx + 1}. ${tx.description}: $${tx.amount} (${tx.amount > 0 ? 'POSITIVE' : 'NEGATIVE'})`);
    });

    // These should all be positive amounts since they represent money coming into the account
    expect(transferTransactions[0].amount).toBe(37000.00); // Should be positive, not -37000
    expect(transferTransactions[1].amount).toBe(116000.00); // Should be positive, not -116000
    expect(transferTransactions[2].amount).toBe(65000.00); // Should be positive, not -65000
    expect(transferTransactions[3].amount).toBe(46000.00); // Should be positive, not -46000

    // All transfers should be positive (funds coming in)
    transferTransactions.forEach((tx, idx) => {
      expect(tx.amount).toBeGreaterThan(0, 
        `Transfer ${idx + 1} (${tx.description}) should be positive but got ${tx.amount}`);
    });

    // They should be categorized as transfers
    transferTransactions.forEach((tx, idx) => {
      expect(tx.category).toBe('Internal Transfer', 
        `Transfer ${idx + 1} should be categorized as Internal Transfer but got ${tx.category}`);
      expect(tx.type).toBe('transfer',
        `Transfer ${idx + 1} should have type 'transfer' but got ${tx.type}`);
    });
  });

  it('should not reverse amounts when transfers are present in the data', async () => {
    // Mixed data with expenses and transfer funds - this tests the amount reversal logic
    const csvContent = `Date,Description,Amount
2024-01-01,Starbucks Coffee,5.50
2024-01-02,TRANSFER FUNDS FROM SCHWAB BANK,25000.00
2024-01-03,McDonald's Restaurant,12.50
2024-01-04,TRANSFER FUNDS FROM SCHWAB BANK,35000.00
2024-01-05,Amazon Purchase,89.99`;

    const mockFile = new File([csvContent], 'mixed-transactions.csv', { type: 'text/csv' });
    const accountId = 'test-account';

    const result = await fileProcessingService.processUploadedFile(mockFile, accountId);

    expect(result.transactions).toBeDefined();
    expect(result.transactions!.length).toBe(5);

    const transactions = result.transactions!;
    
    console.log('🔍 Mixed transactions results:');
    transactions.forEach((tx, idx) => {
      console.log(`  ${idx + 1}. ${tx.description}: $${tx.amount} (category: ${tx.category}, type: ${tx.type})`);
    });

    // Find the transfer transactions
    const transferTx1 = transactions.find(tx => tx.description.includes('25000'));
    const transferTx2 = transactions.find(tx => tx.description.includes('35000'));

    expect(transferTx1).toBeDefined();
    expect(transferTx2).toBeDefined();
    
    // Transfer funds should remain positive
    expect(transferTx1!.amount).toBe(25000.00);
    expect(transferTx2!.amount).toBe(35000.00);

    // Expenses should be negative (Starbucks, McDonald's, Amazon)
    const expenseTx1 = transactions.find(tx => tx.description.includes('Starbucks'));
    const expenseTx2 = transactions.find(tx => tx.description.includes('McDonald'));
    const expenseTx3 = transactions.find(tx => tx.description.includes('Amazon'));

    expect(expenseTx1!.amount).toBeLessThan(0); // Should be negative expense
    expect(expenseTx2!.amount).toBeLessThan(0); // Should be negative expense  
    expect(expenseTx3!.amount).toBeLessThan(0); // Should be negative expense
  });
});