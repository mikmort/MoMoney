import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';
import { Transaction, ReportsFilters } from '../types';

describe('Reports Filter Consistency', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should show same amount when filtering by single category as in spending by category', async () => {
    // Create test transactions for Housing category as mentioned in the problem statement
    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: -1000.00,
        description: 'Mortgage Payment',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-16'),
        amount: -1000.00,
        description: 'Mortgage Payment 2',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-17'),
        amount: -200.00,
        description: 'Utilities',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-18'),
        amount: 100.00, // Positive amount - refund
        description: 'Housing Refund',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense' // Still expense type but positive amount
      },
      // Add a transaction from another category to ensure filtering works
      {
        date: new Date('2025-01-19'),
        amount: -50.00,
        description: 'Coffee',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense'
      }
    ];

    // Add transactions to the system
    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Get spending by category (unfiltered) - should show all categories
    const allSpendingByCategory = await reportsService.getSpendingByCategory();
    
    // Find Housing category in the results
    const housingCategoryUnfiltered = allSpendingByCategory.find(c => c.categoryName === 'Housing');
    expect(housingCategoryUnfiltered).toBeDefined();
    
    // Expected calculation: 1000 + 1000 + 200 + (-100) = 2100
    // Using the new logic: (-(-1000)) + (-(-1000)) + (-(-200)) + (-(100)) = 1000 + 1000 + 200 + (-100) = 2100
    console.log('Housing category unfiltered amount:', housingCategoryUnfiltered!.amount);
    expect(housingCategoryUnfiltered!.amount).toBe(2100.00);

    // Now filter by Housing category only
    const housingFilter: ReportsFilters = {
      selectedCategories: ['Housing'],
      selectedTypes: ['expense']
    };

    const filteredSpendingByCategory = await reportsService.getSpendingByCategory(housingFilter);
    
    // Should only have Housing category
    expect(filteredSpendingByCategory).toHaveLength(1);
    expect(filteredSpendingByCategory[0].categoryName).toBe('Housing');
    
    // The amount should be exactly the same as in the unfiltered version
    console.log('Housing category filtered amount:', filteredSpendingByCategory[0].amount);
    expect(filteredSpendingByCategory[0].amount).toBe(2100.00);
    
    // Should match the unfiltered amount exactly
    expect(filteredSpendingByCategory[0].amount).toBe(housingCategoryUnfiltered!.amount);

    console.log('✅ Category filtering consistency verified');
  });

  it('should properly handle positive expenses (refunds) in category filtering', async () => {
    // Test the specific scenario from the problem statement more directly
    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: -1000.00,
        description: 'Mortgage',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-16'),
        amount: -1000.00,
        description: 'Mortgage',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-17'),
        amount: -200.00,
        description: 'Utilities',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-18'),
        amount: 100.00, // Positive amount - should be treated as "negative expense"
        description: 'Refund',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      }
    ];

    // Add transactions to the system
    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test unfiltered spending by category
    const allSpendingByCategory = await reportsService.getSpendingByCategory();
    const housingCategory = allSpendingByCategory.find(c => c.categoryName === 'Housing');
    
    expect(housingCategory).toBeDefined();
    
    // Should show: 1000 + 1000 + 200 + (-100) = 2100, NOT 2300
    expect(housingCategory!.amount).toBe(2100.00);
    
    // Test filtered spending by category
    const housingFilter: ReportsFilters = {
      selectedCategories: ['Housing']
    };
    
    const filteredSpendingByCategory = await reportsService.getSpendingByCategory(housingFilter);
    expect(filteredSpendingByCategory).toHaveLength(1);
    expect(filteredSpendingByCategory[0].amount).toBe(2100.00);

    console.log('✅ Positive expenses (refunds) handled correctly: $2100, not $2300');
  });
});