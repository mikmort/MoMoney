import { dataService } from '../services/dataService';
import { dashboardService } from '../services/dashboardService';
import { reportsService } from '../services/reportsService';
import { Transaction } from '../types';

describe('Category Type Logic Tests', () => {
  beforeEach(() => {
    dataService.clearAllData();
  });

  test('should use category type instead of transaction type for dashboard stats', async () => {
    // Create transactions where transaction type differs from category type
    const testTransactions: Transaction[] = [
      {
        id: 'test-1',
        date: new Date('2024-01-15'),
        amount: -100.00,
        description: 'Grocery Store',
        category: 'Food & Dining', // This is an expense category
        account: 'Checking',
        type: 'income', // Wrong type - should be ignored
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        id: 'test-2',
        date: new Date('2024-01-16'),
        amount: 2000.00,
        description: 'Salary',
        category: 'Salary & Wages', // This is an income category
        account: 'Checking',
        type: 'expense', // Wrong type - should be ignored
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      },
      {
        id: 'test-3',
        date: new Date('2024-01-17'),
        amount: -50.00,
        description: 'Transfer to Savings',
        category: 'Internal Transfer', // This is a transfer category
        account: 'Checking',
        type: 'expense', // Wrong type - should be ignored as transfer
        addedDate: new Date(),
        isVerified: true,
        confidence: 1.0
      }
    ];

    await dataService.addTransactions(testTransactions);
    
    const stats = await dashboardService.getDashboardStats();
    
    // Should classify based on category type, not transaction type
    expect(stats.totalIncome).toBe(2000.00); // Salary from income category
    expect(stats.totalExpenses).toBe(100.00); // Grocery from expense category
    expect(stats.netIncome).toBe(1900.00); // 2000 - 100
    expect(stats.transactionCount).toBe(2); // Excludes the transfer

    console.log('✅ Dashboard uses category type instead of transaction type');
  });

  test('should detect transfers by transaction type even if category type is different', async () => {
    // Create a transaction that has expense category but transfer type
    const testTransactions: Transaction[] = [
      {
        id: 'test-1',
        date: new Date('2024-01-15'),
        amount: -100.00,
        description: 'Food transfer', 
        category: 'Food & Dining', // Expense category
        account: 'Checking',
        type: 'transfer', // Transfer type - should override category
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      },
      {
        id: 'test-2',
        date: new Date('2024-01-16'),
        amount: -50.00,
        description: 'Regular Grocery',
        category: 'Food & Dining', // Same category but not transfer
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true,
        confidence: 0.9
      }
    ];

    await dataService.addTransactions(testTransactions);
    
    const result = await reportsService.getCategoryDeepDive('Food & Dining');
    
    // Should exclude the transfer even though it has Food & Dining category
    expect(result).not.toBeNull();
    expect(result!.transactionCount).toBe(1); // Only the regular grocery, not the transfer
    expect(result!.totalAmount).toBe(50.00); // Only the regular grocery amount

    console.log('✅ Transfers are excluded even if they have expense categories');
  });

  test('should handle mixed scenarios correctly', async () => {
    const testTransactions: Transaction[] = [
      // Valid expense with correct category
      {
        id: 'test-1',
        date: new Date('2024-01-15'),
        amount: -75.00,
        description: 'Gas Station',
        category: 'Transportation', // Expense category
        account: 'Checking',
        type: 'expense',
        addedDate: new Date(),
        isVerified: true
      },
      // Expense transaction with wrong type but correct category
      {
        id: 'test-2',
        date: new Date('2024-01-16'),
        amount: -25.00,
        description: 'Bus Fare',
        category: 'Transportation', // Expense category
        account: 'Checking',
        type: 'income', // Wrong type - should be ignored
        addedDate: new Date(),
        isVerified: true
      },
      // Income transaction with correct category
      {
        id: 'test-3',
        date: new Date('2024-01-17'),
        amount: 3000.00,
        description: 'Monthly Salary',
        category: 'Salary & Wages', // Income category
        account: 'Checking',
        type: 'income',
        addedDate: new Date(),
        isVerified: true
      }
    ];

    await dataService.addTransactions(testTransactions);
    
    const stats = await dashboardService.getDashboardStats();
    
    // Should total both transportation expenses based on category type
    expect(stats.totalExpenses).toBe(100.00); // 75 + 25
    expect(stats.totalIncome).toBe(3000.00);
    expect(stats.netIncome).toBe(2900.00);
    
    // Check top categories includes Transportation
    const transportationCategory = stats.topCategories.find(cat => cat.categoryName === 'Transportation');
    expect(transportationCategory).toBeDefined();
    expect(transportationCategory!.amount).toBe(100.00); // Both transactions

    console.log('✅ Mixed scenarios handled correctly with category-based logic');
  });
});