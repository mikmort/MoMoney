import { budgetService } from '../services/budgetService';
import { Transaction, Category, Budget, BudgetViewPeriod } from '../types';

describe('Budget View Periods', () => {
  const mockCategories: Category[] = [
    {
      id: 'food',
      name: 'Food & Dining',
      type: 'expense',
      subcategories: []
    },
    {
      id: 'transportation',
      name: 'Transportation',
      type: 'expense',
      subcategories: []
    }
  ];

  const mockTransactions: Transaction[] = [
    // January transactions
    {
      id: '1',
      date: new Date(2025, 0, 15), // January 15, 2025
      amount: 100,
      description: 'Grocery Store',
      category: 'Food & Dining',
      account: 'Checking',
      type: 'expense',
      isVerified: true
    },
    {
      id: '2', 
      date: new Date(2025, 0, 25), // January 25, 2025
      amount: 150,
      description: 'Restaurant',
      category: 'Food & Dining',
      account: 'Credit Card',
      type: 'expense',
      isVerified: true
    },
    // February transactions
    {
      id: '3',
      date: new Date(2025, 1, 10), // February 10, 2025
      amount: 120,
      description: 'Gas Station',
      category: 'Transportation',
      account: 'Credit Card',
      type: 'expense',
      isVerified: true
    },
    // March transactions
    {
      id: '4',
      date: new Date(2025, 2, 5), // March 5, 2025
      amount: 80,
      description: 'Cafe',
      category: 'Food & Dining',
      account: 'Checking',
      type: 'expense',
      isVerified: true
    }
  ];

  const mockBudget: Budget = {
    id: 'test-budget-1',
    name: 'Food Budget',
    categoryId: 'food',
    amount: 800, // Monthly budget
    period: 'monthly',
    startDate: new Date(2025, 0, 1), // January 1, 2025
    isActive: true,
    alertThreshold: 80
  };

  beforeEach(() => {
    // Create a fresh budget for testing
    budgetService['budgets'] = [mockBudget];
  });

  describe('calculateBudgetAmountForViewPeriod', () => {
    test('calculates weekly budget amount correctly', () => {
      const weeklyAmount = budgetService['calculateBudgetAmountForViewPeriod'](mockBudget, 'weekly');
      expect(weeklyAmount).toBeCloseTo(800 / 4.33, 2); // ~184.76
    });

    test('calculates monthly budget amount correctly', () => {
      const monthlyAmount = budgetService['calculateBudgetAmountForViewPeriod'](mockBudget, 'monthly');
      expect(monthlyAmount).toBe(800);
    });

    test('calculates quarterly budget amount correctly', () => {
      const quarterlyAmount = budgetService['calculateBudgetAmountForViewPeriod'](mockBudget, 'quarterly');
      expect(quarterlyAmount).toBe(2400); // 800 * 3
    });

    test('calculates annual budget amount correctly', () => {
      const annualAmount = budgetService['calculateBudgetAmountForViewPeriod'](mockBudget, 'annual');
      expect(annualAmount).toBe(9600); // 800 * 12
    });
  });

  describe('getViewPeriodDates', () => {
    const referenceDate = { year: 2025, month: 0 }; // January 2025

    test('calculates weekly period dates correctly', () => {
      const { startDate, endDate } = budgetService['getViewPeriodDates']('weekly', referenceDate);
      
      // Should be the week containing January 1, 2025 (which is a Wednesday)
      expect(startDate.getDay()).toBe(0); // Should start on Sunday
      expect(endDate.getTime() - startDate.getTime()).toBe(7 * 24 * 60 * 60 * 1000 - 1); // 7 days minus 1ms
    });

    test('calculates monthly period dates correctly', () => {
      const { startDate, endDate } = budgetService['getViewPeriodDates']('monthly', referenceDate);
      
      expect(startDate).toEqual(new Date(2025, 0, 1)); // January 1, 2025
      expect(endDate).toEqual(new Date(2025, 0, 31)); // January 31, 2025
    });

    test('calculates quarterly period dates correctly', () => {
      const { startDate, endDate } = budgetService['getViewPeriodDates']('quarterly', referenceDate);
      
      expect(startDate).toEqual(new Date(2025, 0, 1)); // January 1, 2025 (Q1 start)
      expect(endDate).toEqual(new Date(2025, 2, 31)); // March 31, 2025 (Q1 end)
    });

    test('calculates annual period dates correctly', () => {
      const { startDate, endDate } = budgetService['getViewPeriodDates']('annual', referenceDate);
      
      expect(startDate).toEqual(new Date(2025, 0, 1)); // January 1, 2025
      expect(endDate).toEqual(new Date(2025, 11, 31)); // December 31, 2025
    });
  });

  describe('calculateBudgetProgressWithViewPeriod', () => {
    test('calculates monthly view progress correctly', () => {
      const progress = budgetService.calculateBudgetProgressWithViewPeriod(
        mockBudget,
        mockTransactions,
        mockCategories,
        { year: 2025, month: 0 }, // January 2025
        'monthly'
      );

      expect(progress.actualSpent).toBe(250); // $100 + $150 from January transactions
      expect(progress.budgetAmount).toBe(800); // Monthly budget
      expect(progress.percentage).toBeCloseTo(31.25, 2); // 250/800 * 100
      expect(progress.viewPeriod).toBe('monthly');
      expect(progress.transactions).toHaveLength(2);
    });

    test('calculates quarterly view progress correctly', () => {
      const progress = budgetService.calculateBudgetProgressWithViewPeriod(
        mockBudget,
        mockTransactions,
        mockCategories,
        { year: 2025, month: 0 }, // January 2025 (Q1)
        'quarterly'
      );

      expect(progress.actualSpent).toBe(330); // $100 + $150 + $80 from Q1 transactions
      expect(progress.budgetAmount).toBe(2400); // Quarterly budget (800 * 3)
      expect(progress.percentage).toBeCloseTo(13.75, 2); // 330/2400 * 100
      expect(progress.viewPeriod).toBe('quarterly');
      expect(progress.transactions).toHaveLength(3); // Jan + Mar transactions
    });

    test('calculates annual view progress correctly', () => {
      const progress = budgetService.calculateBudgetProgressWithViewPeriod(
        mockBudget,
        mockTransactions,
        mockCategories,
        { year: 2025, month: 0 }, // 2025
        'annual'
      );

      expect(progress.actualSpent).toBe(330); // All Food & Dining transactions in 2025
      expect(progress.budgetAmount).toBe(9600); // Annual budget (800 * 12)
      expect(progress.percentage).toBeCloseTo(3.44, 2); // 330/9600 * 100
      expect(progress.viewPeriod).toBe('annual');
      expect(progress.transactions).toHaveLength(3);
    });

    test('calculates weekly view progress correctly', () => {
      // Let's create transactions that will actually fall within the first week of January 2025
      const weeklyTestTransactions: Transaction[] = [
        {
          id: 'weekly-1',
          date: new Date(2025, 0, 2), // January 2, 2025 (within first week)
          amount: 50,
          description: 'Coffee Shop',
          category: 'Food & Dining',
          account: 'Checking',
          type: 'expense',
          isVerified: true
        }
      ];

      const progress = budgetService.calculateBudgetProgressWithViewPeriod(
        mockBudget,
        weeklyTestTransactions,
        mockCategories,
        { year: 2025, month: 0 }, // January 2025
        'weekly'
      );

      expect(progress.budgetAmount).toBeCloseTo(800 / 4.33, 2); // Weekly budget
      expect(progress.viewPeriod).toBe('weekly');
      expect(progress.actualSpent).toBe(50); // Should find our January 2nd transaction
      expect(progress.transactions).toHaveLength(1);
    });
  });

  describe('getBudgetProgressForAllWithViewPeriod', () => {
    test('returns progress for all active budgets with view period', () => {
      const transportationBudget: Budget = {
        id: 'test-budget-2',
        name: 'Transportation Budget',
        categoryId: 'transportation',
        amount: 400,
        period: 'monthly',
        startDate: new Date(2025, 0, 1),
        isActive: true,
        alertThreshold: 90
      };

      budgetService['budgets'] = [mockBudget, transportationBudget];

      const progressList = budgetService.getBudgetProgressForAllWithViewPeriod(
        mockTransactions,
        mockCategories,
        { year: 2025, month: 1 }, // February 2025
        'monthly'
      );

      expect(progressList).toHaveLength(2);
      
      // Food budget should have no spending in February
      const foodProgress = progressList.find(p => p.categoryName === 'Food & Dining');
      expect(foodProgress?.actualSpent).toBe(0);
      expect(foodProgress?.budgetAmount).toBe(800);
      
      // Transportation budget should have $120 spending in February
      const transportProgress = progressList.find(p => p.categoryName === 'Transportation');
      expect(transportProgress?.actualSpent).toBe(120);
      expect(transportProgress?.budgetAmount).toBe(400);
    });
  });

  describe('status calculation with different view periods', () => {
    test('status calculation works correctly across different view periods', () => {
      // Create a budget with transactions that will show up in different view periods
      const testBudget: Budget = {
        ...mockBudget,
        amount: 100 // Small monthly budget for testing
      };

      // Create transactions that fall within the first week of January 2025
      const testTransactions: Transaction[] = [
        {
          id: 'test-1',
          date: new Date(2025, 0, 2), // January 2, 2025 (within first week)
          amount: 30,
          description: 'Coffee',
          category: 'Food & Dining',
          account: 'Checking',
          type: 'expense',
          isVerified: true
        },
        {
          id: 'test-2',
          date: new Date(2025, 0, 15), // January 15, 2025 (different week, same month)
          amount: 40,
          description: 'Lunch',
          category: 'Food & Dining',
          account: 'Checking',
          type: 'expense',
          isVerified: true
        }
      ];

      const weeklyProgress = budgetService.calculateBudgetProgressWithViewPeriod(
        testBudget,
        testTransactions,
        mockCategories,
        { year: 2025, month: 0 },
        'weekly'
      );

      const annualProgress = budgetService.calculateBudgetProgressWithViewPeriod(
        testBudget,
        testTransactions,
        mockCategories,
        { year: 2025, month: 0 },
        'annual'
      );

      // Let's check if budget amounts are calculated correctly
      expect(weeklyProgress.budgetAmount).toBeCloseTo(100 / 4.33, 2); // ~23.09
      expect(annualProgress.budgetAmount).toBe(1200); // 100 * 12
      
      // Weekly should only include transactions in the first week (Jan 2)
      expect(weeklyProgress.actualSpent).toBe(30);
      expect(weeklyProgress.transactions).toHaveLength(1);
      
      // Annual should include all transactions
      expect(annualProgress.actualSpent).toBe(70);
      expect(annualProgress.transactions).toHaveLength(2);
      
      // Weekly percentage should be higher than annual percentage
      expect(weeklyProgress.percentage).toBeGreaterThan(annualProgress.percentage);
    });
  });
});