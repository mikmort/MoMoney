import { Transaction, DashboardStats } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';
import { isIncomeCategory, isExpenseCategory, isTransferCategory, isAssetAllocationCategory } from '../utils/categoryTypeUtils';

class DashboardService {
  // Helper method to identify transfers (preserving original transfer detection logic)
  private isTransfer(transaction: Transaction): boolean {
    return transaction.type === 'transfer' || isTransferCategory(transaction.category);
  }

  // Helper method to identify asset allocations  
  private isAssetAllocation(transaction: Transaction): boolean {
    return transaction.type === 'asset-allocation' || isAssetAllocationCategory(transaction.category);
  }

  async getDashboardStats(): Promise<DashboardStats> {
  const transactions = await dataService.getAllTransactions();
  // Convert all transactions to user's default currency for aggregations
  const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
    
    if (transactions.length === 0) {
      return {
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        transactionCount: 0,
        topCategories: [],
        monthlyTrend: []
      };
    }

    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    
    // Calculate category totals
    const categoryTotals: { [categoryName: string]: number } = {};
    
    // Calculate monthly trends (last 12 months)
    const monthlyData: { [monthKey: string]: { income: number; expenses: number } } = {};
    
  converted.forEach(transaction => {
      // Skip transfer and asset-allocation transactions in financial calculations
      if (this.isTransfer(transaction) || this.isAssetAllocation(transaction)) {
        return;
      }
      
      const amount = Math.abs(transaction.amount);
      
      // Calculate income vs expenses based on category type
      if (isIncomeCategory(transaction.category)) {
        totalIncome += amount;
      } else if (isExpenseCategory(transaction.category)) {
        totalExpenses += amount;
      }
      
      // Calculate category totals (only for expense categories)
      if (isExpenseCategory(transaction.category)) {
        categoryTotals[transaction.category] = (categoryTotals[transaction.category] || 0) + amount;
      }
      
      // Calculate monthly trends
      // Use local date to avoid UTC timezone issues
      const year = transaction.date.getFullYear();
      const month = (transaction.date.getMonth() + 1).toString().padStart(2, '0');
      const monthKey = `${year}-${month}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0 };
      }
      
      if (isIncomeCategory(transaction.category)) {
        monthlyData[monthKey].income += amount;
      } else if (isExpenseCategory(transaction.category)) {
        monthlyData[monthKey].expenses += amount;
      }
    });
    
    // Get top 5 categories
    const topCategories = Object.entries(categoryTotals)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([categoryName, amount]) => ({
        categoryId: categoryName.toLowerCase().replace(/\s+/g, '_'),
        categoryName,
        amount,
        percentage: totalExpenses > 0 ? (amount / totalExpenses) * 100 : 0
      }));
    
    // Get monthly trend for last 12 months
  const monthlyTrend = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12) // Last 12 months
      .map(([monthKey, data]) => {
        const date = new Date(monthKey + '-01');
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        
        return {
          month,
          income: data.income,
          expenses: data.expenses,
          net: data.income - data.expenses
        };
      });
    
    return {
      totalIncome,
      totalExpenses,
      netIncome: totalIncome - totalExpenses,
      transactionCount: converted.filter(t => !this.isTransfer(t) && !this.isAssetAllocation(t)).length, // Exclude transfers and investments from count
      topCategories,
      monthlyTrend
    };
  }

  async getRecentTransactions(limit: number = 10): Promise<Transaction[]> {
    const transactions = await dataService.getAllTransactions();
    
    return transactions
      .filter(t => !this.isTransfer(t)) // Exclude Internal Transfers from recent transactions
      .sort((a, b) => b.date.getTime() - a.date.getTime())
      .slice(0, limit);
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;