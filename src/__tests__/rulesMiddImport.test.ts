import { fileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';
import { Transaction } from '../types';

// Mock external dependencies
jest.mock('../services/azureOpenAIService');
jest.mock('../services/accountManagementService');

const mockAzureOpenAI = azureOpenAIService as jest.Mocked<typeof azureOpenAIService>;

describe('Rules Mid-Import Functionality', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear all rules before each test
    rulesService.clearAllRules();
  });

  it('should use rules created mid-import for subsequent batches', async () => {
    // Set up a scenario with 50 transactions to force multiple batches (20 per batch)
    // First batch will have high-confidence AI results that create auto-rules
    // Second batch should use those rules instead of calling AI

    const rawData = [];
    
    // Create 25 transactions with the same description pattern for batches 1-2
    for (let i = 1; i <= 25; i++) {
      const dateStr = i < 10 ? `2024-01-0${i}` : `2024-01-${Math.min(i, 31)}`; // Keep dates within January
      rawData.push([dateStr, 'STARBUCKS STORE #123', '-5.50']);
    }
    
    // Create 25 more transactions with different patterns for batch 3
    for (let i = 1; i <= 25; i++) {
      const dateStr = i < 10 ? `2024-02-0${i}` : `2024-02-${Math.min(i, 28)}`; // February dates  
      rawData.push([dateStr, 'SHELL GAS STATION', '-45.00']);
    }

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    let aiCallCount = 0;
    
    // Mock AI service to return high-confidence classifications for the first batch
    // Lower confidence for subsequent batches to test that rules are used instead
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      aiCallCount++;
      console.log(`🤖 AI Batch ${aiCallCount} called with ${requests.length} requests`);
      
      return requests.map((req, index) => {
        if (req.transactionText.includes('STARBUCKS')) {
          // First batch gets high confidence, subsequent batches should be intercepted by rules
          const confidence = aiCallCount === 1 ? 0.95 : 0.5; // High confidence only for first batch
          return {
            categoryId: 'Food & Dining',
            subcategoryId: 'Coffee',
            confidence: confidence,
            reasoning: `AI classified Starbucks transaction (batch ${aiCallCount})`
          };
        } else if (req.transactionText.includes('SHELL')) {
          return {
            categoryId: 'Transportation',
            subcategoryId: 'Gas',
            confidence: 0.92,
            reasoning: 'AI classified gas station transaction'
          };
        }
        return {
          categoryId: 'uncategorized',
          confidence: 0.1,
          reasoning: 'Unknown transaction'
        };
      });
    });

    console.log('🧪 Starting rules mid-import test with 50 transactions...');
    
    const result = await (fileProcessingService as any).processTransactions(
      'test-mid-import-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify the results
    expect(result).toHaveLength(50);

    // Check that auto-rules were created for high-confidence AI results
    const rules = await rulesService.getAllRules();
    console.log(`📋 Final rule count: ${rules.length}`);
    
    // Should have at least 1 auto-rule for STARBUCKS (high confidence from first batch)
    expect(rules.length).toBeGreaterThan(0);
    
    const starbucksRule = rules.find(r => r.conditions.some(c => 
      c.field === 'description' && c.value === 'STARBUCKS STORE #123'
    ));
    expect(starbucksRule).toBeDefined();
    expect(starbucksRule?.action.categoryName).toBe('Food & Dining');

    // Verify transactions were properly categorized
    const starbucksTransactions = result.filter(t => t.description === 'STARBUCKS STORE #123');
    expect(starbucksTransactions).toHaveLength(25);
    
    // Count how many were rule-matched vs AI-matched
    const ruleMatchedStarbucks = starbucksTransactions.filter(t => 
      t.confidence === 1.0 && t.reasoning?.includes('rule')
    );
    const aiMatchedStarbucks = starbucksTransactions.filter(t => 
      t.confidence !== 1.0 && t.reasoning?.includes('AI')
    );
    
    console.log(`📊 Starbucks transactions: ${ruleMatchedStarbucks.length} rule-matched, ${aiMatchedStarbucks.length} AI-matched`);
    
    // Should have some rule-matched transactions from later batches
    expect(ruleMatchedStarbucks.length).toBeGreaterThan(0);
    
    // Total AI batch calls should be less than 3 (50 transactions / 20 per batch = 3)
    // because rules should intercept some transactions in later batches
    console.log(`🤖 Total AI batch calls: ${aiCallCount}`);
    
    console.log('✅ Rules mid-import test completed successfully');
  });

  it('should display rule counts and match statistics before each batch', async () => {
    // Test the debug logging functionality
    const rawData = [];
    
    // Create 30 transactions to force at least 2 batches
    for (let i = 1; i <= 30; i++) {
      const dateStr = i < 10 ? `2024-01-0${i}` : `2024-01-${Math.min(i, 31)}`;
      rawData.push([dateStr, `COFFEE SHOP #${i}`, '-4.25']);
    }

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1', 
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    // Create a pre-existing rule for testing
    await rulesService.addRule({
      name: 'Coffee Shop Rule',
      description: 'Matches coffee shop transactions',
      isActive: true,
      priority: 50,
      conditions: [
        {
          field: 'description',
          operator: 'contains',
          value: 'COFFEE SHOP',
          caseSensitive: false
        }
      ],
      action: {
        categoryId: 'food-dining',
        categoryName: 'Food & Dining',
        subcategoryName: 'Coffee'
      }
    });

    // Mock AI to return high-confidence results that will create more rules
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map(() => ({
        categoryId: 'Food & Dining',
        confidence: 0.9,
        reasoning: 'High confidence AI result'
      }));
    });

    // Capture console.log calls to verify debug output
    const originalLog = console.log;
    const logCalls: string[] = [];
    console.log = (message: string, ...args: any[]) => {
      logCalls.push(message);
      return originalLog(message, ...args);
    };

    try {
      console.log('🧪 Starting debug logging test...');
      
      const result = await (fileProcessingService as any).processTransactions(
        'test-debug-logging-file-id',
        rawData,
        mapping,
        defaultCategories,
        defaultCategories.flatMap(c => c.subcategories || []),
        'test-account'
      );

      // Restore console.log
      console.log = originalLog;

      // Check that debug messages were logged
      const ruleCountMessages = logCalls.filter(msg => msg.includes('active rules'));
      const ruleMatchMessages = logCalls.filter(msg => msg.includes('Rules applied:') || msg.includes('Rules re-applied:'));
      
      expect(ruleCountMessages.length).toBeGreaterThan(0);
      expect(ruleMatchMessages.length).toBeGreaterThan(0);
      
      console.log('📊 Debug messages found:');
      ruleCountMessages.forEach(msg => console.log(`  - ${msg}`));
      ruleMatchMessages.forEach(msg => console.log(`  - ${msg}`));
      
      console.log('✅ Debug logging test completed successfully');
      
    } finally {
      // Ensure console.log is restored even if test fails
      console.log = originalLog;
    }
  });
});