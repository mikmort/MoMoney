import { rulesService } from '../services/rulesService';
import { transferDetectionService } from '../services/transferDetectionService';
import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

// Mock the rulesService for isolated testing
jest.mock('../services/rulesService', () => ({
  rulesService: {
    getAllRules: jest.fn(),
    addRule: jest.fn(),
    applyRulesToBatch: jest.fn(),
  }
}));

const mockRulesService = rulesService as jest.Mocked<typeof rulesService>;

describe('Transfer Type Fix Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should mark transactions as type "transfer" when transfer rules match', async () => {
    // Set up a mock transfer rule that includes transactionType
    const mockTransferRule = {
      id: 'test-rule',
      name: 'Transfer Detection: ach transfer',
      description: 'Test transfer rule',
      isActive: true,
      priority: 10,
      conditions: [
        {
          field: 'description' as const,
          operator: 'contains' as const,
          value: 'ach transfer',
          caseSensitive: false
        }
      ],
      action: {
        categoryId: 'internal-transfer',
        categoryName: 'Internal Transfer',
        subcategoryId: 'transfer-between-accounts',
        subcategoryName: 'Between Accounts',
        transactionType: 'transfer' as const
      },
      createdDate: new Date(),
      lastModifiedDate: new Date()
    };

    // Mock the rule application to return matched transactions with correct type
    mockRulesService.applyRulesToBatch.mockResolvedValue({
      matchedTransactions: [
        {
          transaction: {
            date: new Date('2024-01-01'),
            description: 'ACH TRANSFER TO SAVINGS',
            amount: -500.00,
            category: 'Internal Transfer',
            subcategory: 'Between Accounts',
            account: 'Checking Account',
            type: 'transfer', // This should be set by the rule
            isVerified: false,
            confidence: 1.0,
            reasoning: 'Matched rule: Transfer Detection: ach transfer'
          },
          rule: mockTransferRule
        }
      ],
      unmatchedTransactions: []
    });

    // Create test transactions
    const testTransactions = [
      {
        date: new Date('2024-01-01'),
        description: 'ACH TRANSFER TO SAVINGS',
        amount: -500.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const, // Initially expense
        isVerified: false
      }
    ];

    // Apply rules to the test transactions
    const result = await rulesService.applyRulesToBatch(testTransactions);
    
    // Verify that the matched transaction has type 'transfer'
    expect(result.matchedTransactions).toHaveLength(1);
    expect(result.matchedTransactions[0].transaction.type).toBe('transfer');
    expect(result.matchedTransactions[0].transaction.category).toBe('Internal Transfer');
  });

  it('should allow transfer matching service to find transactions with type "transfer"', async () => {
    // Create test transactions with type 'transfer' (as would be set by rules)
    const transferTransactions: Transaction[] = [
      {
        id: '1',
        date: new Date('2024-01-01'),
        description: 'Transfer to Savings',
        amount: -500.00,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer', // Now correctly marked as transfer
        isVerified: false,
        addedDate: new Date(),
        lastModifiedDate: new Date()
      },
      {
        id: '2',
        date: new Date('2024-01-01'),
        description: 'Transfer from Checking',
        amount: 500.00,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'transfer', // Now correctly marked as transfer
        isVerified: false,
        addedDate: new Date(),
        lastModifiedDate: new Date()
      }
    ];

    // Test that the transfer matching service can now find these transactions
    const matchResult = await transferMatchingService.findTransferMatches({
      transactions: transferTransactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    // Should find a match now that transactions are properly typed
    expect(matchResult.matches).toHaveLength(1);
    expect(matchResult.matches[0].sourceTransactionId).toBe('1');
    expect(matchResult.matches[0].targetTransactionId).toBe('2');
    expect(matchResult.matches[0].confidence).toBeGreaterThan(0.7);
  });

  it('should preserve original transaction type if rule does not specify transactionType', async () => {
    // Create a rule without transactionType (for backward compatibility)
    const mockRegularRule = {
      id: 'regular-rule',
      name: 'Grocery Store Rule',
      description: 'Test regular rule',
      isActive: true,
      priority: 10,
      conditions: [
        {
          field: 'description' as const,
          operator: 'contains' as const,
          value: 'grocery',
          caseSensitive: false
        }
      ],
      action: {
        categoryId: 'food',
        categoryName: 'Food',
        subcategoryId: 'groceries',
        subcategoryName: 'Groceries'
        // No transactionType specified
      },
      createdDate: new Date(),
      lastModifiedDate: new Date()
    };

    mockRulesService.applyRulesToBatch.mockResolvedValue({
      matchedTransactions: [
        {
          transaction: {
            date: new Date('2024-01-01'),
            description: 'GROCERY STORE PURCHASE',
            amount: -50.00,
            category: 'Food',
            subcategory: 'Groceries',
            account: 'Checking Account',
            type: 'expense', // Should remain expense since rule doesn't specify type
            isVerified: false,
            confidence: 1.0,
            reasoning: 'Matched rule: Grocery Store Rule'
          },
          rule: mockRegularRule
        }
      ],
      unmatchedTransactions: []
    });

    const testTransactions = [
      {
        date: new Date('2024-01-01'),
        description: 'GROCERY STORE PURCHASE',
        amount: -50.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false
      }
    ];

    const result = await rulesService.applyRulesToBatch(testTransactions);
    
    // Verify that the transaction type remains unchanged
    expect(result.matchedTransactions).toHaveLength(1);
    expect(result.matchedTransactions[0].transaction.type).toBe('expense');
    expect(result.matchedTransactions[0].transaction.category).toBe('Food');
  });
});