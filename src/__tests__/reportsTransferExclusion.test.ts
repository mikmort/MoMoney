import { reportsService } from '../services/reportsService';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Reports Transfer Exclusion', () => {
  beforeEach(() => {
    // Clear all data before each test
    dataService.clearAllData();
  });

  const mockTransactions: Transaction[] = [
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
    {
      id: '2',
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
    {
      id: '3',
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
    {
      id: '4',
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
    {
      id: '5',
      date: new Date('2024-01-25'),
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

  test('should exclude transfers by default in spending by category', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getSpendingByCategory();
    
    // Should only include expense transactions, not transfers
    expect(result).toHaveLength(2);
    
    const categoryNames = result.map(cat => cat.categoryName);
    expect(categoryNames).toContain('Food & Dining');
    expect(categoryNames).toContain('Transportation');
    expect(categoryNames).not.toContain('Internal Transfer');

    const totalAmount = result.reduce((sum, cat) => sum + cat.amount, 0);
    expect(totalAmount).toBe(80); // $50 + $30
  });

  test('should include transfers when explicitly requested in spending by category', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getSpendingByCategory(undefined, true);
    
    // Should include transfer transactions as well
    expect(result).toHaveLength(3);
    
    const categoryNames = result.map(cat => cat.categoryName);
    expect(categoryNames).toContain('Food & Dining');
    expect(categoryNames).toContain('Transportation');
    expect(categoryNames).toContain('Internal Transfer');

    const transferCategory = result.find(cat => cat.categoryName === 'Internal Transfer');
    expect(transferCategory).toBeDefined();
    expect(transferCategory?.transactionCount).toBe(1); // Only the negative transfer (-$100)
    expect(transferCategory?.amount).toBe(100); // Absolute value of -$100
  });

  test('should exclude transfers by default in income expense analysis', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getIncomeExpenseAnalysis();
    
    // Should not include transfers in income/expense totals
    expect(result.totalIncome).toBe(2500); // Only salary
    expect(result.totalExpenses).toBe(80); // Only grocery + gas
    expect(result.netIncome).toBe(2420); // $2500 - $80
  });

  test('should include transfers when explicitly requested in income expense analysis', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getIncomeExpenseAnalysis(undefined, true);
    
    // Should include transfers - the positive transfer as income, negative as expense
    expect(result.totalIncome).toBe(2600); // Salary $2500 + positive transfer $100
    expect(result.totalExpenses).toBe(180); // Expenses $80 + negative transfer $100
    expect(result.netIncome).toBe(2420); // Net should be the same since transfers cancel out
  });

  test('should exclude transfers by default in monthly trends', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getMonthlySpendingTrends();
    
    expect(result).toHaveLength(1); // All transactions are from Jan 2024
    const janData = result[0];
    
    expect(janData.totalIncome).toBe(2500); // Only salary
    expect(janData.totalSpending).toBe(80); // Only actual expenses
    expect(janData.netAmount).toBe(2420);
    expect(janData.transactionCount).toBe(3); // Exclude the 2 transfer transactions
  });

  test('should include transfers when explicitly requested in monthly trends', async () => {
    // Add mock transactions
    for (const transaction of mockTransactions) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getMonthlySpendingTrends(undefined, true);
    
    expect(result).toHaveLength(1);
    const janData = result[0];
    
    expect(janData.totalIncome).toBe(2600); // Salary + positive transfer
    expect(janData.totalSpending).toBe(180); // Expenses + negative transfer
    expect(janData.netAmount).toBe(2420); // Net remains same
    expect(janData.transactionCount).toBe(5); // All transactions included
  });

  test('should exclude transfers by default in category deep dive', async () => {
    // Add a proper internal transfer transaction  
    const additionalTransfers: Transaction[] = [
      {
        id: '6',
        date: new Date('2024-01-17'),
        amount: -25.00,
        description: 'Transfer to savings',
        category: 'Internal Transfer', // Proper transfer category
        account: 'Checking',
        type: 'transfer', // This property is ignored now, category determines behavior
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      }
    ];

    for (const transaction of [...mockTransactions, ...additionalTransfers]) {
      await dataService.addTransaction(transaction);
    }

    const result = await reportsService.getCategoryDeepDive('Food & Dining');
    
    expect(result).not.toBeNull();
    expect(result!.transactionCount).toBe(1); // Only the grocery expense, not the transfer
    expect(result!.totalAmount).toBe(50); // Only grocery amount
  });

  test('should include transfers when explicitly requested in category deep dive', async () => {
    // Add both regular expense and transfer in Food & Dining category for testing
    const additionalTransactions: Transaction[] = [
      // Regular Food & Dining expense
      {
        id: '6',
        date: new Date('2024-01-17'),
        amount: -25.00,
        description: 'Restaurant meal',
        category: 'Food & Dining',
        account: 'Credit Card',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      // Internal transfer (should be excluded/included based on includeTransfers flag)
      {
        id: '7',
        date: new Date('2024-01-18'),
        amount: -100.00,
        description: 'Transfer to savings account',
        category: 'Internal Transfer',
        account: 'Checking',
        type: 'transfer',
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      }
    ];

    for (const transaction of [...mockTransactions, ...additionalTransactions]) {
      await dataService.addTransaction(transaction);
    }

    // Test Food & Dining category with includeTransfers=true (shouldn't affect non-transfer category)
    const result = await reportsService.getCategoryDeepDive('Food & Dining', undefined, true);
    
    expect(result).not.toBeNull();
    expect(result!.transactionCount).toBe(2); // Original grocery $50 + new restaurant $25
    expect(result!.totalAmount).toBe(75); // $50 + $25 = $75
  });
});