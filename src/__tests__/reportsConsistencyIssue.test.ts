import { dataService } from '../services/dataService';
import { reportsService } from '../services/reportsService';
import { Transaction } from '../types';

describe('Reports Consistency Issue', () => {
  beforeEach(async () => {
    // Clear all transactions
    const allTransactions = await dataService.getAllTransactions();
    for (const transaction of allTransactions) {
      await dataService.deleteTransaction(transaction.id);
    }
  });

  test('should show consistent expenses total with rent example from issue', async () => {
    // Create the exact scenario from the problem statement:
    // Rent -$1000
    // Refund: $100
    // Rent -$1000
    // Both values should show $1900 at 'expenses'
    
    const mockTransactions: Omit<Transaction, 'id'>[] = [
      {
        date: new Date('2024-01-15'),
        amount: -1000.00, // Rent (expense)
        description: 'Rent',
        category: 'Housing',
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-16'),
        amount: 100.00, // Refund (positive amount in expense category)
        description: 'Refund',
        category: 'Housing',
        account: 'Checking',
        type: 'expense', // Still expense category but positive amount
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        date: new Date('2024-01-17'),
        amount: -1000.00, // Rent (expense)
        description: 'Rent',
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

    // Get results from both methods
    const spendingByCategory = await reportsService.getSpendingByCategory();
    const incomeExpenseAnalysis = await reportsService.getIncomeExpenseAnalysis();

    // Expected total: 1000 + 1000 - 100 = 1900
    const expectedTotal = 1900;

    // Check spending by category total
    const spendingTotal = spendingByCategory.reduce((sum, cat) => sum + cat.amount, 0);
    console.log('📊 Spending by Category total:', spendingTotal);
    console.log('📋 Categories breakdown:', spendingByCategory.map(cat => ({ name: cat.categoryName, amount: cat.amount })));

    // Check income expense analysis total
    console.log('💰 Income/Expense Analysis total expenses:', incomeExpenseAnalysis.totalExpenses);

    // Both should be $1900
    expect(spendingTotal).toBe(expectedTotal);
    expect(incomeExpenseAnalysis.totalExpenses).toBe(expectedTotal);

    // Verify Housing category shows correct net amount
    const housingCategory = spendingByCategory.find(cat => cat.categoryName === 'Housing');
    expect(housingCategory?.amount).toBe(expectedTotal);
    
    console.log('✅ Housing category net spending:', housingCategory?.amount);
  });
});