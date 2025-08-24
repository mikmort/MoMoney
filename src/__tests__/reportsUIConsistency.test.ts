import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';
import { Transaction } from '../types';

describe('Reports Page UI Consistency', () => {
  beforeEach(async () => {
    // Clear all existing transactions
    const allTransactions = await dataService.getAllTransactions();
    for (const transaction of allTransactions) {
      await dataService.deleteTransaction(transaction.id);
    }
  });

  test('should show consistent totals between expense summary and category breakdown', async () => {
    // Create transactions that exactly match the problem statement scenario:
    // Rent -$1000, Refund: $100, Rent -$1000
    // Expected: Both should show $1900
    
    const mockTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-01'),
        amount: -1000.00, // First rent payment
        description: 'Rent Payment January',
        category: 'Housing',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-15'),
        amount: 100.00, // Refund (positive amount in expense category)
        description: 'Rental Deposit Refund',
        category: 'Housing',
        account: 'Checking',
        type: 'expense', // Important: still an expense category but positive amount
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-02-01'),
        amount: -1000.00, // Second rent payment
        description: 'Rent Payment February',
        category: 'Housing',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    // Add transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Get the results from both calculation methods
    const spendingByCategory = await reportsService.getSpendingByCategory();
    const incomeExpenseAnalysis = await reportsService.getIncomeExpenseAnalysis();

    // Calculate expected totals: 1000 + 1000 - 100 = 1900
    const expectedTotal = 1900;

    // Check spending by category total  
    const spendingTotal = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
    console.log('📊 Spending by Category total:', spendingTotal);
    console.log('📋 Categories:', spendingByCategory.map(cat => ({ name: cat.categoryName, amount: cat.amount })));
    
    // Check income expense analysis total
    console.log('💰 Income/Expense Analysis total expenses:', incomeExpenseAnalysis.totalExpenses);

    // Verify both methods return the same expected result
    expect(spendingTotal).toBe(expectedTotal);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(expectedTotal);

    // Verify the Housing category shows the correct net amount
    const housingCategory = spendingByCategory.find(cat => cat.categoryName === 'Housing');
    expect(housingCategory?.amount).toBe(expectedTotal);
    
    console.log('✅ Expected total (1000 + 1000 - 100):', expectedTotal);
    console.log('✅ Housing category net spending:', housingCategory?.amount);
  });

  test('should handle multiple categories with refunds correctly', async () => {
    // Test with refunds in multiple categories
    const mockTransactions: Omit<Transaction, 'id'>[] = [
      // Food & Dining with refund
      {
        date: new Date('2024-01-01'),
        amount: -50.00,
        description: 'Restaurant Bill',
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-02'),
        amount: 10.00, // Refund
        description: 'Restaurant Refund',
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      // Transportation with refund  
      {
        date: new Date('2024-01-03'),
        amount: -100.00,
        description: 'Gas Station',
        category: 'Transportation',
        account: 'Debit Card',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-04'),
        amount: 25.00, // Refund
        description: 'Gas Station Refund',
        category: 'Transportation',
        account: 'Debit Card',
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

    // Expected totals: (50 - 10) + (100 - 25) = 40 + 75 = 115
    const expectedTotal = 115;
    const spendingTotal = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);

    console.log('📊 Multi-category refund test:');
    console.log('  Spending by Category total:', spendingTotal);
    console.log('  Income/Expense Analysis total expenses:', incomeExpenseAnalysis.totalExpenses);
    console.log('  Expected:', expectedTotal);
    
    expect(spendingTotal).toBe(expectedTotal);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(expectedTotal);

    // Check individual categories
    const foodCategory = spendingByCategory.find(cat => cat.categoryName === 'Food & Dining');
    const transportationCategory = spendingByCategory.find(cat => cat.categoryName === 'Transportation');
    
    expect(foodCategory?.amount).toBe(40); // 50 - 10
    expect(transportationCategory?.amount).toBe(75); // 100 - 25
    
    console.log('✅ Food & Dining net (50 - 10):', foodCategory?.amount);
    console.log('✅ Transportation net (100 - 25):', transportationCategory?.amount);
  });
});