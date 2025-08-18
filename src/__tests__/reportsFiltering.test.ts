/**
 * Simple test to validate basic reportsService methods work with new filters
 */
import { dataService } from '../services/dataService';
import { reportsService, ReportsFilters } from '../services/reportsService';
import { Transaction } from '../types';

describe('ReportsService Basic Tests', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  test('should get spending by category with new ReportsFilters interface', async () => {
    // Create test transactions
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
      }
    ];

    await dataService.addTransactions(testTransactions);

    // Test new ReportsFilters interface
    const filters: ReportsFilters = {
      selectedTypes: ['expense'],
      selectedCategories: ['Food & Dining']
    };

    const categoryData = await reportsService.getSpendingByCategory(filters);
    
    expect(categoryData).toHaveLength(1);
    expect(categoryData[0].categoryName).toBe('Food & Dining');
    expect(categoryData[0].amount).toBe(100.00);

    console.log('✅ ReportsService new filtering works correctly');
  });
});