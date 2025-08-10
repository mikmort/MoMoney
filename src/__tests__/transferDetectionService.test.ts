import { transferDetectionService } from '../services/transferDetectionService';
import { rulesService } from '../services/rulesService';
import { Transaction } from '../types';

// Mock the rulesService
jest.mock('../services/rulesService', () => ({
  rulesService: {
    getAllRules: jest.fn(),
    addRule: jest.fn(),
  }
}));

const mockRulesService = rulesService as jest.Mocked<typeof rulesService>;

describe('TransferDetectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeTransaction', () => {
    it('should identify ACH transfer transactions', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'ACH TRANSFER TO SAVINGS',
        amount: -500.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'ACH TRANSFER TO SAVINGS'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      expect(result.isLikelyTransfer).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Contains transfer keywords:'),
          'Contains account-to-account pattern',
          'Round dollar amount'
        ])
      );
    });

    it('should identify automatic payment transactions', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'AUTOMATIC PAYMENT TO CREDIT CARD',
        amount: -250.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'AUTOMATIC PAYMENT TO CREDIT CARD'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      expect(result.isLikelyTransfer).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasons).toContain('Contains transfer keywords: automatic payment');
    });

    it('should NOT identify bank fees as transfers', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'OVERDRAFT FEE',
        amount: -35.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'OVERDRAFT FEE'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      expect(result.isLikelyTransfer).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reasons).toContain('Contains bank fee keywords');
    });

    it('should identify wire transfers', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'WIRE TRANSFER - REF #12345',
        amount: -1000.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'WIRE TRANSFER - REF #12345'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      expect(result.isLikelyTransfer).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Contains transfer keywords:'),
          'Contains reference number',
          'Round dollar amount'
        ])
      );
    });

    it('should identify Zelle transfers', () => {
      const transaction = {
        date: new Date('2024-01-01'),
        description: 'ZELLE PAYMENT TO JOHN DOE',
        amount: -75.00,
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'ZELLE PAYMENT TO JOHN DOE'
      };

      const result = transferDetectionService.analyzeTransaction(transaction);

      expect(result.isLikelyTransfer).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasons).toContain('Contains transfer keywords: zelle');
    });
  });

  describe('findPotentialTransferPairs', () => {
    it('should find matching transfer pairs with opposite amounts', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          description: 'Transfer to Savings',
          amount: -500.00,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        },
        {
          id: '2',
          date: new Date('2024-01-01'),
          description: 'Transfer from Checking',
          amount: 500.00,
          category: 'Uncategorized',
          account: 'Savings Account',
          type: 'income',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        }
      ];

      const pairs = transferDetectionService.findPotentialTransferPairs(transactions);

      expect(pairs).toHaveLength(1);
      expect(pairs[0].sourceTransaction.amount).toBe(-500.00);
      expect(pairs[0].targetTransaction.amount).toBe(500.00);
      expect(pairs[0].confidence).toBeGreaterThan(0.7);
      expect(pairs[0].daysDifference).toBe(0);
      expect(pairs[0].amountDifference).toBe(0);
    });

    it('should find transfer pairs within date tolerance', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          description: 'ATM Withdrawal',
          amount: -200.00,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        },
        {
          id: '2',
          date: new Date('2024-01-02'),
          description: 'Cash Deposit',
          amount: 200.00,
          category: 'Uncategorized',
          account: 'Savings Account',
          type: 'income',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        }
      ];

      const pairs = transferDetectionService.findPotentialTransferPairs(transactions);

      expect(pairs).toHaveLength(1);
      expect(pairs[0].daysDifference).toBe(1);
      expect(pairs[0].confidence).toBeGreaterThan(0.7);
    });

    it('should NOT match transactions in the same account', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          description: 'Transfer Payment',
          amount: -100.00,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        },
        {
          id: '2',
          date: new Date('2024-01-01'),
          description: 'Transfer Receipt',
          amount: 100.00,
          category: 'Uncategorized',
          account: 'Checking Account', // Same account
          type: 'income',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        }
      ];

      const pairs = transferDetectionService.findPotentialTransferPairs(transactions);

      expect(pairs).toHaveLength(0);
    });

    it('should NOT match transactions with different amounts beyond tolerance', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          description: 'Transfer Payment',
          amount: -100.00,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        },
        {
          id: '2',
          date: new Date('2024-01-01'),
          description: 'Transfer Receipt',
          amount: 150.00, // 50% difference - beyond tolerance
          category: 'Uncategorized',
          account: 'Savings Account',
          type: 'income',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        }
      ];

      const pairs = transferDetectionService.findPotentialTransferPairs(transactions);

      expect(pairs).toHaveLength(0);
    });

    it('should NOT match transactions beyond date tolerance', () => {
      const transactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2024-01-01'),
          description: 'Transfer Payment',
          amount: -100.00,
          category: 'Uncategorized',
          account: 'Checking Account',
          type: 'expense',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        },
        {
          id: '2',
          date: new Date('2024-01-15'), // 14 days apart - beyond 7 day tolerance
          description: 'Transfer Receipt',
          amount: 100.00,
          category: 'Uncategorized',
          account: 'Savings Account',
          type: 'income',
          isVerified: false,
          addedDate: new Date(),
          lastModifiedDate: new Date()
        }
      ];

      const pairs = transferDetectionService.findPotentialTransferPairs(transactions);

      expect(pairs).toHaveLength(0);
    });
  });

  describe('initializeTransferRules', () => {
    it('should create transfer detection rules', async () => {
      mockRulesService.getAllRules.mockResolvedValue([]);
      mockRulesService.addRule.mockImplementation(async (rule) => ({
        ...rule,
        id: 'mock-id',
        createdDate: new Date(),
        lastModifiedDate: new Date()
      }));

      const rulesCreated = await transferDetectionService.initializeTransferRules();

      expect(rulesCreated).toBeGreaterThan(0);
      expect(mockRulesService.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringContaining('Transfer Detection'),
          action: expect.objectContaining({
            categoryId: 'internal-transfer',
            categoryName: 'Internal Transfer'
          })
        })
      );
    });

    it('should not create duplicate rules', async () => {
      // Mock existing rule
      mockRulesService.getAllRules.mockResolvedValue([
        {
          id: 'existing-rule',
          name: 'Transfer Detection: ach transfer',
          description: 'Test rule',
          isActive: true,
          priority: 10,
          conditions: [
            {
              field: 'description',
              operator: 'contains',
              value: 'ach transfer',
              caseSensitive: false
            }
          ],
          action: {
            categoryId: 'internal-transfer',
            categoryName: 'Internal Transfer',
            subcategoryId: 'transfer-between-accounts',
            subcategoryName: 'Between Accounts'
          },
          createdDate: new Date(),
          lastModifiedDate: new Date()
        }
      ]);

      const rulesCreated = await transferDetectionService.initializeTransferRules();

      // Should not create the ACH transfer rule since it already exists
      expect(mockRulesService.addRule).not.toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Transfer Detection: ach transfer'
        })
      );
    });

    it('should create bank fee protection rule', async () => {
      mockRulesService.getAllRules.mockResolvedValue([]);
      mockRulesService.addRule.mockImplementation(async (rule) => ({
        ...rule,
        id: 'mock-id',
        createdDate: new Date(),
        lastModifiedDate: new Date()
      }));

      await transferDetectionService.initializeTransferRules();

      expect(mockRulesService.addRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Bank Fee Protection',
          action: expect.objectContaining({
            categoryId: 'financial',
            categoryName: 'Financial'
          })
        })
      );
    });
  });
});