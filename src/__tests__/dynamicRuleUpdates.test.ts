import { fileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';
import { Transaction, CategoryRule } from '../types';

// Mock external dependencies
jest.mock('../services/azureOpenAIService');
jest.mock('../services/accountManagementService');

const mockAzureOpenAI = azureOpenAIService as jest.Mocked<typeof azureOpenAIService>;

describe('Dynamic Rule Updates During Import', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear all rules before each test
    rulesService.clearAllRules();
  });





  it('should not create auto-rules from low-confidence AI classifications', async () => {
    // Mock AI service to return low-confidence classifications
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map(() => ({
        categoryId: 'Entertainment',
        confidence: 0.6, // Low confidence - should not create auto-rule
        reasoning: 'Uncertain categorization'
      }));
    });

    const rawData = [
      ['2024-01-01', 'UNKNOWN MERCHANT', '-25.00'],
      ['2024-01-02', 'UNKNOWN MERCHANT', '-30.00']
    ];

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    console.log('🧪 Starting low-confidence test...');
    const result = await (fileProcessingService as any).processTransactions(
      'test-low-confidence-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify no auto-rules were created
    const rules = await rulesService.getAllRules();
    expect(rules.length).toBe(0);
    
    // All transactions should have AI-assigned confidence (0.6), not rule confidence (1.0)
    result.forEach(transaction => {
      expect(transaction.confidence).toBe(0.6);
      expect(transaction.reasoning).toBe('Uncertain categorization');
    });
    
    console.log('✅ Low-confidence test completed - no auto-rules created as expected');
  });
});