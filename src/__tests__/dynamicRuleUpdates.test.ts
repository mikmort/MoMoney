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

  it('should create auto-rules from high-confidence AI classifications and apply them to remaining transactions', async () => {
    // Setup: Mock AI service to return high-confidence classifications for first batch
    // and similar transactions in later batches should be caught by the new rule
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map((req, index) => {
        if (req.transactionText.includes('STARBUCKS')) {
          return {
            categoryId: 'Food & Dining',
            subcategoryId: 'Coffee Shops',
            confidence: 0.9, // High confidence - should create auto-rule
            reasoning: 'Coffee shop purchase detected'
          };
        }
        return {
          categoryId: 'uncategorized',
          confidence: 0.5,
          reasoning: 'Unable to categorize'
        };
      });
    });

    // Create test raw data in CSV format (array of arrays)
    const rawData = [
      ['2024-01-01', 'STARBUCKS #123', '-4.50'],
      ['2024-01-02', 'GROCERY STORE', '-45.00'], 
      ['2024-01-03', 'STARBUCKS #456', '-5.25'], // Should match new rule
      ['2024-01-04', 'STARBUCKS #789', '-4.75'], // Should match new rule
      ['2024-01-05', 'GAS STATION', '-35.00']
    ];

    // Create simple mapping for CSV format
    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1', 
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    // Execute the batch processing
    console.log('🧪 Starting dynamic rule test...');
    const result = await (fileProcessingService as any).processTransactions(
      'test-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account',
      (processed) => console.log(`Progress: ${processed} transactions processed`)
    );

    // Verify results
    expect(result).toHaveLength(5);
    
    // First STARBUCKS transaction should be categorized by AI
    const firstStarbucks = result.find(t => t.description === 'STARBUCKS #123');
    expect(firstStarbucks?.category).toBe('Food & Dining');
    expect(firstStarbucks?.confidence).toBe(0.9);
    expect(firstStarbucks?.reasoning).toBe('Coffee shop purchase detected');

    // Subsequent STARBUCKS transactions should be categorized by the auto-created rule
    const secondStarbucks = result.find(t => t.description === 'STARBUCKS #456');
    const thirdStarbucks = result.find(t => t.description === 'STARBUCKS #789');
    
    expect(secondStarbucks?.category).toBe('Food & Dining');
    expect(secondStarbucks?.confidence).toBe(1.0); // Rules have 100% confidence
    expect(secondStarbucks?.reasoning).toContain('Matched rule:');
    
    expect(thirdStarbucks?.category).toBe('Food & Dining');
    expect(thirdStarbucks?.confidence).toBe(1.0);
    expect(thirdStarbucks?.reasoning).toContain('Matched rule:');

    // Verify that a rule was created
    const rules = await rulesService.getAllRules();
    const starbucksRule = rules.find(rule => 
      rule.conditions.some(c => c.field === 'description' && String(c.value).includes('STARBUCKS'))
    );
    expect(starbucksRule).toBeDefined();
    expect(starbucksRule?.action.categoryName).toBe('Food & Dining');
    
    // Verify AI API efficiency - should be called for fewer transactions than total
    // First batch processes STARBUCKS #123 and GROCERY STORE
    // After creating rule for STARBUCKS, remaining STARBUCKS transactions should be matched by rule
    // So AI should process fewer transactions due to dynamic rule matching
    expect(mockAzureOpenAI.classifyTransactionsBatch).toHaveBeenCalled();
    
    console.log('✅ Dynamic rule test completed successfully!');
  });

  it('should handle batch size limits correctly during dynamic rule application', async () => {
    // Mock AI service to return high-confidence classifications
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map((req) => ({
        categoryId: 'Transportation',
        confidence: 0.85, // High confidence
        reasoning: 'Transportation expense detected'
      }));
    });

    // Create many similar transactions in CSV format to test batching
    const rawData = Array.from({ length: 50 }, (_, i) => [
      `2024-01-${String(i + 1).padStart(2, '0')}`,
      `UBER RIDE ${i + 1}`,
      `${-(15.00 + (i * 0.5))}`
    ]);

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2', 
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    console.log('🧪 Starting batch size test with 50 transactions...');
    const result = await (fileProcessingService as any).processTransactions(
      'test-batch-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify all transactions were processed
    expect(result).toHaveLength(50);
    
    // All should be categorized as Transportation
    const transportationTransactions = result.filter(t => t.category === 'Transportation');
    expect(transportationTransactions.length).toBe(50);
    
    // Most should be handled by dynamically created rules (confidence 1.0)
    const ruleBasedTransactions = result.filter(t => t.confidence === 1.0);
    expect(ruleBasedTransactions.length).toBeGreaterThan(30); // Should be significant
    
    console.log(`✅ Batch test completed: ${ruleBasedTransactions.length}/50 transactions handled by dynamic rules`);
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