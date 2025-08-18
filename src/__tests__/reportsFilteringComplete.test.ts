/**
 * Comprehensive test for reports filtering functionality
 * Tests that category and account filters are properly applied to all report metrics
 */

import { dataService } from '../services/dataService';
import { reportsService, ReportsFilters } from '../services/reportsService';
import { Transaction } from '../types';

describe('Complete Reports Filtering', () => {
  beforeEach(async () => {
    // Clear all transactions before each test
    await dataService.clearAllData();
  });

  const createTestData = async (): Promise<Transaction[]> => {
    const mockTransactions: Transaction[] = [
      // Food & Dining transactions - Chase Checking
      {
        id: '1',
        date: new Date('2024-01-15'),
        amount: -150.00,
        description: 'Restaurant ABC',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        id: '2', 
        date: new Date('2024-01-20'),
        amount: -75.00,
        description: 'Grocery Store',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      // Transportation - Chase Credit
      {
        id: '3',
        date: new Date('2024-01-10'),
        amount: -80.00,
        description: 'Gas Station',
        category: 'Transportation',
        account: 'Chase Credit',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      // Housing - Wells Fargo
      {
        id: '4',
        date: new Date('2024-01-01'),
        amount: -1200.00,
        description: 'Rent Payment',
        category: 'Housing',
        account: 'Wells Fargo',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      // Income - Chase Checking
      {
        id: '5',
        date: new Date('2024-01-31'),
        amount: 3000.00,
        description: 'Salary',
        category: 'Salary & Wages',
        account: 'Chase Checking',
        type: 'income',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    // Add all transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    return mockTransactions;
  };

  test('should filter spending by category across all metrics', async () => {
    await createTestData();

    // Create filters for only Food & Dining category
    const filters: ReportsFilters = {
      selectedCategories: ['Food & Dining'],
      selectedTypes: ['expense']
    };

    // Test all the metrics that should be filtered
    const [
      spendingByCategory,
      monthlyTrends,
      incomeExpenseAnalysis,
      burnRateAnalysis
    ] = await Promise.all([
      reportsService.getSpendingByCategory(filters),
      reportsService.getMonthlySpendingTrends(filters),
      reportsService.getIncomeExpenseAnalysis(filters),
      reportsService.getBurnRateAnalysis(filters)
    ]);

    // Spending by Category should only include Food & Dining
    expect(spendingByCategory).toHaveLength(1);
    expect(spendingByCategory[0].categoryName).toBe('Food & Dining');
    expect(spendingByCategory[0].amount).toBe(225.00); // 150 + 75

    // Monthly trends should only reflect Food & Dining expenses
    expect(monthlyTrends).toHaveLength(1);
    expect(monthlyTrends[0].totalSpending).toBe(225.00);
    expect(monthlyTrends[0].totalIncome).toBe(0); // No income in expense filter

    // Income/Expense Analysis should only include Food & Dining
    expect(incomeExpenseAnalysis.totalExpenses).toBe(225.00);
    expect(incomeExpenseAnalysis.totalIncome).toBe(0); // Only expense type selected

    // Burn Rate Analysis should be based on filtered data
    expect(burnRateAnalysis.dailyBurnRate).toBeGreaterThan(0);
    expect(burnRateAnalysis.monthlyBurnRate).toBeGreaterThan(0);

    console.log('✅ Category filtering works for all spending metrics');
  });

  test('should filter spending by account across all metrics', async () => {
    await createTestData();

    // Create filters for only Chase Checking account
    const filters: ReportsFilters = {
      selectedAccounts: ['Chase Checking'],
      selectedTypes: ['expense']
    };

    const [
      spendingByCategory,
      monthlyTrends,
      incomeExpenseAnalysis,
      burnRateAnalysis
    ] = await Promise.all([
      reportsService.getSpendingByCategory(filters),
      reportsService.getMonthlySpendingTrends(filters),
      reportsService.getIncomeExpenseAnalysis(filters),
      reportsService.getBurnRateAnalysis(filters)
    ]);

    // Should only include Food & Dining from Chase Checking (not Transportation from Chase Credit)
    expect(spendingByCategory).toHaveLength(1);
    expect(spendingByCategory[0].categoryName).toBe('Food & Dining');
    expect(spendingByCategory[0].amount).toBe(225.00);

    // Monthly trends should reflect only Chase Checking expenses
    expect(monthlyTrends[0].totalSpending).toBe(225.00);

    // Income/Expense Analysis should only include Chase Checking
    expect(incomeExpenseAnalysis.totalExpenses).toBe(225.00);

    // Burn Rate Analysis should be based on Chase Checking data only
    expect(burnRateAnalysis.dailyBurnRate).toBeGreaterThan(0);

    console.log('✅ Account filtering works for all spending metrics');
  });

  test('should filter income by category and account', async () => {
    await createTestData();

    // Test income filtering by category and account
    const filters: ReportsFilters = {
      selectedCategories: ['Salary & Wages'],
      selectedAccounts: ['Chase Checking'],
      selectedTypes: ['income']
    };

    const [
      monthlyTrends,
      incomeExpenseAnalysis,
      incomeByCategory
    ] = await Promise.all([
      reportsService.getMonthlySpendingTrends(filters),
      reportsService.getIncomeExpenseAnalysis(filters),
      reportsService.getIncomeByCategory(filters)
    ]);

    // Monthly trends should only show income from filtered criteria
    expect(monthlyTrends[0].totalIncome).toBe(3000.00);
    expect(monthlyTrends[0].totalSpending).toBe(0); // No expenses in income filter

    // Income/Expense Analysis should only include filtered income
    expect(incomeExpenseAnalysis.totalIncome).toBe(3000.00);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(0);

    // Income by Category should only show filtered category
    expect(incomeByCategory).toHaveLength(1);
    expect(incomeByCategory[0].categoryName).toBe('Salary & Wages');
    expect(incomeByCategory[0].amount).toBe(3000.00);

    console.log('✅ Category and account filtering works for all income metrics');
  });

  test('should handle combined category and account filtering', async () => {
    await createTestData();

    // Filter by both category and account
    const filters: ReportsFilters = {
      selectedCategories: ['Food & Dining'],
      selectedAccounts: ['Chase Checking'],
      selectedTypes: ['expense']
    };

    const spendingByCategory = await reportsService.getSpendingByCategory(filters);
    
    // Should only include Food & Dining transactions from Chase Checking
    expect(spendingByCategory).toHaveLength(1);
    expect(spendingByCategory[0].categoryName).toBe('Food & Dining');
    expect(spendingByCategory[0].amount).toBe(225.00);

    console.log('✅ Combined category and account filtering works');
  });

  test('should handle empty filter results gracefully', async () => {
    await createTestData();

    // Filter for non-existent category
    const filters: ReportsFilters = {
      selectedCategories: ['Non-Existent Category'],
      selectedTypes: ['expense']
    };

    const [
      spendingByCategory,
      monthlyTrends,
      incomeExpenseAnalysis,
      burnRateAnalysis
    ] = await Promise.all([
      reportsService.getSpendingByCategory(filters),
      reportsService.getMonthlySpendingTrends(filters),
      reportsService.getIncomeExpenseAnalysis(filters),
      reportsService.getBurnRateAnalysis(filters)
    ]);

    // All should return empty/zero results
    expect(spendingByCategory).toHaveLength(0);
    expect(monthlyTrends).toHaveLength(0);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(0);
    expect(incomeExpenseAnalysis.totalIncome).toBe(0);
    expect(burnRateAnalysis.dailyBurnRate).toBe(0);

    console.log('✅ Empty filter results handled gracefully');
  });
});