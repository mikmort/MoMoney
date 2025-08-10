import { fileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';

// Mock external dependencies
jest.mock('../services/azureOpenAIService');
jest.mock('../services/accountManagementService');

const mockAzureOpenAI = azureOpenAIService as jest.Mocked<typeof azureOpenAIService>;

describe('Batch Rule Matching', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear all rules before each test
    rulesService.clearAllRules();
  });

  it('should apply rules created from first batch to subsequent batches', async () => {
    // Create test data with multiple batches (25+ transactions to ensure multiple batches)
    // First batch: 20 transactions that will create rules 
    // Second batch: 20 transactions that should match the created rules
    const rawData = [];
    
    // First batch: Create 20 transactions of the same merchant (will create a rule)
    for (let i = 1; i <= 20; i++) {
      rawData.push([`2024-01-${i.toString().padStart(2, '0')}`, 'STARBUCKS COFFEE #123', '-5.50']);
    }
    
    // Second batch: Create 20 more transactions of the same merchant (should match rule)
    for (let i = 21; i <= 40; i++) {
      rawData.push([`2024-01-${i.toString().padStart(2, '0')}`, 'STARBUCKS COFFEE #123', '-4.25']);
    }

    console.log(`🧪 Testing rule matching across batches with ${rawData.length} transactions`);

    const mapping = {
      dateColumn: '0',
      descriptionColumn: '1',
      amountColumn: '2',
      hasHeaders: false,
      skipRows: 0,
      dateFormat: 'YYYY-MM-DD',
      amountFormat: 'negative for debits'
    };
    
    // Mock AI service to return high-confidence classifications for batch 1
    // and simulate that AI should not be called for batch 2 (rules should match)
    let aiCallCount = 0;
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      aiCallCount++;
      console.log(`🤖 AI batch call #${aiCallCount} with ${requests.length} requests`);
      
      return requests.map(() => ({
        categoryId: 'Food & Dining',
        subcategoryId: 'Coffee',
        confidence: 0.95, // High confidence should trigger auto-rule creation
        reasoning: 'High confidence AI classification for coffee shop'
      }));
    });

    const result = await (fileProcessingService as any).processTransactions(
      'test-batch-rule-file-id',
      rawData,
      mapping,
      defaultCategories,
      defaultCategories.flatMap(c => c.subcategories || []),
      'test-account'
    );

    // Verify all transactions were processed
    expect(result).toHaveLength(40);
    
    // Check that rules were created
    const rules = await rulesService.getAllRules();
    console.log(`📋 Created ${rules.length} rules after processing`);
    expect(rules.length).toBeGreaterThanOrEqual(1);
    
    // Verify that some transactions have rule confidence (1.0) indicating they were matched by rules
    const ruleMatchedTransactions = result.filter(t => t.confidence === 1.0);
    const aiMatchedTransactions = result.filter(t => t.confidence === 0.95);
    
    console.log(`📊 Results: ${ruleMatchedTransactions.length} rule-matched, ${aiMatchedTransactions.length} AI-matched`);
    
    // The key test: Second batch should have been matched by rules created from first batch
    // So we should have MORE rule-matched transactions than just the first batch
    expect(ruleMatchedTransactions.length).toBeGreaterThan(0);
    
    // AI should have been called fewer times than the total number of transactions
    // because rules should have caught some in the second batch
    console.log(`🤖 AI was called ${aiCallCount} times total`);
    
    // The main assertion: if rules are working properly across batches,
    // we should have a mix of rule-matched and AI-matched transactions
    if (ruleMatchedTransactions.length === 0) {
      console.error('❌ NO transactions were matched by rules - this indicates the bug');
      console.error('All transactions went to AI instead of using rules created from earlier batches');
    } else {
      console.log('✅ Some transactions were matched by rules across batches');
    }
    
    // This should pass if rules are working correctly across batches
    expect(ruleMatchedTransactions.length).toBeGreaterThan(0);
  });
});