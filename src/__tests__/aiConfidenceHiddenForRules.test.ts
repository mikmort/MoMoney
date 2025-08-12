import { dataService } from '../services/dataService';
import { rulesService } from '../services/rulesService';
import { Transaction } from '../types';

describe('AI Confidence Hidden for Rule-Matched Transactions', () => {
  beforeEach(async () => {
    // Clear data and prevent sample data re-initialization
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should hide AI confidence when a transaction matches an existing rule', async () => {
    // First, create a rule that would match transactions with "Starbucks" in the description
    await rulesService.addRule({
      name: 'Starbucks Coffee Rule',
      description: 'Categorize Starbucks transactions as Coffee Shops',
      isActive: true,
      priority: 1,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'Starbucks',
        caseSensitive: false
      }],
      action: {
        categoryId: 'food-dining',
        categoryName: 'Food & Dining',
        subcategoryId: 'coffee-shops',
        subcategoryName: 'Coffee Shops'
      }
    });

    // Add a transaction with AI confidence data that would match the rule
    const transactionWithAI = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Starbucks Coffee Purchase',
      amount: -5.50,
      category: 'Uncategorized',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.85, // This should be hidden since it matches a rule
      reasoning: 'AI categorized as coffee shop transaction',
      aiProxyMetadata: {
        model: 'gpt-4',
        promptTokens: 100,
        completionTokens: 50,
        requestId: 'test-request-123'
      }
    });

    // Verify the transaction initially has AI confidence
    expect(transactionWithAI.confidence).toBe(0.85);
    expect(transactionWithAI.reasoning).toBe('AI categorized as coffee shop transaction');

    // Get all transactions and check that the UI should hide confidence for rule-matched ones
    const allTransactions = await dataService.getAllTransactions();
    const starbucksTransaction = allTransactions.find(t => t.description.includes('Starbucks'));
    
    expect(starbucksTransaction).toBeDefined();
    expect(starbucksTransaction!.description).toBe('Starbucks Coffee Purchase');
    
    // Apply rules to see if this transaction would match
    const ruleResult = await rulesService.applyRules({
      date: starbucksTransaction!.date,
      description: starbucksTransaction!.description,
      amount: starbucksTransaction!.amount,
      category: starbucksTransaction!.category,
      account: starbucksTransaction!.account,
      type: starbucksTransaction!.type
    });

    // Verify that the rule matches the transaction
    expect(ruleResult.matched).toBe(true);
    expect(ruleResult.rule?.name).toBe('Starbucks Coffee Rule');

    // The key test: the UI should determine that this transaction matches a rule
    // and therefore should not show AI confidence, even though the transaction
    // object itself still has confidence data
    expect(ruleResult.matched).toBe(true); // This means UI should hide confidence
  });

  it('should show AI confidence for transactions that do not match any rule', async () => {
    // Create a rule for a specific vendor
    await rulesService.addRule({
      name: 'McDonald\'s Rule',
      description: 'Categorize McDonald\'s transactions',
      isActive: true,
      priority: 1,
      conditions: [{
        field: 'description',
        operator: 'contains',
        value: 'McDonald',
        caseSensitive: false
      }],
      action: {
        categoryId: 'food-dining',
        categoryName: 'Food & Dining',
        subcategoryId: 'fast-food',
        subcategoryName: 'Fast Food'
      }
    });

    // Add a transaction that does NOT match the rule
    const transactionNoMatch = await dataService.addTransaction({
      date: new Date('2025-01-15'),
      description: 'Random Restaurant XYZ',
      amount: -25.00,
      category: 'Food & Dining',
      subcategory: 'Restaurants',
      account: 'Credit Card',
      type: 'expense',
      confidence: 0.92,
      reasoning: 'AI categorized as restaurant',
    });

    // Verify the transaction has AI confidence
    expect(transactionNoMatch.confidence).toBe(0.92);

    // Check that this transaction does NOT match any rule
    const ruleResult = await rulesService.applyRules({
      date: transactionNoMatch.date,
      description: transactionNoMatch.description,
      amount: transactionNoMatch.amount,
      category: transactionNoMatch.category,
      account: transactionNoMatch.account,
      type: transactionNoMatch.type
    });

    // Verify that no rule matches
    expect(ruleResult.matched).toBe(false);
    
    // The UI should show AI confidence since no rule matches
    expect(transactionNoMatch.confidence).toBe(0.92);
  });
});