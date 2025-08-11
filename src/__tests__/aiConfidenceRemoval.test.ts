import { dataService } from '../services/dataService';
import { rulesService } from '../services/rulesService';
import { Transaction } from '../types';

describe('AI Confidence Removal', () => {
  beforeEach(async () => {
    // Clear data and prevent sample data re-initialization
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  describe('Manual Category Changes', () => {
    it('should remove AI confidence when user manually changes category', async () => {
      // Add a transaction with AI confidence data
      const addedTransaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Coffee Shop Purchase',
        amount: -5.50,
        category: 'Uncategorized',
        account: 'Credit Card',
        type: 'expense',
        confidence: 0.85,
        reasoning: 'AI categorized as coffee shop transaction',
        aiProxyMetadata: {
          model: 'gpt-4',
          promptTokens: 100,
          completionTokens: 50,
          requestId: 'test-request-123'
        }
      });

      expect(addedTransaction.confidence).toBe(0.85);
      expect(addedTransaction.reasoning).toBe('AI categorized as coffee shop transaction');
      expect(addedTransaction.aiProxyMetadata).toBeDefined();

      // User manually changes the category
      const updatedTransaction = await dataService.updateTransaction(
        addedTransaction.id,
        {
          category: 'Food & Dining',
          subcategory: 'Coffee Shops'
        }
      );

      // AI confidence should be removed
      expect(updatedTransaction?.confidence).toBeUndefined();
      expect(updatedTransaction?.reasoning).toBeUndefined();
      expect(updatedTransaction?.aiProxyMetadata).toBeUndefined();
      expect(updatedTransaction?.category).toBe('Food & Dining');
      expect(updatedTransaction?.subcategory).toBe('Coffee Shops');
    });

    it('should remove AI confidence when user changes only subcategory', async () => {
      // Add a transaction with AI confidence data
      const addedTransaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Restaurant Bill',
        amount: -25.00,
        category: 'Food & Dining',
        subcategory: 'Fast Food',
        account: 'Credit Card',
        type: 'expense',
        confidence: 0.92,
        reasoning: 'AI categorized as fast food'
      });

      // User manually changes subcategory
      const updatedTransaction = await dataService.updateTransaction(
        addedTransaction.id,
        {
          subcategory: 'Restaurants'
        }
      );

      // AI confidence should be removed
      expect(updatedTransaction?.confidence).toBeUndefined();
      expect(updatedTransaction?.reasoning).toBeUndefined();
      expect(updatedTransaction?.category).toBe('Food & Dining');
      expect(updatedTransaction?.subcategory).toBe('Restaurants');
    });

    it('should NOT remove AI confidence when user changes non-category fields', async () => {
      // Add a transaction with AI confidence data
      const addedTransaction = await dataService.addTransaction({
        date: new Date('2025-01-15'),
        description: 'Coffee Shop Purchase',
        amount: -5.50,
        category: 'Food & Dining',
        subcategory: 'Coffee Shops',
        account: 'Credit Card',
        type: 'expense',
        confidence: 0.85,
        reasoning: 'AI categorized as coffee shop transaction'
      });

      // User changes description but not category
      const updatedTransaction = await dataService.updateTransaction(
        addedTransaction.id,
        {
          description: 'Updated Coffee Shop Purchase',
          amount: -6.00
        }
      );

      // AI confidence should remain
      expect(updatedTransaction?.confidence).toBe(0.85);
      expect(updatedTransaction?.reasoning).toBe('AI categorized as coffee shop transaction');
      expect(updatedTransaction?.description).toBe('Updated Coffee Shop Purchase');
      expect(updatedTransaction?.amount).toBe(-6.00);
    });
  });

  describe('Rule-based Category Assignment', () => {
    it('should not set AI confidence for rule-matched transactions', async () => {
      // Create a test rule
      await rulesService.addRule({
        name: 'Coffee Shop Rule',
        description: 'Categorize coffee shop transactions',
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

      // Apply rules to a transaction
      const testTransaction = {
        date: new Date('2025-01-15'),
        description: 'Starbucks Coffee Purchase',
        amount: -5.50,
        category: 'Uncategorized',
        account: 'Credit Card',
        type: 'expense' as const
      };

      const ruleResult = await rulesService.applyRules(testTransaction);

      expect(ruleResult.matched).toBe(true);
      expect(ruleResult.rule?.name).toBe('Coffee Shop Rule');

      // Apply rules to batch to see the result
      const batchResult = await rulesService.applyRulesToBatch([testTransaction]);
      
      expect(batchResult.matchedTransactions).toHaveLength(1);
      const matchedTx = batchResult.matchedTransactions[0].transaction;
      
      // Rule-matched transactions should NOT have AI confidence
      expect(matchedTx.confidence).toBeUndefined();
      expect(matchedTx.reasoning).toBeUndefined();
      expect(matchedTx.aiProxyMetadata).toBeUndefined();
      expect(matchedTx.category).toBe('Food & Dining');
      expect(matchedTx.subcategory).toBe('Coffee Shops');
    });
  });
});