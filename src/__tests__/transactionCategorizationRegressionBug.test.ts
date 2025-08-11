import { FileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';
import { accountManagementService } from '../services/accountManagementService';

describe('Transaction Categorization Regression Bug', () => {
  let fileProcessingService: FileProcessingService;

  beforeEach(async () => {
    fileProcessingService = new FileProcessingService();
    
    // Clear rules to ensure clean test state
    await rulesService.clearAllRules();

    // Add a test account for processing
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

  it('should reproduce the bug where high-confidence AI classifications become uncategorized', async () => {
    // Mock the Azure OpenAI service to return consistent high confidence results
    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    
    // Mock AI to return high confidence entertainment classification for Spotify
    const mockBatchResponse = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming', 
        confidence: 0.87, // High confidence but not 95%
        reasoning: 'Spotify is a music streaming service, clearly entertainment'
      }
    ];

    azureOpenAIService.classifyTransactionsBatch = jest.fn().mockResolvedValue(mockBatchResponse);

    try {
      // Create a set of parsed transactions like those from file import
      const parsedTransactions = [
        {
          date: new Date('2024-01-15'),
          description: 'Spotify USA',
          amount: -15.99,
          notes: '',
          // These fields will be set during processing
        }
      ];

      console.log('🧪 Testing transaction processing with high-confidence AI mock...');
      console.log('Input transaction:', parsedTransactions[0]);

      // Call the processTransactions method that contains the bug
      const result = await (fileProcessingService as any).processTransactions(
        parsedTransactions,
        'test-checking',
        defaultCategories,
        'test-file-id',
        jest.fn() // onProgress callback
      );

      console.log('🔍 Processing result:');
      console.log(`Processed ${result.length} transactions`);
      
      if (result.length > 0) {
        const transaction = result[0];
        console.log('Final transaction result:');
        console.log(`  Description: "${transaction.description}"`);
        console.log(`  Category: "${transaction.category}"`);
        console.log(`  Subcategory: "${transaction.subcategory || 'none'}"`);
        console.log(`  Confidence: ${transaction.confidence}`);
        console.log(`  Reasoning: "${transaction.reasoning || 'none'}"`);

        // The bug: High confidence AI results should NOT become "Uncategorized"
        expect(transaction.confidence).toBeGreaterThan(0.8);
        
        // This is the actual bug - the assertion below will likely fail
        if (transaction.confidence > 0.8) {
          console.log('❌ BUG DETECTED: High confidence AI result became uncategorized!');
          console.log('Expected: Entertainment, Actual:', transaction.category);
          
          // This assertion demonstrates the bug
          expect(transaction.category).not.toBe('Uncategorized');
          expect(transaction.category).toBe('Entertainment');
        }
      }

    } finally {
      // Restore original method
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });

  it('should test the specific mapping bug in AI result processing', async () => {
    // Test the exact scenario where category ID mapping fails
    
    // Mock high confidence response
    const mockResponse = {
      categoryId: 'entertainment',
      subcategoryId: 'entertainment-streaming',
      confidence: 0.87,
      reasoning: 'Clear entertainment streaming service'
    };

    const originalClassifyTransactionsBatch = azureOpenAIService.classifyTransactionsBatch;
    azureOpenAIService.classifyTransactionsBatch = jest.fn().mockResolvedValue([mockResponse]);

    try {
      // Create the mapping structures exactly as used in fileProcessingService
      const idToNameCategory = new Map(defaultCategories.map(c => [c.id, c.name]));
      const idToNameSub = new Map<string, { name: string; parentId: string }>();
      defaultCategories.forEach(c => (c.subcategories || []).forEach(s => 
        idToNameSub.set(s.id, { name: s.name, parentId: c.id })));

      console.log('🔍 Testing category ID mapping logic...');
      console.log('Mock AI response:', mockResponse);
      console.log('Available category IDs:', Array.from(idToNameCategory.keys()));
      console.log(`Category ID "${mockResponse.categoryId}" exists:`, idToNameCategory.has(mockResponse.categoryId));

      // Simulate the exact mapping logic from fileProcessingService lines 1174-1175
      const categoryName = idToNameCategory.get(mockResponse.categoryId) || 'Uncategorized';
      const subName = mockResponse.subcategoryId ? (idToNameSub.get(mockResponse.subcategoryId)?.name) : undefined;

      console.log('Mapping results:');
      console.log(`  categoryName: "${categoryName}"`);
      console.log(`  subName: "${subName || 'none'}"`);

      // These should pass if the mapping is working correctly
      expect(categoryName).not.toBe('Uncategorized');
      expect(categoryName).toBe('Entertainment');
      expect(subName).toBe('Streaming Services');

      // Now test the full transaction processing to see where it might break
      const parsedTransactions = [
        {
          date: new Date('2024-01-15'),
          description: 'Spotify USA',
          amount: -15.99,
          notes: '',
        }
      ];

      const result = await (fileProcessingService as any).processTransactions(
        parsedTransactions,
        'test-checking',
        defaultCategories,
        'test-file-id',
        jest.fn()
      );

      if (result.length > 0) {
        const transaction = result[0];
        console.log('🎯 Final transaction result from processTransactions:');
        console.log(`  Final category: "${transaction.category}"`);
        console.log(`  Final subcategory: "${transaction.subcategory || 'none'}"`);
        console.log(`  Final confidence: ${transaction.confidence}`);

        // Compare mapping test vs full processing result
        if (categoryName !== transaction.category) {
          console.log('❌ MAPPING DISCREPANCY DETECTED!');
          console.log(`Mapping test result: "${categoryName}"`);
          console.log(`Full processing result: "${transaction.category}"`);
          console.log('This indicates a bug in the full processing pipeline!');
        }
      }

    } finally {
      azureOpenAIService.classifyTransactionsBatch = originalClassifyTransactionsBatch;
    }
  });

  it('should test the requiresHigherConfidence logic for non-ACH transactions', () => {
    // Test that normal transactions like Spotify don't trigger higher confidence requirements
    const method = (fileProcessingService as any).requiresHigherConfidence;
    
    console.log('🧪 Testing requiresHigherConfidence logic...');
    
    // These should NOT require higher confidence
    expect(method('Spotify USA')).toBe(false);
    expect(method('Netflix')).toBe(false);
    expect(method('Amazon')).toBe(false);
    expect(method('Grocery Store')).toBe(false);
    
    // These SHOULD require higher confidence (ACH/withdrawal patterns)
    expect(method('ACH DEBIT SPOTIFY USA')).toBe(true);
    expect(method('WITHDRAWAL TRANSFER')).toBe(true);
    expect(method('ACH DEBIT')).toBe(true);
    
    // These should NOT (excluded withdrawal types)
    expect(method('ATM WITHDRAWAL')).toBe(false);
    expect(method('CASH WITHDRAWAL')).toBe(false);
    
    console.log('✅ requiresHigherConfidence logic is working correctly');
  });
});