import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';
import { Transaction } from '../types';

describe('Category Drilldown Expense Calculation', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should correctly calculate category totals with refunds (net spending)', async () => {
    // Test the specific scenario from the problem statement:
    // Purchase1: -$400 (expense)
    // Purchase2: -$200 (expense) 
    // Refund: $100 (refund, positive amount)
    // Expected total: 400 + 200 - 100 = 500

    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: -400.00,
        description: 'Purchase 1',
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense'
      },
      {
        date: new Date('2025-01-16'),
        amount: -200.00,
        description: 'Purchase 2',
        category: 'Food & Dining',
        account: 'Credit Card', 
        type: 'expense'
      },
      {
        date: new Date('2025-01-17'),
        amount: 100.00,
        description: 'Refund',
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense' // Refunds are still type 'expense' but with positive amount
      }
    ];

    // Add transactions to the system
    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Get category deep dive data
    const categoryData = await reportsService.getCategoryDeepDive('Food & Dining');
    
    // Verify that the total amount correctly accounts for refunds
    // Should be 400 + 200 - 100 = 500, not 400 + 200 + 100 = 700
    expect(categoryData).toBeDefined();
    expect(categoryData!.totalAmount).toBe(500.00);
    expect(categoryData!.transactionCount).toBe(2); // Only spending transactions (negative amounts) are counted
  });

  it('should correctly calculate monthly trend with refunds', async () => {
    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: -300.00,
        description: 'January Expense',
        category: 'Shopping',
        account: 'Credit Card',
        type: 'expense'
      },
      {
        date: new Date('2025-01-17'),
        amount: 50.00,
        description: 'January Refund',
        category: 'Shopping',
        account: 'Credit Card',
        type: 'expense'
      },
      {
        date: new Date('2025-02-15'),
        amount: -200.00,
        description: 'February Expense',
        category: 'Shopping',
        account: 'Credit Card',
        type: 'expense'
      }
    ];

    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    const categoryData = await reportsService.getCategoryDeepDive('Shopping');
    
    expect(categoryData).toBeDefined();
    
    // Check that monthly trends correctly account for refunds
    const trends = categoryData!.trend;
    
    // January should be 300 - 50 = 250
    const januaryTrend = trends.find(t => t.label.includes('Jan'));
    expect(januaryTrend).toBeDefined();
    expect(januaryTrend!.amount).toBe(250.00);
    
    // February should be 200
    const februaryTrend = trends.find(t => t.label.includes('Feb')); 
    expect(februaryTrend).toBeDefined();
    expect(februaryTrend!.amount).toBe(200.00);
  });

  it('should correctly calculate subcategory totals with refunds', async () => {
    const testTransactions: Partial<Transaction>[] = [
      {
        date: new Date('2025-01-15'),
        amount: -100.00,
        description: 'Coffee Shop',
        category: 'Food & Dining',
        subcategory: 'Coffee',
        account: 'Credit Card',
        type: 'expense'
      },
      {
        date: new Date('2025-01-16'),
        amount: -150.00,
        description: 'Restaurant',
        category: 'Food & Dining',
        subcategory: 'Restaurants',
        account: 'Credit Card',
        type: 'expense'
      },
      {
        date: new Date('2025-01-17'),
        amount: 25.00,
        description: 'Coffee Refund',
        category: 'Food & Dining',
        subcategory: 'Coffee',
        account: 'Credit Card',
        type: 'expense'
      }
    ];

    for (const transaction of testTransactions) {
      await dataService.addTransaction(transaction);
    }

    const categoryData = await reportsService.getCategoryDeepDive('Food & Dining');
    
    expect(categoryData).toBeDefined();
    
    // Total should be (100 + 150) - 25 = 225
    expect(categoryData!.totalAmount).toBe(225.00);
    
    // All transactions should be included in recentTransactions for subcategory processing
    expect(categoryData!.recentTransactions).toHaveLength(3);
    
    // Check that the transactions include both positive and negative amounts
    const amounts = categoryData!.recentTransactions.map(t => t.amount);
    expect(amounts).toContain(-100.00);
    expect(amounts).toContain(-150.00);
    expect(amounts).toContain(25.00);
  });
});