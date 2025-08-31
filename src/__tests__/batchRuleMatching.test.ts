import { fileProcessingService } from '../services/fileProcessingService';
import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';
import { Transaction } from '../types';

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
    // Create test data with exactly 25 transactions to ensure multiple batches (20 + 5)
    // All transactions are identical to maximize rule creation opportunity
    const rawData = [];
    
    // Create 25 identical transactions that should all match once a rule is created
    for (let i = 1; i <= 25; i++) {
      rawData.push([`2024-01-${i.toString().padStart(2, '0')}`, 'STARBUCKS COFFEE #123', '-5.50']);
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
    
    // Track AI calls to verify optimization
    let aiCallCount = 0;
    let totalAIRequests = 0;
    mockAzureOpenAI.classifyTransactionsBatch.mockImplementation(async (requests) => {
      aiCallCount++;
      totalAIRequests += requests.length;
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
    expect(result).toHaveLength(25);
    
    // Check that rules were created
    const rules = await rulesService.getAllRules();
    console.log(`📋 Created ${rules.length} rules after processing`);
    expect(rules.length).toBeGreaterThanOrEqual(1);
    
    // Verify that some transactions have rule confidence (1.0) indicating they were matched by rules
    const ruleMatchedTransactions = result.filter((t: Transaction) => t.confidence === 1.0);
    const aiMatchedTransactions = result.filter((t: Transaction) => t.confidence === 0.95);
    
    console.log(`📊 Results: ${ruleMatchedTransactions.length} rule-matched, ${aiMatchedTransactions.length} AI-matched`);
    console.log(`🤖 AI was called ${aiCallCount} times with total ${totalAIRequests} requests`);
    
    // The key test: Rules should have been applied across batches
    // We expect fewer than 25 AI requests because rules should catch some transactions
    expect(ruleMatchedTransactions.length).toBeGreaterThan(0);
    expect(totalAIRequests).toBeLessThan(25);
    
    console.log('✅ Rules successfully applied across batches - AI requests optimized');
  });
});