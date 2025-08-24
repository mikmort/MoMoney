import { Transaction } from '../types';
import { reportsService } from '../services/reportsService';
import { dashboardService } from '../services/dashboardService';
import { dataService } from '../services/dataService';
import { defaultCategories } from '../data/defaultCategories';

describe('Category-Based Income/Expense Filtering', () => {
  const mockTransactions: Transaction[] = [
    {
      id: '1',
      date: new Date('2024-01-15'),
      amount: 2500,
      description: 'Salary Payment',
      category: 'Salary & Wages', // Income category
      account: 'Checking',
      type: 'expense' as const, // Intentionally wrong type to test category-based logic
      isVerified: false
    },
    {
      id: '2', 
      date: new Date('2024-01-16'),
      amount: -150,
      description: 'Grocery Store',
      category: 'Food & Dining', // Expense category
      account: 'Checking',
      type: 'income' as const, // Intentionally wrong type to test category-based logic
      isVerified: false
    },
    {
      id: '3',
      date: new Date('2024-01-17'),
      amount: -25,
      description: 'Transfer to Savings',
      category: 'Internal Transfer', // Transfer category
      account: 'Checking', 
      type: 'transfer' as const,
      isVerified: false
    },
    {
      id: '4',
      date: new Date('2024-01-18'),
      amount: 50,
      description: 'Freelance Payment',
      category: 'Business Income', // Income category  
      account: 'Checking',
      type: 'expense' as const, // Intentionally wrong type
      isVerified: false
    },
    {
      id: '5',
      date: new Date('2024-01-19'), 
      amount: -75,
      description: 'Gas Station',
      category: 'Transportation', // Expense category
      account: 'Checking',
      type: 'income' as const, // Intentionally wrong type
      isVerified: false
    }
  ];

  beforeEach(() => {
    // Mock dataService to return our test transactions
    jest.spyOn(dataService, 'getAllTransactions').mockResolvedValue(mockTransactions);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Reports Service', () => {
    it('should filter transactions by income categories regardless of transaction type', async () => {
      const incomeCategories = defaultCategories
        .filter(cat => cat.type === 'income')
        .map(cat => cat.name);

      // Get income transactions using category-based filtering
      const incomeTransactions = mockTransactions.filter(t => 
        incomeCategories.includes(t.category)
      );

      // Should include transactions 1 and 4 (Salary & Wages, Business Income)
      expect(incomeTransactions).toHaveLength(2);
      expect(incomeTransactions.find(t => t.id === '1')).toBeDefined(); // Salary
      expect(incomeTransactions.find(t => t.id === '4')).toBeDefined(); // Business Income
      expect(incomeTransactions.find(t => t.id === '2')).toBeUndefined(); // Grocery (expense category)
      expect(incomeTransactions.find(t => t.id === '5')).toBeUndefined(); // Gas (expense category)
    });

    it('should filter transactions by expense categories regardless of transaction type', async () => {
      const expenseCategories = defaultCategories
        .filter(cat => cat.type === 'expense')
        .map(cat => cat.name);

      // Get expense transactions using category-based filtering
      const expenseTransactions = mockTransactions.filter(t => 
        expenseCategories.includes(t.category)
      );

      // Should include transactions 2 and 5 (Food & Dining, Transportation)
      expect(expenseTransactions).toHaveLength(2);
      expect(expenseTransactions.find(t => t.id === '2')).toBeDefined(); // Food & Dining
      expect(expenseTransactions.find(t => t.id === '5')).toBeDefined(); // Transportation
      expect(expenseTransactions.find(t => t.id === '1')).toBeUndefined(); // Salary (income category)
      expect(expenseTransactions.find(t => t.id === '4')).toBeUndefined(); // Business Income (income category)
    });

    it('should exclude transfers from income/expense calculations', async () => {
      const nonTransferTransactions = mockTransactions.filter(t => t.type !== 'transfer');
      
      // Should exclude transaction 3 (Internal Transfer)
      expect(nonTransferTransactions).toHaveLength(4);
      expect(nonTransferTransactions.find(t => t.id === '3')).toBeUndefined();
    });

    it('should get income by category using category-based filtering', async () => {
      const result = await reportsService.getIncomeByCategory();
      
      // Should return categories with income type only
      const categoryNames = result.map(r => r.categoryName);
      
      // Should include income categories present in our test data
      expect(categoryNames).toContain('Salary & Wages');
      expect(categoryNames).toContain('Business Income');
      
      // Should NOT include expense categories
      expect(categoryNames).not.toContain('Food & Dining');
      expect(categoryNames).not.toContain('Transportation');
    });
  });

  describe('Dashboard Service', () => {
    it('should calculate income and expenses based on categories not transaction types', async () => {
      const stats = await dashboardService.getDashboardStats();
      
      // Income should be calculated from transactions in income categories
      // Expense should be calculated from transactions in expense categories
      // Regardless of the transaction.type field
      
      // Income: Transaction 1 ($2500) + Transaction 4 ($50) = $2550
      expect(stats.totalIncome).toBe(2550);
      
      // Expenses: Transaction 2 ($150) + Transaction 5 ($75) = $225
      expect(stats.totalExpenses).toBe(225);
      
      // Net income: $2550 - $225 = $2325
      expect(stats.netIncome).toBe(2325);
      
      // Transaction count should exclude transfers (4 transactions)
      expect(stats.transactionCount).toBe(4);
    });
  });

  describe('Category Type Validation', () => {
    it('should have income categories defined', () => {
      const incomeCategories = defaultCategories.filter(cat => cat.type === 'income');
      expect(incomeCategories.length).toBeGreaterThan(0);
      expect(incomeCategories.some(cat => cat.name === 'Salary & Wages')).toBe(true);
      expect(incomeCategories.some(cat => cat.name === 'Business Income')).toBe(true);
    });

    it('should have expense categories defined', () => {
      const expenseCategories = defaultCategories.filter(cat => cat.type === 'expense');
      expect(expenseCategories.length).toBeGreaterThan(0);
      expect(expenseCategories.some(cat => cat.name === 'Food & Dining')).toBe(true);
      expect(expenseCategories.some(cat => cat.name === 'Transportation')).toBe(true);
    });

    it('should have transfer categories defined', () => {
      const transferCategories = defaultCategories.filter(cat => cat.type === 'transfer');
      expect(transferCategories.length).toBeGreaterThan(0);
      expect(transferCategories.some(cat => cat.name === 'Internal Transfer')).toBe(true);
    });
  });
});