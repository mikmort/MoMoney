// Mock the dataService
jest.mock('../services/dataService', () => ({
  dataService: {
    getAllTransactions: jest.fn()
  }
}));

// Mock currencyDisplayService to avoid complex dependency
jest.mock('../services/currencyDisplayService', () => ({
  currencyDisplayService: {
    convertTransactionsBatch: jest.fn().mockImplementation((transactions) => Promise.resolve(transactions))
  }
}));

import { dashboardService } from '../services/dashboardService';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

const mockDataService = dataService as jest.Mocked<typeof dataService>;

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRecentTransactions', () => {
    it('should exclude Internal Transfer transactions from recent transactions', async () => {
      const mockTransactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2025-01-15'),
          description: 'Grocery shopping',
          category: 'Food & Dining',
          amount: -45.67,
          account: 'Checking',
          type: 'expense'
        },
        {
          id: '2', 
          date: new Date('2025-01-14'),
          description: 'Transfer to Savings',
          category: 'Internal Transfer',
          amount: -500.00,
          account: 'Checking',
          type: 'transfer'
        },
        {
          id: '3',
          date: new Date('2025-01-13'), 
          description: 'Salary deposit',
          category: 'Salary & Wages',
          amount: 3000.00,
          account: 'Checking',
          type: 'income'
        },
        {
          id: '4',
          date: new Date('2025-01-12'),
          description: 'ATM Withdrawal',
          category: 'Internal Transfer', 
          amount: -100.00,
          account: 'Checking',
          type: 'transfer'
        }
      ];

      mockDataService.getAllTransactions.mockResolvedValue(mockTransactions);

      const recentTransactions = await dashboardService.getRecentTransactions(5);

      // Should only contain non-transfer transactions
      expect(recentTransactions).toHaveLength(2);
      expect(recentTransactions[0].description).toBe('Grocery shopping');
      expect(recentTransactions[1].description).toBe('Salary deposit');
      
      // Verify that no transfers are included
      const transferTransactions = recentTransactions.filter(t => t.type === 'transfer');
      expect(transferTransactions).toHaveLength(0);
    });

    it('should return transactions in descending date order', async () => {
      const mockTransactions: Transaction[] = [
        {
          id: '1',
          date: new Date('2025-01-10'),
          description: 'Old expense',
          category: 'Food & Dining',
          amount: -25.00,
          account: 'Checking',
          type: 'expense'
        },
        {
          id: '2',
          date: new Date('2025-01-15'),
          description: 'Recent expense', 
          category: 'Transportation',
          amount: -50.00,
          account: 'Checking',
          type: 'expense'
        }
      ];

      mockDataService.getAllTransactions.mockResolvedValue(mockTransactions);

      const recentTransactions = await dashboardService.getRecentTransactions();

      expect(recentTransactions[0].description).toBe('Recent expense');
      expect(recentTransactions[1].description).toBe('Old expense');
    });

    it('should respect the limit parameter', async () => {
      const mockTransactions: Transaction[] = Array.from({ length: 15 }, (_, i) => ({
        id: `tx-${i}`,
        date: new Date(2025, 0, i + 1),
        description: `Transaction ${i + 1}`,
        category: 'Food & Dining',
        amount: -10.00,
        account: 'Checking',
        type: 'expense'
      }));

      mockDataService.getAllTransactions.mockResolvedValue(mockTransactions);

      const recentTransactions = await dashboardService.getRecentTransactions(5);
      expect(recentTransactions).toHaveLength(5);
    });
  });
});