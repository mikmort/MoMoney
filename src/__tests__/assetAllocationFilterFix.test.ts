import { reportsService } from '../services/reportsService';
import { dataService } from '../services/dataService';
import { userPreferencesService } from '../services/userPreferencesService';
import { Transaction } from '../types';

describe('Asset Allocation Filter Fix', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  const mockTransactions: Transaction[] = [
    // Regular expense
    {
      id: '1',
      date: new Date('2024-01-15'),
      amount: -100.00,
      description: 'Grocery Store',
      category: 'Food & Dining',
      account: 'Checking',
      type: 'expense',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.9
    },
    // Asset allocation transaction
    {
      id: '2',
      date: new Date('2024-01-16'),
      amount: -500.00,
      description: 'Stock Purchase - AAPL',
      category: 'Asset Allocation',
      account: 'Investment',
      type: 'asset-allocation',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.9
    },
    // Regular income
    {
      id: '3',
      date: new Date('2024-01-20'),
      amount: 2000.00,
      description: 'Salary',
      category: 'Salary & Wages',
      account: 'Checking',
      type: 'income',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.9
    }
  ];

  test('should exclude asset-allocation transactions when not explicitly selected', async () => {
    // Set user preference to not include investments in reports
    await userPreferencesService.updatePreferences({
      includeInvestmentsInReports: false
    });

    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test with selectedTypes that does NOT include 'asset-allocation'
    const selectedTypes = ['income', 'expense']; // No 'asset-allocation'
    const spendingResult = await reportsService.getSpendingByCategory(undefined, selectedTypes);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, selectedTypes);
    
    // Should exclude asset-allocation transactions
    const categoryNames = spendingResult.map(cat => cat.categoryName);
    expect(categoryNames).not.toContain('Asset Allocation');
    
    // Calculate expected totals (excluding asset-allocation)
    // Regular expenses only: $100 (grocery)
    // Regular income only: $2000 (salary)
    expect(incomeExpenseResult.totalIncome).toBe(2000);
    expect(incomeExpenseResult.totalExpenses).toBe(100); // Should exclude $500 asset allocation
  });

  test('should include asset-allocation transactions when explicitly selected', async () => {
    // Set user preference to not include investments in reports (should not matter when explicitly selected)
    await userPreferencesService.updatePreferences({
      includeInvestmentsInReports: false
    });

    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test with selectedTypes that INCLUDES 'asset-allocation'
    const selectedTypes = ['income', 'expense', 'asset-allocation'];
    const spendingResult = await reportsService.getSpendingByCategory(undefined, selectedTypes);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, selectedTypes);
    
    // Should include asset-allocation transactions
    const categoryNames = spendingResult.map(cat => cat.categoryName);
    expect(categoryNames).toContain('Asset Allocation');
    
    // Calculate expected totals (including asset-allocation)
    // All expenses: $100 (grocery) + $500 (asset allocation) = $600
    // All income: $2000 (salary)
    expect(incomeExpenseResult.totalIncome).toBe(2000);
    expect(incomeExpenseResult.totalExpenses).toBe(600); // Should include $500 asset allocation
  });

  test('should respect user preference when no selectedTypes specified (legacy behavior)', async () => {
    // Set user preference to not include investments in reports
    await userPreferencesService.updatePreferences({
      includeInvestmentsInReports: false
    });

    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test with legacy behavior (no selectedTypes specified)
    const spendingResult = await reportsService.getSpendingByCategory(undefined, false);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, false);
    
    // Should exclude asset-allocation transactions based on user preference
    const categoryNames = spendingResult.map(cat => cat.categoryName);
    expect(categoryNames).not.toContain('Asset Allocation');
    
    // Calculate expected totals (excluding asset-allocation due to user preference)
    expect(incomeExpenseResult.totalIncome).toBe(2000);
    expect(incomeExpenseResult.totalExpenses).toBe(100); // Should exclude $500 asset allocation
  });
});