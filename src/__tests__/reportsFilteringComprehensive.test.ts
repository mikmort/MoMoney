/**
 * Comprehensive test to validate that Reports filtering works correctly
 * Tests both individual filters and combined filters
 */
import { dataService } from '../services/dataService';
import { reportsService, ReportsFilters } from '../services/reportsService';
import { Transaction } from '../types';

describe('Reports Comprehensive Filtering Tests', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  const createTestTransactions = async () => {
    const testTransactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        amount: -100.00,
        description: 'Grocery Store',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        amount: -50.00,
        description: 'Gas Station',
        category: 'Transportation',
        account: 'Chase Credit',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.8
      },
      {
        id: 'tx-3',
        date: new Date('2024-01-17'),
        amount: -25.00,
        description: 'Coffee',
        category: 'Food & Dining',
        account: 'Chase Credit',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.7
      },
      {
        id: 'tx-4',
        date: new Date('2024-01-18'),
        amount: 3000.00,
        description: 'Salary',
        category: 'Salary & Wages',
        account: 'Chase Checking',
        type: 'income' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'tx-5',
        date: new Date('2024-01-19'),
        amount: -75.00,
        description: 'Restaurant',
        category: 'Food & Dining',
        account: 'Wells Fargo',
        type: 'expense' as const,
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.85
      }
    ];

    await dataService.addTransactions(testTransactions);
    return testTransactions;
  };

  test('should filter by category only', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedCategories: ['Food & Dining']
    };

    const categoryData = await reportsService.getSpendingByCategory(filters);
    
    // Should only have Food & Dining category
    expect(categoryData).toHaveLength(1);
    expect(categoryData[0].categoryName).toBe('Food & Dining');
    expect(categoryData[0].amount).toBe(200.00); // 100 + 25 + 75
    expect(categoryData[0].transactionCount).toBe(3);

    console.log('✅ Category-only filtering works');
  });

  test('should filter by account only', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedAccounts: ['Chase Checking']
    };

    const categoryData = await reportsService.getSpendingByCategory(filters);
    
    // Should only have transactions from Chase Checking (just the Grocery Store)
    expect(categoryData).toHaveLength(1);
    expect(categoryData[0].categoryName).toBe('Food & Dining');
    expect(categoryData[0].amount).toBe(100.00);
    expect(categoryData[0].transactionCount).toBe(1);

    console.log('✅ Account-only filtering works');
  });

  test('should filter by both category and account', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedCategories: ['Food & Dining'],
      selectedAccounts: ['Chase Credit']
    };

    const categoryData = await reportsService.getSpendingByCategory(filters);
    
    // Should only have Food & Dining from Chase Credit (just the Coffee)
    expect(categoryData).toHaveLength(1);
    expect(categoryData[0].categoryName).toBe('Food & Dining');
    expect(categoryData[0].amount).toBe(25.00);
    expect(categoryData[0].transactionCount).toBe(1);

    console.log('✅ Combined category and account filtering works');
  });

  test('should work with monthly trends filtering', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedCategories: ['Food & Dining']
    };

    const trendsData = await reportsService.getMonthlySpendingTrends(filters);
    
    // Should have data for January 2024
    expect(trendsData).toHaveLength(1);
    expect(trendsData[0].month).toBe('Jan 2024');
    expect(trendsData[0].totalSpending).toBe(200.00); // Only Food & Dining expenses
    expect(trendsData[0].totalIncome).toBe(0); // No income in expense filter

    console.log('✅ Monthly trends filtering works');
  });

  test('should work with income/expense analysis filtering', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense', 'income'],
      selectedAccounts: ['Chase Checking']
    };

    const analysisData = await reportsService.getIncomeExpenseAnalysis(filters);
    
    // Should only include transactions from Chase Checking
    expect(analysisData.totalIncome).toBe(3000.00); // Salary
    expect(analysisData.totalExpenses).toBe(100.00); // Grocery Store
    expect(analysisData.netIncome).toBe(2900.00); // 3000 - 100
    expect(analysisData.savingsRate).toBeCloseTo(96.67, 2); // (2900/3000)*100

    console.log('✅ Income/expense analysis filtering works');
  });

  test('should handle no results gracefully', async () => {
    await createTestTransactions();

    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedCategories: ['NonExistent Category']
    };

    const categoryData = await reportsService.getSpendingByCategory(filters);
    
    // Should return empty array when no matches
    expect(categoryData).toHaveLength(0);

    console.log('✅ No results handled gracefully');
  });

  test('should validate unique categories and accounts are available', async () => {
    await createTestTransactions();

    const categories = await dataService.getUniqueCategories();
    const accounts = await dataService.getUniqueAccounts();

    // Verify all expected categories and accounts are found
    expect(categories).toContain('Food & Dining');
    expect(categories).toContain('Transportation');
    expect(categories).toContain('Salary & Wages');
    
    expect(accounts).toContain('Chase Checking');
    expect(accounts).toContain('Chase Credit');
    expect(accounts).toContain('Wells Fargo');

    console.log('✅ Unique categories and accounts available for filtering');
  });
});