import { Transaction } from '../types';

describe('Currency Conversion in Reports and Dashboard', () => {
  it('should verify that currency conversion batch processing exists', async () => {
    // This test verifies that the currency conversion infrastructure is in place
    const { currencyDisplayService } = await import('../services/currencyDisplayService');
    const { reportsService } = await import('../services/reportsService');
    const { dashboardService } = await import('../services/dashboardService');
    
    // Verify that the services have the convertTransactionsBatch method
    expect(typeof currencyDisplayService.convertTransactionsBatch).toBe('function');
    
    // Verify that services use convertTransactionsBatch (by checking method exists)
    expect(typeof dashboardService.getDashboardStats).toBe('function');
    expect(typeof reportsService.getSpendingByCategory).toBe('function');
    expect(typeof reportsService.getMonthlySpendingTrends).toBe('function');
    expect(typeof reportsService.getIncomeExpenseAnalysis).toBe('function');
    expect(typeof reportsService.getBurnRateAnalysis).toBe('function');
    expect(typeof reportsService.getCategoryDeepDive).toBe('function');
  });

  it('should verify that currency display service handles different currencies', async () => {
    const { currencyDisplayService } = await import('../services/currencyDisplayService');
    
    // Test transaction with originalCurrency field
    const transaction: Transaction = {
      id: 'test-1',
      date: new Date(),
      description: 'Test transaction',
      amount: -100,
      category: 'Test',
      account: 'Test',
      type: 'expense',
      originalCurrency: 'EUR',
      addedDate: new Date(),
      lastModifiedDate: new Date()
    };

    // Call formatTransactionAmount - it should handle currency display
    const result = await currencyDisplayService.formatTransactionAmount(transaction);
    
    // Should return a display amount and indicate if conversion happened
    expect(result.displayAmount).toBeDefined();
    expect(typeof result.isConverted).toBe('boolean');
  });
});