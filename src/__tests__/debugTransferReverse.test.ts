import { FileProcessingService } from '../services/fileProcessingService';
import { dataService } from '../services/dataService';

describe('Debug Transfer Reversal Logic', () => {
  let fileProcessingService: FileProcessingService;

  beforeEach(async () => {
    fileProcessingService = new FileProcessingService();
    await dataService.initialize();
  });

  afterEach(async () => {
    await dataService.clearAllData();
  });

  it('should debug the mixed data scenario', async () => {
    // Mixed data with expenses and transfer funds
    const csvContent = `Date,Description,Amount
2024-01-01,Starbucks Coffee,5.50
2024-01-02,TRANSFER FUNDS FROM SCHWAB BANK,25000.00
2024-01-03,McDonald's Restaurant,12.50
2024-01-04,TRANSFER FUNDS FROM SCHWAB BANK,35000.00
2024-01-05,Amazon Purchase,89.99`;

    const mockFile = new File([csvContent], 'debug-mixed.csv', { type: 'text/csv' });
    const accountId = 'test-account';

    const result = await fileProcessingService.processUploadedFile(mockFile, accountId);

    console.log('🔍 Debug - All transactions:');
    result.transactions!.forEach((tx, idx) => {
      console.log(`  ${idx + 1}. "${tx.description}": $${tx.amount}`);
    });

    // Just debug - don't fail
    expect(result.transactions).toBeDefined();
  });
});