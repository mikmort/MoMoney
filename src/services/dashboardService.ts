import { Transaction, DashboardStats, Category } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';

class DashboardService {
  // Cache for category types to improve performance
  private categoryTypeCache: Map<string, 'income' | 'expense' | 'transfer' | 'asset-allocation'> = new Map();

  /**
   * Gets all available categories and builds a type cache for fast lookups
   */
  private getCategoryTypeCache(): Map<string, 'income' | 'expense' | 'transfer' | 'asset-allocation'> {
    if (this.categoryTypeCache.size === 0) {
      // Load categories from localStorage or use defaults
      let categories: Category[];
      try {
        const saved = localStorage.getItem('mo-money-categories');
        categories = saved ? JSON.parse(saved) : [];
      } catch (error) {
        console.warn('Failed to load custom categories from localStorage:', error);
        categories = [];
      }

      // If no custom categories, use defaults
      if (categories.length === 0) {
        const { defaultCategories } = require('../data/defaultCategories');
        categories = defaultCategories;
      }

      // Build the cache
      categories.forEach(cat => {
        this.categoryTypeCache.set(cat.name, cat.type);
      });
    }
    return this.categoryTypeCache;
  }

  /**
   * Fast category type lookup using cached data
   */
  private getCategoryType(categoryName: string): 'income' | 'expense' | 'transfer' | 'asset-allocation' | undefined {
    return this.getCategoryTypeCache().get(categoryName);
  }

  // Helper method to identify transfers (category-based only)
  private isTransfer(transaction: Transaction): boolean {
    return this.getCategoryType(transaction.category) === 'transfer';
  }

  // Helper method to identify asset allocations (category-based only) 
  private isAssetAllocation(transaction: Transaction): boolean {
    return this.getCategoryType(transaction.category) === 'asset-allocation';
  }

  // Helper method to identify income transactions (category-based only)
  private isIncome(transaction: Transaction): boolean {
    return this.getCategoryType(transaction.category) === 'income';
  }

  // Helper method to identify expense transactions (category-based only)
  private isExpense(transaction: Transaction): boolean {
    return this.getCategoryType(transaction.category) === 'expense';
  }

  /**
   * Clears the category type cache - should be called when categories are updated
   */
  public invalidateCategoryCache(): void {
    this.categoryTypeCache.clear();
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
      
      // Calculate income vs expenses based on category type - use consistent logic with reports
      if (this.isIncome(transaction)) {
        totalIncome += transaction.amount; // Direct sum for income
      } else if (this.isExpense(transaction)) {
        totalExpenses += (-transaction.amount); // Flip sign to make expenses positive
      }
      
      // Calculate category totals (only for expense categories)
      if (this.isExpense(transaction)) {
        categoryTotals[transaction.category] = (categoryTotals[transaction.category] || 0) + (-transaction.amount);
      }
      
      // Calculate monthly trends
      // Use local date to avoid UTC timezone issues
      const year = transaction.date.getFullYear();
      const month = (transaction.date.getMonth() + 1).toString().padStart(2, '0');
      const monthKey = `${year}-${month}`;
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = { income: 0, expenses: 0 };
      }
      
      if (this.isIncome(transaction)) {
        monthlyData[monthKey].income += transaction.amount; // Direct sum for income
      } else if (this.isExpense(transaction)) {
        monthlyData[monthKey].expenses += (-transaction.amount); // Flip sign for expenses
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