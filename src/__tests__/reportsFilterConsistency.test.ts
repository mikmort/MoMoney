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

  it('should handle mixed categories and multiple expense types consistently', async () => {
    // Test a more complex scenario with mixed categories including non-expense categories
    const testTransactions: Partial<Transaction>[] = [
      // Housing expenses (expense category)
      {
        date: new Date('2025-01-15'),
        amount: -1200.00,
        description: 'Rent Payment',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      {
        date: new Date('2025-01-16'),
        amount: 150.00, // Refund in Housing
        description: 'Utility Refund',
        category: 'Housing',
        account: 'Chase Checking',
        type: 'expense'
      },
      // Food expenses (expense category)
      {
        date: new Date('2025-01-17'),
        amount: -75.00,
        description: 'Groceries',
        category: 'Food & Dining',
        account: 'Chase Checking',
        type: 'expense'
      },
      // Income transaction (should not appear in expense reports)
      {
        date: new Date('2025-01-18'),
        amount: 3000.00,
        description: 'Salary',
        category: 'Salary & Wages',
        account: 'Chase Checking',
        type: 'income'
      },
      // Transfer transaction (should not appear in expense reports by default)
      {
        date: new Date('2025-01-19'),
        amount: -500.00,
        description: 'Transfer to Savings',
        category: 'Internal Transfer',
        account: 'Chase Checking',
        type: 'transfer'
      },
      // Asset allocation (should not appear in expense reports by default)  
      {
        date: new Date('2025-01-20'),
        amount: -1000.00,
        description: 'Investment Purchase',
        category: 'Asset Allocation',
        account: 'Investment Account',
        type: 'asset-allocation'
      }
    ];

    // Add transactions to the system
    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test unfiltered spending by category - should only show expense categories
    const allSpendingByCategory = await reportsService.getSpendingByCategory();
    
    console.log('All spending categories found:', allSpendingByCategory.map(c => `${c.categoryName}: ${c.amount}`));
    
    // Should only contain Housing and Food & Dining (expense categories)
    // Should NOT contain Salary & Wages, Internal Transfer, or Asset Allocation  
    const categoryNames = allSpendingByCategory.map(c => c.categoryName);
    expect(categoryNames).toContain('Housing');
    expect(categoryNames).toContain('Food & Dining');
    expect(categoryNames).not.toContain('Salary & Wages');
    expect(categoryNames).not.toContain('Internal Transfer');
    expect(categoryNames).not.toContain('Asset Allocation');
    
    // Verify Housing amount: 1200 - 150 = 1050
    const housingCategory = allSpendingByCategory.find(c => c.categoryName === 'Housing');
    expect(housingCategory?.amount).toBe(1050.00);
    
    // Verify Food & Dining amount: 75  
    const foodCategory = allSpendingByCategory.find(c => c.categoryName === 'Food & Dining');
    expect(foodCategory?.amount).toBe(75.00);

    // Now test filtering by specific categories
    const housingFilter: ReportsFilters = {
      selectedCategories: ['Housing'],
      selectedTypes: ['expense']
    };
    
    const filteredHousing = await reportsService.getSpendingByCategory(housingFilter);
    expect(filteredHousing).toHaveLength(1);
    expect(filteredHousing[0].categoryName).toBe('Housing');
    expect(filteredHousing[0].amount).toBe(1050.00); // Same as unfiltered

    // Test filtering by multiple categories
    const multiFilter: ReportsFilters = {
      selectedCategories: ['Housing', 'Food & Dining'],  
      selectedTypes: ['expense']
    };
    
    const filteredMulti = await reportsService.getSpendingByCategory(multiFilter);
    expect(filteredMulti).toHaveLength(2);
    
    const filteredHousingMulti = filteredMulti.find(c => c.categoryName === 'Housing');
    const filteredFoodMulti = filteredMulti.find(c => c.categoryName === 'Food & Dining');
    
    expect(filteredHousingMulti?.amount).toBe(1050.00); // Same as individual filter
    expect(filteredFoodMulti?.amount).toBe(75.00); // Same as individual filter

    console.log('✅ Mixed categories handled correctly with consistent filtering');
  });

  it('should handle edge case where user filters by non-expense categories', async () => {
    // Test what happens when user explicitly filters by income categories
    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: 3000.00,
        description: 'Salary Payment',
        category: 'Salary & Wages',
        account: 'Chase Checking',
        type: 'income'
      },
      {
        date: new Date('2025-01-16'),
        amount: -100.00,
        description: 'Groceries',
        category: 'Food & Dining', 
        account: 'Chase Checking',
        type: 'expense'
      }
    ];

    // Add transactions to the system
    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test filtering by income category in spending reports
    const incomeFilter: ReportsFilters = {
      selectedCategories: ['Salary & Wages'],
      selectedTypes: ['expense'] // User selected expense types but income category
    };
    
    const filteredSpending = await reportsService.getSpendingByCategory(incomeFilter);
    
    // The fixed implementation should exclude non-expense categories 
    // even when explicitly filtered
    console.log('Filtered spending with income category:', filteredSpending);
    
    // Should NOT include the income category in spending reports
    const salaryCategory = filteredSpending.find(c => c.categoryName === 'Salary & Wages');
    expect(salaryCategory).toBeUndefined();
    
    // The result should be empty since 'Salary & Wages' is not an expense category
    expect(filteredSpending).toHaveLength(0);
    
    console.log('✅ Income category correctly excluded from spending report');

    // Test filtering by a mix of expense and income categories
    const mixedFilter: ReportsFilters = {
      selectedCategories: ['Salary & Wages', 'Food & Dining'], // Income + Expense
      selectedTypes: ['expense']
    };
    
    const mixedFilteredSpending = await reportsService.getSpendingByCategory(mixedFilter);
    
    // Should only include the expense category (Food & Dining)
    expect(mixedFilteredSpending).toHaveLength(1);
    expect(mixedFilteredSpending[0].categoryName).toBe('Food & Dining');
    expect(mixedFilteredSpending[0].amount).toBe(100.00);
    
    // Should NOT include the income category
    const mixedSalaryCategory = mixedFilteredSpending.find(c => c.categoryName === 'Salary & Wages');
    expect(mixedSalaryCategory).toBeUndefined();
    
    console.log('✅ Mixed filter correctly includes only expense categories');
  });
});