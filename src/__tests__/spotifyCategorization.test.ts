import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';

describe('Spotify Categorization Issue', () => {
  it('should correctly categorize Spotify USA transactions', async () => {
    // Test the AI classification for a Spotify transaction
    const request = {
      transactionText: 'Spotify USA',
      amount: -15.99,
      date: '2024-01-15',
      availableCategories: defaultCategories
    };
    
    // Log the expected category structure
    console.log('Expected category structure for Spotify:');
    const entertainmentCategory = defaultCategories.find(c => c.id === 'entertainment');
    console.log(`  Category: ${entertainmentCategory?.id} -> ${entertainmentCategory?.name}`);
    
    const streamingSubcat = entertainmentCategory?.subcategories?.find(s => 
      s.keywords?.some(k => k.includes('spotify'))
    );
    console.log(`  Subcategory: ${streamingSubcat?.id} -> ${streamingSubcat?.name}`);
    console.log(`  Keywords: ${streamingSubcat?.keywords?.join(', ')}`);
    
    // Call AI service
    const response = await azureOpenAIService.classifyTransaction(request);
    console.log('\nAI Classification Response:');
    console.log(JSON.stringify(response, null, 2));
    
    // Test the mapping logic that would be used in fileProcessingService
    const idToNameCategory = new Map(defaultCategories.map(c => [c.id, c.name]));
    const idToNameSub = new Map<string, { name: string; parentId: string }>();
    defaultCategories.forEach(c => (c.subcategories || []).forEach(s => 
      idToNameSub.set(s.id, { name: s.name, parentId: c.id })));
    
    console.log('\nMapping test:');
    console.log(`AI categoryId: "${response.categoryId}"`);
    console.log(`Maps to name: "${idToNameCategory.get(response.categoryId)}"`);
    
    if (response.subcategoryId) {
      console.log(`AI subcategoryId: "${response.subcategoryId}"`);
      const subInfo = idToNameSub.get(response.subcategoryId);
      console.log(`Maps to subcategory: "${subInfo?.name}" (parent: ${subInfo?.parentId})`);
    }
    
    // Simulate the fileProcessingService logic
    const categoryName = idToNameCategory.get(response.categoryId) || 'Uncategorized';
    const subName = response.subcategoryId ? (idToNameSub.get(response.subcategoryId)?.name) : undefined;
    
    console.log('\nFinal result from fileProcessingService logic:');
    console.log(`Final category: ${categoryName}`);
    console.log(`Final subcategory: ${subName || 'none'}`);
    console.log(`Confidence: ${response.confidence}`);
    
    // The bug: High confidence transactions are ending up as "Uncategorized"
    // This should NOT happen for Spotify with high confidence
    if (response.confidence >= 0.8 && categoryName === 'Uncategorized') {
      console.error('❌ BUG DETECTED: High confidence transaction categorized as Uncategorized!');
      console.error(`AI returned categoryId: "${response.categoryId}"`);
      console.error(`But mapping failed, resulting in "Uncategorized"`);
      
      // Check if the issue is a mismatch in category IDs
      const validCategoryIds = new Set(defaultCategories.map(c => c.id));
      console.error(`Valid category IDs:`, Array.from(validCategoryIds));
      console.error(`AI returned ID "${response.categoryId}" is valid:`, validCategoryIds.has(response.categoryId));
    }
    
    // Test expectations based on the issue description
    expect(response.confidence).toBeGreaterThan(0.8); // Should be high confidence
    
    // This assertion might fail, demonstrating the bug
    if (response.confidence >= 0.8) {
      expect(categoryName).not.toBe('Uncategorized');
      expect(categoryName).toBe('Entertainment'); // Should map to Entertainment
    }
  });
  
  it('should verify category ID mapping consistency', () => {
    // Test that all category IDs in defaultCategories are consistent
    const categoryIds = defaultCategories.map(c => c.id);
    const subcategoryIds = defaultCategories.flatMap(c => (c.subcategories || []).map(s => s.id));
    
    console.log('All category IDs:', categoryIds);
    console.log('Entertainment subcategory IDs:', 
      defaultCategories
        .find(c => c.id === 'entertainment')
        ?.subcategories?.map(s => s.id)
    );
    
    // Verify entertainment category exists
    const entertainment = defaultCategories.find(c => c.id === 'entertainment');
    expect(entertainment).toBeDefined();
    expect(entertainment?.name).toBe('Entertainment');
    
    // Verify streaming subcategory exists
    const streaming = entertainment?.subcategories?.find(s => s.id === 'entertainment-streaming');
    expect(streaming).toBeDefined();
    expect(streaming?.name).toBe('Streaming Services');
    expect(streaming?.keywords).toContain('spotify');
  });
});