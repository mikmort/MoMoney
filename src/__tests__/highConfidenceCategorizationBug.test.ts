import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';

describe('High Confidence AI Categorization Bug', () => {
  beforeEach(async () => {
    // Clear any existing rules to ensure clean test state
    await rulesService.clearAllRules();
  });

  it('should reproduce the bug where high confidence AI results become uncategorized', async () => {
    // Mock the Azure OpenAI service to return high confidence results like a real AI would
    const originalClassifyTransaction = azureOpenAIService.classifyTransaction;
    
    // Mock a high confidence Spotify classification
    const mockHighConfidenceResponse = {
      categoryId: 'entertainment',
      subcategoryId: 'entertainment-streaming',
      confidence: 0.95,
      reasoning: 'Spotify is clearly an entertainment streaming service',
    };
    
    azureOpenAIService.classifyTransaction = jest.fn().mockResolvedValue(mockHighConfidenceResponse);
    
    try {
      // Simulate the exact transaction structure used in fileProcessingService
      const baseTransaction = {
        date: new Date('2024-01-15'),
        description: 'Spotify USA',
        amount: -15.99,
        notes: '',
        category: 'Uncategorized', // Initial state
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Spotify USA'
      };

      // Step 1: Check if rules would apply (they shouldn't for this test)
      const ruleResult = await rulesService.applyRules(baseTransaction);
      console.log('Rule application result:', ruleResult);
      
      expect(ruleResult.matched).toBe(false); // No rules should match initially

      // Step 2: Simulate the AI classification process from fileProcessingService
      const aiRequest = {
        transactionText: baseTransaction.description,
        amount: baseTransaction.amount,
        date: baseTransaction.date.toISOString(),
        availableCategories: defaultCategories
      };

      const aiResponse = await azureOpenAIService.classifyTransaction(aiRequest);
      console.log('AI Classification Response:', aiResponse);

      // Step 3: Simulate the category mapping logic from fileProcessingService (lines 1138-1175)
      const idToNameCategory = new Map(defaultCategories.map(c => [c.id, c.name]));
      const idToNameSub = new Map<string, { name: string; parentId: string }>();
      defaultCategories.forEach(c => (c.subcategories || []).forEach(s => 
        idToNameSub.set(s.id, { name: s.name, parentId: c.id })));

      console.log('Category mapping setup:');
      console.log('Available category IDs:', Array.from(idToNameCategory.keys()));
      console.log('AI returned categoryId:', aiResponse.categoryId);
      console.log('AI returned subcategoryId:', aiResponse.subcategoryId);

      // Step 4: Apply the exact logic from fileProcessingService lines 1174-1175
      const categoryName = idToNameCategory.get(aiResponse.categoryId) || 'Uncategorized';
      const subName = aiResponse.subcategoryId ? (idToNameSub.get(aiResponse.subcategoryId)?.name) : undefined;

      console.log('Mapping results:');
      console.log('Final categoryName:', categoryName);
      console.log('Final subName:', subName);

      // The bug: This should NOT be 'Uncategorized' for high confidence AI results
      expect(aiResponse.confidence).toBeGreaterThan(0.8); // High confidence
      expect(categoryName).not.toBe('Uncategorized'); // Should not fallback to uncategorized
      expect(categoryName).toBe('Entertainment'); // Should map correctly
      expect(subName).toBe('Streaming Services'); // Should map subcategory correctly
      
    } finally {
      // Restore original method
      azureOpenAIService.classifyTransaction = originalClassifyTransaction;
    }
  });

  it('should test the category validation logic in getAIClassification method', async () => {
    // This tests the logic in fileProcessingService.getAIClassification (lines 1448-1500)
    const mockResponse = {
      categoryId: 'entertainment',
      subcategoryId: 'entertainment-streaming', 
      confidence: 0.95,
      reasoning: 'Spotify streaming service'
    };

    const originalClassifyTransaction = azureOpenAIService.classifyTransaction;
    azureOpenAIService.classifyTransaction = jest.fn().mockResolvedValue(mockResponse);

    try {
      // Call the same method that fileProcessingService uses
      const categories = defaultCategories;
      const subcategories = defaultCategories.flatMap(c => c.subcategories || []);
      
      // This mirrors the getAIClassification method
      const response = await azureOpenAIService.classifyTransaction({
        transactionText: 'Spotify USA',
        amount: -15.99,
        date: '2024-01-15',
        availableCategories: categories
      });

      // Validate and constrain to provided categories/subcategories (from lines 1455-1489)
      const categoryIds = new Set(categories.map(c => c.id));
      const subcategoryById = new Map<string, { sub: any; parentId: string }>();
      categories.forEach(c => {
        (c.subcategories || []).forEach(s => {
          subcategoryById.set(s.id, { sub: s, parentId: c.id });
        });
      });

      let validCategoryId = response.categoryId;
      let validSubcategoryId = response.subcategoryId;

      console.log('Category validation:');
      console.log('Available category IDs:', Array.from(categoryIds));
      console.log('Response categoryId:', validCategoryId);
      console.log('Category ID is valid:', categoryIds.has(validCategoryId));

      // If AI returned a name instead of id accidentally (lines 1468-1471)
      const lowerToIdCategory = new Map<string, string>(categories.map(c => [c.name.toLowerCase(), c.id]));
      if (!categoryIds.has(validCategoryId) && lowerToIdCategory.has(String(validCategoryId).toLowerCase())) {
        validCategoryId = lowerToIdCategory.get(String(validCategoryId).toLowerCase())!;
      }

      // Validate categoryId; fallback to 'Uncategorized' if not recognized (lines 1473-1477)
      if (!categoryIds.has(validCategoryId)) {
        console.log('❌ Category ID validation failed, falling back to Uncategorized');
        validCategoryId = 'Uncategorized';
        validSubcategoryId = undefined;
      }

      console.log('Final validated categoryId:', validCategoryId);
      console.log('Final validated subcategoryId:', validSubcategoryId);

      // This should NOT fail for a valid entertainment category
      expect(validCategoryId).not.toBe('Uncategorized');
      expect(validCategoryId).toBe('entertainment');
      
    } finally {
      azureOpenAIService.classifyTransaction = originalClassifyTransaction;
    }
  });
});