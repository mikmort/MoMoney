import { FileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';

describe('Transaction Categorization Bug Fix Validation', () => {
  let fileProcessingService: FileProcessingService;

  beforeEach(async () => {
    fileProcessingService = new FileProcessingService();
    await rulesService.clearAllRules();
  });

  afterEach(async () => {
    await rulesService.clearAllRules();
  });

  it('should correctly categorize high-confidence AI transactions like Spotify USA', async () => {
    console.log('🧪 Testing the issue: High confidence AI transactions should NOT become uncategorized');
    
    // Mock the AI service to return high confidence entertainment classification for Spotify
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    const mockHighConfidenceResponse = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming', 
        confidence: 0.87, // High confidence - should NOT become uncategorized
        reasoning: 'Spotify USA is clearly a music streaming service under entertainment'
      }
    ];

    azureOpenAIService.classifyTransactionsBatch = jest.fn()
      .mockResolvedValue(mockHighConfidenceResponse);

    try {
      // Test data simulating a CSV import with Spotify transaction
      const csvData = [
        ['2024-01-15', 'Spotify USA', '-15.99']
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

      console.log('Processing Spotify transaction through the fixed logic...');
      
      // Use the actual file processing method that would be called during CSV import
      const result = await (fileProcessingService as any).processTransactions(
        csvData,
        schemaMapping,
        'test-account',
        defaultCategories,
        'test-file-id',
        jest.fn()
      );

      console.log(`✅ Processing completed with ${result.length} transactions`);

      expect(result).toHaveLength(1);
      const spotifyTransaction = result[0];

      console.log('Spotify transaction result:');
      console.log(`  Description: "${spotifyTransaction.description}"`);
      console.log(`  Category: "${spotifyTransaction.category}"`);
      console.log(`  Subcategory: "${spotifyTransaction.subcategory || 'none'}"`);
      console.log(`  Confidence: ${spotifyTransaction.confidence}`);
      console.log(`  Reasoning: "${spotifyTransaction.reasoning}"`);

      // The key assertion: High confidence AI results should NOT be "Uncategorized"
      expect(spotifyTransaction.description).toBe('Spotify USA');
      expect(spotifyTransaction.confidence).toBe(0.87);
      expect(spotifyTransaction.category).not.toBe('Uncategorized'); // This was the bug
      expect(spotifyTransaction.category).toBe('Entertainment');
      expect(spotifyTransaction.subcategory).toBe('Streaming Services');

      console.log('🎉 BUG FIXED: High confidence AI transaction correctly categorized!');

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });

  it('should handle transactions that would match rules but currently have AI classifications', async () => {
    console.log('🧪 Testing rule vs AI interaction for transactions that "rules would apply"');
    
    // Create a rule that should match Spotify transactions
    await rulesService.createDescriptionContainsRule(
      'Spotify Streaming Rule',
      'spotify',
      'Entertainment',
      'Streaming Services',
      10 // High priority
    );

    console.log('Created rule for Spotify transactions');

    // Mock AI response (this should be overridden by the rule)
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    const mockAIResponse = [
      {
        categoryId: 'shopping', // Wrong category - rule should override this
        subcategoryId: 'shopping-online',
        confidence: 0.75,
        reasoning: 'Incorrectly classified as shopping'
      }
    ];

    azureOpenAIService.classifyTransactionsBatch = jest.fn()
      .mockResolvedValue(mockAIResponse);

    try {
      const csvData = [
        ['2024-01-15', 'Spotify USA', '-15.99']
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

      console.log('Processing transaction that should match a rule...');
      
      const result = await (fileProcessingService as any).processTransactions(
        csvData,
        schemaMapping,
        'test-account',
        defaultCategories,
        'test-file-id',
        jest.fn()
      );

      expect(result).toHaveLength(1);
      const transaction = result[0];

      console.log('Transaction result:');
      console.log(`  Description: "${transaction.description}"`);
      console.log(`  Category: "${transaction.category}"`);
      console.log(`  Subcategory: "${transaction.subcategory || 'none'}"`);
      console.log(`  Confidence: ${transaction.confidence}`);
      console.log(`  Reasoning: "${transaction.reasoning}"`);

      // Rule should take precedence over AI
      expect(transaction.description).toBe('Spotify USA');
      expect(transaction.category).toBe('Entertainment'); // From rule, not AI's wrong "shopping"
      expect(transaction.subcategory).toBe('Streaming Services');
      expect(transaction.confidence).toBe(1.0); // Rules have 100% confidence
      expect(transaction.reasoning).toContain('Matched rule');

      // Verify AI was not called for this transaction since rule matched
      expect(azureOpenAIService.classifyTransactionsBatch).not.toHaveBeenCalled();

      console.log('🎉 Rule correctly takes precedence over AI for matching transactions!');

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });

  it('should handle the mixed scenario: some rule-matched, some AI-classified', async () => {
    console.log('🧪 Testing mixed scenario with both rule-matched and AI-classified transactions');
    
    // Create rule for Netflix only
    await rulesService.createDescriptionContainsRule(
      'Netflix Streaming Rule',
      'Netflix',
      'Entertainment',
      'Streaming Services',
      10
    );

    // Mock AI for unmatched transactions
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    const mockAIResponses = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming',
        confidence: 0.88,
        reasoning: 'Spotify is clearly entertainment streaming'
      },
      {
        categoryId: 'shopping',
        subcategoryId: 'shopping-online', 
        confidence: 0.82,
        reasoning: 'Amazon is online shopping'
      }
    ];

    azureOpenAIService.classifyTransactionsBatch = jest.fn()
      .mockResolvedValue(mockAIResponses);

    try {
      const csvData = [
        ['2024-01-15', 'Spotify USA', '-15.99'],      // Should be AI classified
        ['2024-01-16', 'Netflix', '-12.99'],          // Should match rule
        ['2024-01-17', 'Amazon Purchase', '-25.99']   // Should be AI classified
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

      console.log('Processing mixed rule/AI scenario...');
      
      const result = await (fileProcessingService as any).processTransactions(
        csvData,
        schemaMapping,
        'test-account',
        defaultCategories,
        'test-file-id',
        jest.fn()
      );

      expect(result).toHaveLength(3);

      // Find transactions by description
      const spotify = result.find(t => t.description === 'Spotify USA');
      const netflix = result.find(t => t.description === 'Netflix');
      const amazon = result.find(t => t.description === 'Amazon Purchase');

      console.log('Results:');
      [spotify, netflix, amazon].forEach(t => {
        console.log(`  ${t!.description}: ${t!.category} (confidence: ${t!.confidence})`);
      });

      // Netflix should be rule-matched
      expect(netflix!.category).toBe('Entertainment');
      expect(netflix!.confidence).toBe(1.0);
      expect(netflix!.reasoning).toContain('Matched rule');

      // Spotify and Amazon should be AI-classified
      expect(spotify!.category).toBe('Entertainment');
      expect(spotify!.confidence).toBe(0.88);
      expect(spotify!.reasoning).toContain('streaming');

      expect(amazon!.category).toBe('Shopping');
      expect(amazon!.confidence).toBe(0.82);

      // All should be properly categorized (none should be "Uncategorized")
      result.forEach(transaction => {
        expect(transaction.category).not.toBe('Uncategorized');
        expect(transaction.confidence).toBeGreaterThan(0.8);
      });

      console.log('🎉 Mixed rule/AI scenario handled correctly!');

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });
});