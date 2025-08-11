// Test script to reproduce the Spotify categorization issue
const { azureOpenAIService } = require('./src/services/azureOpenAIService');
const { defaultCategories } = require('./src/data/defaultCategories');

async function testSpotifyCategorization() {
  console.log('Testing Spotify categorization issue...');
  
  try {
    const request = {
      transactionText: 'Spotify USA',
      amount: -15.99,
      date: '2024-01-15',
      availableCategories: defaultCategories
    };
    
    console.log('Categories available to AI:');
    defaultCategories.forEach(cat => {
      console.log(`  - ${cat.id}: ${cat.name}`);
      if (cat.subcategories) {
        cat.subcategories.forEach(sub => {
          if (sub.keywords && sub.keywords.some(k => k.includes('spotify'))) {
            console.log(`    * ${sub.id}: ${sub.name} (keywords: ${sub.keywords.join(', ')})`);
          }
        });
      }
    });
    
    const response = await azureOpenAIService.classifyTransaction(request);
    console.log('\nAI Classification Response:');
    console.log(JSON.stringify(response, null, 2));
    
    // Test the mapping logic
    const idToNameCategory = new Map(defaultCategories.map(c => [c.id, c.name]));
    const idToNameSub = new Map();
    defaultCategories.forEach(c => (c.subcategories || []).forEach(s => idToNameSub.set(s.id, { name: s.name, parentId: c.id })));
    
    console.log('\nCategory mapping test:');
    console.log(`AI returned categoryId: "${response.categoryId}"`);
    console.log(`Mapped to name: "${idToNameCategory.get(response.categoryId)}"`);
    if (response.subcategoryId) {
      console.log(`AI returned subcategoryId: "${response.subcategoryId}"`);
      const subInfo = idToNameSub.get(response.subcategoryId);
      console.log(`Mapped to subcategory: "${subInfo?.name}" (parent: ${subInfo?.parentId})`);
    }
    
    // Final categorization logic
    const categoryName = idToNameCategory.get(response.categoryId) || 'Uncategorized';
    const subName = response.subcategoryId ? (idToNameSub.get(response.subcategoryId)?.name) : undefined;
    
    console.log('\nFinal categorization result:');
    console.log(`Category: ${categoryName}`);
    console.log(`Subcategory: ${subName || 'none'}`);
    console.log(`Confidence: ${response.confidence}`);
    
  } catch (error) {
    console.error('Error testing Spotify categorization:', error);
  }
}

testSpotifyCategorization();