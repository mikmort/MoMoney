import { budgetService } from '../services/budgetService';
import { Transaction, Category, Budget } from '../types';

describe('BudgetService Month Navigation', () => {
  const mockCategories: Category[] = [
    {
      id: 'food',
      name: 'Food & Dining',
      type: 'expense',
      subcategories: []
    }
  ];

  const mockTransactions: Transaction[] = [
    {
      id: '1',
      date: new Date(2025, 7, 15), // August 15, 2025
      amount: 50,
      description: 'Grocery Store',
      category: 'Food & Dining',
      account: 'Checking',
      type: 'expense',
      isVerified: true
    },
    {
      id: '2', 
      date: new Date(2025, 8, 10), // September 10, 2025
      amount: 75,
      description: 'Restaurant',
      category: 'Food & Dining',
      account: 'Credit Card',
      type: 'expense',
      isVerified: true
    }
  ];

  const mockBudget: Budget = {
    id: 'test-budget-1',
    name: 'Food Budget',
    categoryId: 'food',
    amount: 800,
    period: 'monthly',
    startDate: new Date(2025, 7, 1), // August 1, 2025
    isActive: true,
    alertThreshold: 80
  };

  beforeEach(() => {
    // Create a fresh budget for testing
    budgetService['budgets'] = [mockBudget];
  });

  test('calculateBudgetProgress works with specific month parameter', () => {
    // Test August 2025 (month index 7)
    const augustProgress = budgetService.calculateBudgetProgress(
      mockBudget,
      mockTransactions,
      mockCategories,
      { year: 2025, month: 7 }
    );

    expect(augustProgress.actualSpent).toBe(50); // Only August transaction
    expect(augustProgress.percentage).toBe(6.25); // 50/800 * 100
    expect(augustProgress.transactions).toHaveLength(1);
    expect(augustProgress.transactions[0].description).toBe('Grocery Store');

    // Test September 2025 (month index 8)
    const septemberProgress = budgetService.calculateBudgetProgress(
      mockBudget,
      mockTransactions,
      mockCategories,
      { year: 2025, month: 8 }
    );

    expect(septemberProgress.actualSpent).toBe(75); // Only September transaction
    expect(septemberProgress.percentage).toBe(9.38); // 75/800 * 100
    expect(septemberProgress.transactions).toHaveLength(1);
    expect(septemberProgress.transactions[0].description).toBe('Restaurant');
  });

  test('getBudgetProgressForAll accepts month parameter', () => {
    const progress = budgetService.getBudgetProgressForAll(
      mockTransactions,
      mockCategories,
      { year: 2025, month: 7 }
    );

    expect(progress).toHaveLength(1);
    expect(progress[0].actualSpent).toBe(50);
    expect(progress[0].transactions).toHaveLength(1);
  });

  test('budget progress includes transactions array', () => {
    const progress = budgetService.calculateBudgetProgress(
      mockBudget,
      mockTransactions,
      mockCategories,
      { year: 2025, month: 7 }
    );

    expect(progress).toHaveProperty('transactions');
    expect(Array.isArray(progress.transactions)).toBe(true);
    expect(progress.transactions).toHaveLength(1);
  });
});