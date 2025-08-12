import { FileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';
import { accountManagementService } from '../services/accountManagementService';

describe('Fixed Transaction Categorization', () => {
  let fileProcessingService: FileProcessingService;

  beforeEach(async () => {
    fileProcessingService = new FileProcessingService();
    await rulesService.clearAllRules();

    // Add test account
    const testAccount = {
      id: 'test-checking',
      name: 'Test Checking', 
      type: 'checking' as const,
      currency: 'USD',
      institution: 'Test Bank',
      balance: 1000
    };
    await accountManagementService.addAccount(testAccount);
  });

  afterEach(async () => {
    await rulesService.clearAllRules();
  });

  it('should correctly handle transactions with high-confidence AI classifications after the fix', async () => {
    console.log('🧪 Testing the FIXED transaction categorization logic...');
    
    // Mock AI service to return high confidence results
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    const mockBatchResponse = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming',
        confidence: 0.87,
        reasoning: 'Spotify streaming service - clear entertainment classification'
      },
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming', 
        confidence: 0.89,
        reasoning: 'Netflix streaming service - clear entertainment classification'
      },
      {
        categoryId: 'shopping',
        subcategoryId: 'shopping-online',
        confidence: 0.85,
        reasoning: 'Amazon online shopping'
      }
    ];

    azureOpenAIService.classifyTransactionsBatch = jest.fn()
      .mockResolvedValueOnce(mockBatchResponse.slice(0, 3)) // First batch: all 3 transactions
      .mockResolvedValueOnce(mockBatchResponse.slice(0, 2)); // After rule creation, only 2 unmatched

    try {
      // Test data: raw CSV-style data that matches the processTransactions signature
      const rawData = [
        ['2024-01-15', 'Spotify USA', '-15.99'],
        ['2024-01-16', 'Netflix', '-12.99'],
        ['2024-01-17', 'Amazon Purchase', '-25.99']
      ];

      const schemaMapping = {
        dateColumn: '0',
        descriptionColumn: '1',
        amountColumn: '2',
        hasHeaders: false,
        skipRows: 0,
        dateFormat: 'YYYY-MM-DD',
        amountFormat: 'negative for debits'
      };

      const subcategories = defaultCategories.flatMap(c => c.subcategories || []);

      console.log('🔧 Processing transactions with the FIXED logic...');
      
      // This should now work correctly without the index mismatch bug
      const result = await (fileProcessingService as any).processTransactions(
        'test-file-id',
        rawData,
        schemaMapping,
        defaultCategories,
        subcategories,
        'test-checking',
        jest.fn()
      );

      console.log(`✅ Processing completed successfully with ${result.length} transactions`);

      // Verify all transactions are properly categorized
      expect(result).toHaveLength(3);
      
      result.forEach((transaction, index) => {
        console.log(`Transaction ${index + 1}:`);
        console.log(`  Description: "${transaction.description}"`);
        console.log(`  Category: "${transaction.category}"`);
        console.log(`  Subcategory: "${transaction.subcategory || 'none'}"`);
        console.log(`  Confidence: ${transaction.confidence}`);
        console.log(`  Reasoning: "${transaction.reasoning || 'none'}"`);

        // High confidence transactions should NOT be "Uncategorized"
        if (transaction.confidence >= 0.8) {
          expect(transaction.category).not.toBe('Uncategorized');
        }

        // Specific expectations for our test transactions
        if (transaction.description === 'Spotify USA' || transaction.description === 'Netflix') {
          expect(transaction.category).toBe('Entertainment');
          expect(transaction.subcategory).toBe('Streaming Services');
        } else if (transaction.description === 'Amazon Purchase') {
          expect(transaction.category).toBe('Shopping');
        }

        // All should have reasonable confidence
        expect(transaction.confidence).toBeGreaterThan(0.7);
      });

      console.log('🎉 All transactions correctly categorized with high confidence!');

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });

  it('should handle the auto-rule creation scenario correctly after the fix', async () => {
    console.log('🧪 Testing auto-rule creation with the FIXED logic...');
    
    // Mock AI to return high confidence for first call, then handle rule matching
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    const highConfidenceResults = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming',
        confidence: 0.91, // High enough to create auto-rule
        reasoning: 'Spotify clearly entertainment streaming'
      },
      {
        categoryId: 'entertainment', 
        subcategoryId: 'entertainment-streaming',
        confidence: 0.88,
        reasoning: 'Netflix entertainment streaming'
      }
    ];

    // First call processes both transactions, second call should only get remaining unmatched ones
    azureOpenAIService.classifyTransactionsBatch = jest.fn()
      .mockResolvedValueOnce(highConfidenceResults) // Initial batch
      .mockResolvedValueOnce([highConfidenceResults[1]]); // After Spotify rule is created

    try {
      const rawData = [
        ['2024-01-15', 'Spotify USA', '-15.99'],
        ['2024-01-16', 'Netflix', '-12.99']
      ];

      const schemaMapping = {
        dateColumn: '0',
        descriptionColumn: '1',
        amountColumn: '2',
        hasHeaders: false,
        skipRows: 0,
        dateFormat: 'YYYY-MM-DD',
        amountFormat: 'negative for debits'
      };

      const subcategories = defaultCategories.flatMap(c => c.subcategories || []);

      console.log('Processing with auto-rule creation scenario...');
      
      const result = await (fileProcessingService as any).processTransactions(
        'test-file-id',
        rawData,
        schemaMapping,
        defaultCategories,
        subcategories,
        'test-checking',
        jest.fn()
      );

      console.log(`Completed processing ${result.length} transactions`);
      
      // Check that rules were created
      const rules = await rulesService.getAllRules();
      console.log(`Auto-rules created: ${rules.length}`);
      
      rules.forEach(rule => {
        console.log(`  Rule: "${rule.name}" -> ${rule.action.categoryName}`);
      });

      // Verify both transactions are properly categorized
      expect(result).toHaveLength(2);
      
      const spotify = result.find(t => t.description === 'Spotify USA');
      const netflix = result.find(t => t.description === 'Netflix');
      
      expect(spotify).toBeDefined();
      expect(netflix).toBeDefined();
      
      // Both should be Entertainment (either from rules or AI)
      expect(spotify!.category).toBe('Entertainment');
      expect(netflix!.category).toBe('Entertainment');
      
      // At least one should have high confidence
      expect(Math.max(spotify!.confidence, netflix!.confidence)).toBeGreaterThan(0.8);

      console.log('🎉 Auto-rule creation scenario handled correctly!');

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });
});