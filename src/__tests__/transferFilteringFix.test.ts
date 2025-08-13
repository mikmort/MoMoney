import { reportsService } from '../services/reportsService';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Transfer Filtering Fix - Include Internal Transfers Checkbox', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  const mockTransactions: Transaction[] = [
    // Regular expense
    {
      id: '1',
      date: new Date('2024-01-15'),
      amount: -50.00,
      description: 'Grocery Store',
      category: 'Food & Dining',
      account: 'Checking',
      type: 'expense',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.9
    },
    // Regular income
    {
      id: '2',
      date: new Date('2024-01-20'),
      amount: 2500.00,
      description: 'Salary',
      category: 'Salary & Wages',
      account: 'Checking',
      type: 'income',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.95
    },
    // Transfer with correct type
    {
      id: '3',
      date: new Date('2024-01-16'),
      amount: -100.00,
      description: 'Transfer to Savings',
      category: 'Internal Transfer',
      account: 'Checking',
      type: 'transfer',
      addedDate: new Date(),
      isVerified: true,
      confidence: 1.0
    },
    // Transfer with correct type (receiving side)
    {
      id: '4',
      date: new Date('2024-01-16'),
      amount: 100.00,
      description: 'Transfer from Checking',
      category: 'Internal Transfer',
      account: 'Savings',
      type: 'transfer',
      addedDate: new Date(),
      isVerified: true,
      confidence: 1.0
    },
    // PROBLEM CASE 1: Transaction with transfer category but wrong type
    {
      id: '5',
      date: new Date('2024-01-17'),
      amount: -200.00,
      description: 'Online Transfer to Savings Account',
      category: 'Internal Transfer', // This indicates it's a transfer
      account: 'Checking',
      type: 'expense', // But type is wrong - should be filtered out
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.8
    },
    // PROBLEM CASE 2: Transaction with transfer description but wrong category and type
    {
      id: '6',
      date: new Date('2024-01-18'),
      amount: -75.00,
      description: 'Transfer to checking from savings',
      category: 'Miscellaneous', // Wrong category
      account: 'Savings',
      type: 'expense', // Wrong type
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.7
    },
    // PROBLEM CASE 3: ATM withdrawal that should be considered a transfer
    {
      id: '7',
      date: new Date('2024-01-19'),
      amount: -40.00,
      description: 'ATM Withdrawal - Chase ATM',
      category: 'Banking', // Wrong category
      account: 'Checking',
      type: 'expense', // Wrong type
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.6
    },
    // Regular expense for comparison
    {
      id: '8',
      date: new Date('2024-01-21'),
      amount: -30.00,
      description: 'Gas Station',
      category: 'Transportation',
      account: 'Credit Card',
      type: 'expense',
      addedDate: new Date(),
      isVerified: true,
      confidence: 0.85
    }
  ];

  test('should identify all internal transfers when checkbox is unchecked (exclude transfers)', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test with transfers excluded (checkbox unchecked)
    const spendingResult = await reportsService.getSpendingByCategory(undefined, false);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, false);
    
    // Should exclude ALL transfers, including the problematic ones
    const categoryNames = spendingResult.map(cat => cat.categoryName);
    expect(categoryNames).not.toContain('Internal Transfer');
    
    // Calculate expected totals (only non-transfer transactions)
    // Regular expenses: $50 (grocery) + $30 (gas) = $80
    // Regular income: $2500 (salary)
    expect(incomeExpenseResult.totalIncome).toBe(2500);
    expect(incomeExpenseResult.totalExpenses).toBe(80); // Should exclude ALL transfer-like transactions
    
    // Verify specific exclusions
    const totalTransactionsInReports = spendingResult.reduce((sum, cat) => sum + cat.transactionCount, 0);
    
    // Should only include 3 transactions: grocery ($50), gas ($30), and for income analysis salary ($2500)
    // Note: spending by category only counts expenses, so 2 transactions (grocery + gas)
    expect(totalTransactionsInReports).toBe(2);
  });

  test('should include all internal transfers when checkbox is checked (include transfers)', async () => {
    // Add mock transactions  
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // Test with transfers included (checkbox checked)
    const spendingResult = await reportsService.getSpendingByCategory(undefined, true);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, true);
    
    // Should include transfers
    const categoryNames = spendingResult.map(cat => cat.categoryName);
    expect(categoryNames).toContain('Internal Transfer');
    
    // Should include ALL transactions now
    // All expenses: $50 + $30 + $100 + $200 + $75 + $40 = $495 (negative transfers counted as expenses)
    // All income: $2500 + $100 = $2600 (positive transfers counted as income)
    expect(incomeExpenseResult.totalIncome).toBe(2600);
    expect(incomeExpenseResult.totalExpenses).toBe(495);
  });

  test('current implementation (after fix) - should demonstrate proper transfer filtering', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    // The implementation should now properly filter out problematic transfers
    const spendingResult = await reportsService.getSpendingByCategory(undefined, false);
    const incomeExpenseResult = await reportsService.getIncomeExpenseAnalysis(undefined, false);
    
    // This test validates the fixed behavior
    // Fixed behavior: should exclude problematic transfers
    // Regular expenses: $50 (grocery) + $30 (gas) = $80
    // Problematic "transfers" are now properly filtered out: $200 + $75 + $40 = excluded
    // Total should be exactly $80 (fixed behavior)
    
    // This test now passes after the fix is implemented
    expect(incomeExpenseResult.totalExpenses).toBe(80); // Shows the fix is working
  });
});