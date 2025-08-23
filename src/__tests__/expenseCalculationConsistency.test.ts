import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';
import { Transaction } from '../types';

describe('Expense Calculation Consistency', () => {
  beforeEach(async () => {
    // Clear all transactions
    const allTransactions = await dataService.getAllTransactions();
    for (const transaction of allTransactions) {
      await dataService.deleteTransaction(transaction.id);
    }
  });

  test('should calculate expenses consistently across all report methods', async () => {
    // Add test transactions: 2 expenses and 1 refund
    const mockTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: -400.00, // Purchase (expense)
        description: 'Purchase 1',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-16'),
        amount: -200.00, // Purchase (expense)
        description: 'Purchase 2',
        category: 'Transportation',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-17'),
        amount: 100.00, // Refund (should reduce total expenses)
        description: 'Refund',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense', // Still classified as expense category but positive amount
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    // Add transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Get results from different methods
    const spendingByCategory = await reportsService.getSpendingByCategory();
    const incomeExpenseAnalysis = await reportsService.getIncomeExpenseAnalysis();
    const burnRateAnalysis = await reportsService.getBurnRateAnalysis();

    // Calculate expected total: 400 + 200 - 100 = 500
    const expectedTotal = 500;

    // Spending by Category should be correct (this is our reference)
    const spendingTotal = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
    expect(spendingTotal).toBe(expectedTotal);
    console.log('✅ Spending by Category total:', spendingTotal);

    // Income/Expense Analysis should match
    console.log('🔍 Income/Expense Analysis total expenses:', incomeExpenseAnalysis.totalExpenses);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(expectedTotal);

    // Burn Rate Analysis should match
    console.log('🔍 Burn Rate Analysis daily burn rate:', burnRateAnalysis.dailyBurnRate);
    // Calculate expected daily rate based on span of dates (latest - earliest)
    // Transactions: Jan 15, Jan 16, Jan 17 -> span is 2 days (17-15)  
    const expectedDailyRate = expectedTotal / 2; // 2 days span
    expect(burnRateAnalysis.dailyBurnRate).toBeCloseTo(expectedDailyRate, 1);

    // Also verify individual category totals handle refunds correctly
    const foodDiningCategory = spendingByCategory.find(cat => cat.categoryName === 'Food & Dining');
    const transportationCategory = spendingByCategory.find(cat => cat.categoryName === 'Transportation');
    
    expect(foodDiningCategory?.amount).toBe(300); // 400 - 100 = 300
    expect(transportationCategory?.amount).toBe(200); // 200
    
    console.log('✅ Food & Dining net spending (400 - 100):', foodDiningCategory?.amount);
    console.log('✅ Transportation net spending:', transportationCategory?.amount);
  });

  test('should handle negative refunds (larger than original purchase) correctly', async () => {
    // Test edge case: refund larger than purchase
    const mockTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: -100.00, // Purchase
        description: 'Small Purchase',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-16'),
        amount: 200.00, // Large refund (bigger than purchase)
        description: 'Large Refund',
        category: 'Food & Dining',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const spendingByCategory = await reportsService.getSpendingByCategory();
    const incomeExpenseAnalysis = await reportsService.getIncomeExpenseAnalysis();

    // Net should be negative: 100 - 200 = -100 (net income from that category)
    const expectedTotal = -100;
    const spendingTotal = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
    
    expect(spendingTotal).toBe(expectedTotal);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(expectedTotal);

    console.log('✅ Net result with large refund:', spendingTotal);
  });
});