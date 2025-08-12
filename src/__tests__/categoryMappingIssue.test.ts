import { defaultCategories } from '../data/defaultCategories';

describe('Category Mapping Issue Reproduction', () => {
  it('should verify category mapping consistency for entertainment', () => {
    // Test the exact mapping logic from fileProcessingService.ts lines 1138-1175
    const idToNameCategory = new Map(defaultCategories.map(c => [c.id, c.name]));
    const idToNameSub = new Map<string, { name: string; parentId: string }>();
    defaultCategories.forEach(c => (c.subcategories || []).forEach(s => 
      idToNameSub.set(s.id, { name: s.name, parentId: c.id })));

    console.log('🔍 Testing category mapping for entertainment...');
    
    // Test entertainment category exists
    const entertainmentExists = idToNameCategory.has('entertainment');
    console.log(`Entertainment category exists: ${entertainmentExists}`);
    
    if (entertainmentExists) {
      console.log(`Entertainment maps to: "${idToNameCategory.get('entertainment')}"`);
    }

    // Test streaming subcategory exists  
    const streamingExists = idToNameSub.has('entertainment-streaming');
    console.log(`Streaming subcategory exists: ${streamingExists}`);
    
    if (streamingExists) {
      const subInfo = idToNameSub.get('entertainment-streaming');
      console.log(`Streaming subcategory maps to: "${subInfo?.name}" (parent: ${subInfo?.parentId})`);
    }

    // Simulate AI response that should work
    const mockAIResponse = {
      categoryId: 'entertainment',
      subcategoryId: 'entertainment-streaming',
      confidence: 0.87
    };

    console.log('\n🤖 Simulating AI response:', mockAIResponse);

    // Apply the exact mapping logic from fileProcessingService
    const categoryName = idToNameCategory.get(mockAIResponse.categoryId) || 'Uncategorized';
    const subName = mockAIResponse.subcategoryId ? (idToNameSub.get(mockAIResponse.subcategoryId)?.name) : undefined;

    console.log('\n📊 Mapping results:');
    console.log(`  categoryName: "${categoryName}"`);
    console.log(`  subName: "${subName || 'none'}"`);

    // These should pass - if they fail, we found the mapping issue
    expect(categoryName).not.toBe('Uncategorized');
    expect(categoryName).toBe('Entertainment');
    expect(subName).toBe('Streaming Services');
  });

  it('should test the constrain-to-catalog logic from azureOpenAIService', () => {
    // This tests the constrainToCatalog method logic
    const categories = defaultCategories;
    
    console.log('🔍 Testing constrainToCatalog logic...');

    // Test the logic from azureOpenAIService.ts lines 234-265
    const categoryIds = new Set(categories.map(c => c.id));
    const nameToIdCategory = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

    console.log('Available category IDs:', Array.from(categoryIds));

    // Test 1: AI returns correct ID (should work)
    let result = {
      categoryId: 'entertainment',
      subcategoryId: 'entertainment-streaming',
      confidence: 0.87,
      reasoning: 'Test'
    };

    console.log('\n🤖 Test 1 - AI returns correct ID:', result);

    let categoryId = result.categoryId;
    if (!categoryIds.has(categoryId)) {
      const mapped = nameToIdCategory.get(String(categoryId).toLowerCase());
      categoryId = mapped || 'uncategorized';
      console.log(`❌ Category ID mapping failed, using: ${categoryId}`);
    } else {
      console.log(`✅ Category ID is valid: ${categoryId}`);
    }

    expect(categoryId).toBe('entertainment');

    // Test 2: AI returns name instead of ID (edge case)
    result = {
      categoryId: 'Entertainment', // Name instead of ID
      subcategoryId: 'entertainment-streaming',
      confidence: 0.87,
      reasoning: 'Test'
    };

    console.log('\n🤖 Test 2 - AI returns category name instead of ID:', result);

    categoryId = result.categoryId;
    if (!categoryIds.has(categoryId)) {
      const mapped = nameToIdCategory.get(String(categoryId).toLowerCase());
      categoryId = mapped || 'uncategorized';
      console.log(`🔧 Mapped category name to ID: "${result.categoryId}" -> "${categoryId}"`);
    }

    expect(categoryId).toBe('entertainment');

    // Test 3: AI returns invalid/unknown category
    result = {
      categoryId: 'invalid-category',
      subcategoryId: 'entertainment-streaming',
      confidence: 0.87,
      reasoning: 'Test'
    };

    console.log('\n🤖 Test 3 - AI returns invalid category:', result);

    categoryId = result.categoryId;
    if (!categoryIds.has(categoryId)) {
      const mapped = nameToIdCategory.get(String(categoryId).toLowerCase());
      categoryId = mapped || 'uncategorized';
      console.log(`❌ Invalid category, falling back to: ${categoryId}`);
    }

    expect(categoryId).toBe('uncategorized');
  });

  it('should identify discrepancies between category structures', () => {
    console.log('🔍 Analyzing category structure for potential issues...');
    
    // Check for duplicate category IDs
    const categoryIds = defaultCategories.map(c => c.id);
    const uniqueIds = [...new Set(categoryIds)];
    
    if (categoryIds.length !== uniqueIds.length) {
      console.log('❌ DUPLICATE CATEGORY IDS DETECTED!');
      console.log('All IDs:', categoryIds);
      console.log('Unique IDs:', uniqueIds);
    } else {
      console.log('✅ No duplicate category IDs found');
    }

    // Check for case sensitivity issues
    const lowerCaseIds = categoryIds.map(id => id.toLowerCase());
    const uniqueLowerIds = [...new Set(lowerCaseIds)];
    
    if (lowerCaseIds.length !== uniqueLowerIds.length) {
      console.log('❌ CASE SENSITIVITY ISSUES DETECTED!');
      console.log('Original IDs:', categoryIds);
      console.log('Lowercase IDs:', lowerCaseIds);
    } else {
      console.log('✅ No case sensitivity issues found');
    }

    // Check entertainment category specifically
    const entertainment = defaultCategories.find(c => c.id === 'entertainment');
    console.log('\n📱 Entertainment category details:');
    console.log(`  ID: "${entertainment?.id}"`);
    console.log(`  Name: "${entertainment?.name}"`);
    console.log(`  Subcategories: ${entertainment?.subcategories?.length || 0}`);
    
    if (entertainment?.subcategories) {
      entertainment.subcategories.forEach(sub => {
        console.log(`    - ${sub.id}: ${sub.name} (keywords: ${sub.keywords?.join(', ') || 'none'})`);
      });
    }

    expect(entertainment).toBeDefined();
    expect(entertainment?.name).toBe('Entertainment');
  });
});