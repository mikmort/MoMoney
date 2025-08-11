import { dataService } from '../services/dataService';
import { rulesService } from '../services/rulesService';

describe('AI Confidence Removal - End-to-End Integration', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should demonstrate the complete AI confidence removal workflow', async () => {
    // Step 1: Create a transaction with AI confidence (simulating AI categorization)
    console.log('Step 1: Adding transaction with AI confidence...');
    const aiTransaction = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Starbucks Coffee Shop',
      amount: -5.50,
      category: 'Food & Dining', 
      subcategory: 'Coffee Shops',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.92,
      reasoning: 'AI categorized based on merchant name pattern matching',
      aiProxyMetadata: {
        model: 'gpt-4',
        promptTokens: 150,
        completionTokens: 75,
        requestId: 'ai-request-123'
      }
    });

    console.log('✅ Transaction created with AI confidence:', {
      id: aiTransaction.id,
      confidence: aiTransaction.confidence,
      reasoning: aiTransaction.reasoning,
      hasAiMetadata: !!aiTransaction.aiProxyMetadata
    });

    // Verify AI confidence is present
    expect(aiTransaction.confidence).toBe(0.92);
    expect(aiTransaction.reasoning).toBe('AI categorized based on merchant name pattern matching');
    expect(aiTransaction.aiProxyMetadata).toBeDefined();

    // Step 2: User manually changes the category - should clear AI confidence
    console.log('Step 2: User manually changes category...');
    const manualUpdate = await dataService.updateTransaction(aiTransaction.id, {
      category: 'Transportation',
      subcategory: 'Gas & Fuel' // User corrects the wrong AI categorization
    });

    console.log('✅ After manual category change:', {
      id: manualUpdate?.id,
      newCategory: manualUpdate?.category,
      newSubcategory: manualUpdate?.subcategory,
      confidence: manualUpdate?.confidence,
      reasoning: manualUpdate?.reasoning,
      hasAiMetadata: !!manualUpdate?.aiProxyMetadata
    });

    // Verify AI confidence is removed
    expect(manualUpdate?.confidence).toBeUndefined();
    expect(manualUpdate?.reasoning).toBeUndefined();
    expect(manualUpdate?.aiProxyMetadata).toBeUndefined();
    expect(manualUpdate?.category).toBe('Transportation');
    expect(manualUpdate?.subcategory).toBe('Gas & Fuel');

    // Step 3: Create a rule and test rule-based categorization
    console.log('Step 3: Creating categorization rule...');
    const rule = await rulesService.addRule({
      name: 'Gas Station Auto-Category',
      description: 'Automatically categorize gas station purchases',
      isActive: true,
      priority: 1,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'Shell',
        caseSensitive: false
      }],
      action: {
        categoryId: 'transportation',
        categoryName: 'Transportation',
        subcategoryId: 'gas-fuel', 
        subcategoryName: 'Gas & Fuel'
      }
    });

    console.log('✅ Rule created:', rule.name);

    // Step 4: Apply rules to a transaction - should NOT set AI confidence
    console.log('Step 4: Applying rule to new transaction...');
    const ruleTestTransaction = {
      date: new Date('2025-01-16'),
      description: 'Shell Gas Station Purchase',
      amount: -45.00,
      category: 'Uncategorized',
      account: 'Credit Card', 
      type: 'expense' as const
    };

    const ruleResult = await rulesService.applyRulesToBatch([ruleTestTransaction]);
    
    expect(ruleResult.matchedTransactions).toHaveLength(1);
    const ruleMatchedTx = ruleResult.matchedTransactions[0].transaction;

    console.log('✅ Rule applied to transaction:', {
      matched: true,
      ruleName: ruleResult.matchedTransactions[0].rule.name,
      newCategory: ruleMatchedTx.category,
      newSubcategory: ruleMatchedTx.subcategory,
      confidence: ruleMatchedTx.confidence,
      reasoning: ruleMatchedTx.reasoning,
      hasAiMetadata: !!ruleMatchedTx.aiProxyMetadata
    });

    // Verify rule-matched transaction has no AI confidence
    expect(ruleMatchedTx.confidence).toBeUndefined();
    expect(ruleMatchedTx.reasoning).toBeUndefined(); 
    expect(ruleMatchedTx.aiProxyMetadata).toBeUndefined();
    expect(ruleMatchedTx.category).toBe('Transportation');
    expect(ruleMatchedTx.subcategory).toBe('Gas & Fuel');

    // Step 5: Verify that non-category updates preserve AI confidence
    console.log('Step 5: Testing non-category updates...');
    const preserveAiTransaction = await dataService.addTransaction({
      date: new Date('2025-01-17'),
      description: 'Amazon Purchase',
      amount: -25.99,
      category: 'Shopping',
      subcategory: 'Online Shopping',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.88,
      reasoning: 'AI detected online shopping pattern'
    });

    // Update description and amount but not category
    const nonCategoryUpdate = await dataService.updateTransaction(preserveAiTransaction.id, {
      description: 'Amazon Prime Purchase - Updated',
      amount: -29.99,
      notes: 'Added shipping cost'
    });

    console.log('✅ After non-category update:', {
      id: nonCategoryUpdate?.id,
      newDescription: nonCategoryUpdate?.description,
      newAmount: nonCategoryUpdate?.amount,
      category: nonCategoryUpdate?.category, // unchanged
      confidence: nonCategoryUpdate?.confidence, // should be preserved
      reasoning: nonCategoryUpdate?.reasoning // should be preserved
    });

    // Verify AI confidence is preserved for non-category changes
    expect(nonCategoryUpdate?.confidence).toBe(0.88);
    expect(nonCategoryUpdate?.reasoning).toBe('AI detected online shopping pattern');
    expect(nonCategoryUpdate?.category).toBe('Shopping'); // unchanged
    expect(nonCategoryUpdate?.description).toBe('Amazon Prime Purchase - Updated');

    console.log('🎉 Complete workflow test passed! AI confidence behavior working correctly.');
  });

  it('should handle edge case where user changes category to the same value', async () => {
    // Add transaction with AI confidence
    const transaction = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Coffee Purchase',
      amount: -4.50,
      category: 'Food & Dining',
      subcategory: 'Coffee Shops',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.95,
      reasoning: 'High confidence AI categorization'
    });

    // Update to the same category (no real change)
    const sameUpdate = await dataService.updateTransaction(transaction.id, {
      category: 'Food & Dining',
      subcategory: 'Coffee Shops'  // Same values
    });

    // Should still preserve AI confidence since no real change occurred
    expect(sameUpdate?.confidence).toBe(0.95);
    expect(sameUpdate?.reasoning).toBe('High confidence AI categorization');
  });

  it('should clear AI confidence even for partial category changes', async () => {
    // Add transaction with AI confidence
    const transaction = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Restaurant Bill',
      amount: -32.50,
      category: 'Food & Dining',
      subcategory: 'Fast Food',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.87,
      reasoning: 'AI categorized as fast food'
    });

    // Change only the subcategory
    const subcatUpdate = await dataService.updateTransaction(transaction.id, {
      subcategory: 'Restaurants' // Only subcategory changes
    });

    // Should clear AI confidence even for subcategory-only change
    expect(subcatUpdate?.confidence).toBeUndefined();
    expect(subcatUpdate?.reasoning).toBeUndefined();
    expect(subcatUpdate?.category).toBe('Food & Dining'); // unchanged
    expect(subcatUpdate?.subcategory).toBe('Restaurants'); // changed
  });
});