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

  it('should create auto-rules from high-confidence AI results during batch processing', async () => {
    // Create a smaller dataset to avoid timeouts - just enough to test rule creation
    const rawData = [
      ['2024-01-01', 'STARBUCKS COFFEE #123', '-5.50'],
      ['2024-01-02', 'STARBUCKS COFFEE #123', '-4.25'], // Same merchant for rule creation
    ];

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };
    
    // Mock AI service to return high-confidence classifications that should create rules
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map(() => ({
        categoryId: 'Food & Dining',
        subcategoryId: 'Coffee',
        confidence: 0.95, // High confidence should trigger auto-rule creation
        reasoning: 'High confidence AI classification for coffee shop'
      }));
    });

    console.log('🧪 Testing auto-rule creation from high-confidence AI results...');
    
    const result = await (fileProcessingService as any).processTransactions(
      'test-auto-rule-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify transactions were processed
    expect(result).toHaveLength(2);
    expect(result[0].category).toBe('Food & Dining');
    expect(result[0].confidence).toBe(0.95);

    // Check that auto-rules were created for high-confidence results
    const rules = await rulesService.getAllRules();
    console.log(`📋 Created ${rules.length} auto-rules`);
    
    // Should have created at least 1 auto-rule
    expect(rules.length).toBeGreaterThanOrEqual(1);
    
    const coffeeRule = rules.find(r => r.conditions.some(c => 
      c.field === 'description' && c.value === 'STARBUCKS COFFEE #123'
    ));
    expect(coffeeRule).toBeDefined();
    expect(coffeeRule?.action.categoryName).toBe('Food & Dining');
    expect(coffeeRule?.name).toContain('Auto:');

    console.log('✅ Auto-rule creation test completed successfully');
  });

  it('should display debug logging for rule counts and matches', async () => {
    // Test the debug logging functionality with a pre-existing rule
    const rawData = [
      ['2024-01-01', 'COFFEE SHOP', '-4.25'],
      ['2024-01-02', 'COFFEE SHOP', '-3.75'],
    ];

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

    // Capture console.log calls to verify debug output
    const originalLog = console.log;
    const logCalls: string[] = [];
    console.log = (message: string, ...args: any[]) => {
      logCalls.push(message);
      return originalLog(message, ...args);
    };

    try {
      console.log('🧪 Testing debug logging functionality...');
      
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

      // Verify results - should be rule-matched (confidence 1.0)
      expect(result).toHaveLength(2);
      expect(result[0].confidence).toBe(1.0);
      expect(result[0].reasoning).toContain('rule');

      // Check that debug messages were logged
      const ruleCountMessages = logCalls.filter(msg => msg.includes('active rules'));
      const ruleMatchMessages = logCalls.filter(msg => msg.includes('Rules applied:'));
      
      expect(ruleCountMessages.length).toBeGreaterThan(0);
      expect(ruleMatchMessages.length).toBeGreaterThan(0);
      
      console.log('📊 Debug messages found:');
      ruleCountMessages.forEach(msg => console.log(`  - ${msg}`));
      ruleMatchMessages.forEach(msg => console.log(`  - ${msg}`));
      
      // Verify that the rule successfully matched both transactions
      const ruleEvaluationMessage = logCalls.find(msg => msg.includes('Rule evaluation:'));
      expect(ruleEvaluationMessage).toContain('1 active rules available');
      
      const rulesAppliedMessage = logCalls.find(msg => msg.includes('Rules applied:'));
      expect(rulesAppliedMessage).toContain('2 matched, 0 need AI');
      
      console.log('✅ Debug logging test completed successfully');
      
    } finally {
      // Ensure console.log is restored even if test fails
      console.log = originalLog;
    }
  });

  it('should not create rules from low-confidence AI results', async () => {
    // Verify that low-confidence results don't create auto-rules
    const rawData = [
      ['2024-01-01', 'UNKNOWN MERCHANT', '-25.00'],
    ];

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };

    // Mock AI service to return low-confidence classifications
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      return requests.map(() => ({
        categoryId: 'Entertainment',
        confidence: 0.6, // Low confidence - should not create auto-rule
        reasoning: 'Uncertain categorization'
      }));
    });

    console.log('🧪 Testing that low-confidence AI results do not create rules...');
    
    const result = await (fileProcessingService as any).processTransactions(
      'test-low-confidence-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify no auto-rules were created
    const rules = await rulesService.getAllRules();
    expect(rules.length).toBe(0);
    
    // Transaction should have AI-assigned confidence (0.6), not rule confidence (1.0)
    expect(result[0].confidence).toBe(0.6);
    expect(result[0].reasoning).toBe('Uncertain categorization');
    
    console.log('✅ Low-confidence test completed - no auto-rules created as expected');
  });
});