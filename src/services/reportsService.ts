import { Transaction } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';

export interface SpendingByCategory {
  categoryName: string;
  amount: number;
  percentage: number;
  transactionCount: number;
  averageAmount: number;
}

export interface MonthlySpendingTrend {
  month: string;
  year: number;
  monthKey: string;
  totalSpending: number;
  totalIncome: number;
  netAmount: number;
  transactionCount: number;
}

export interface IncomeExpenseAnalysis {
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  incomeToExpenseRatio: number;
  expenseToIncomeRatio: number;
  savingsRate: number; // (income - expenses) / income * 100
}

export interface CategoryDeepDive {
  categoryName: string;
  totalAmount: number;
  transactionCount: number;
  averageTransaction: number;
  largestTransaction: Transaction;
  smallestTransaction: Transaction;
  recentTransactions: Transaction[];
  monthlyTrend: { month: string; amount: number }[];
}

export interface SpendingInsights {
  totalTransactions: number;
  verifiedTransactions: number;
  verificationRate: number;
  averageConfidence: number;
  highConfidenceTransactions: number; // confidence > 0.8
  lowConfidenceTransactions: number; // confidence < 0.5
  needsReviewCount: number;
}

export interface BurnRateAnalysis {
  dailyBurnRate: number; // Average daily spending
  monthlyBurnRate: number; // Average monthly spending
  projectedMonthlySpending: number; // Based on current month's partial data
  daysRemaining: number; // Days remaining in current month
  projectedEndOfMonthBalance: number; // Estimated balance at month end
  burnRateTrend: 'increasing' | 'decreasing' | 'stable'; // Trend over last 3 months
  recommendedDailySpending: number; // To stay within budget if applicable
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

class ReportsService {
  async getSpendingByCategory(dateRange?: DateRange): Promise<SpendingByCategory[]> {
  const transactions = await this.getTransactionsInRange(dateRange);
  const expenseTransactions = transactions.filter(t => t.type === 'expense' || t.amount < 0);
    
    if (expenseTransactions.length === 0) {
      return [];
    }

  // Convert all expenses to default currency for aggregation
  const convertedExpenses = await currencyDisplayService.convertTransactionsBatch(expenseTransactions);
  const totalSpending = convertedExpenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const categoryTotals: { [category: string]: Transaction[] } = {};
    
    // Group transactions by category
  convertedExpenses.forEach(transaction => {
      const category = transaction.category;
      if (!categoryTotals[category]) {
        categoryTotals[category] = [];
      }
      categoryTotals[category].push(transaction);
    });

    // Calculate statistics for each category
    return Object.entries(categoryTotals)
      .map(([categoryName, categoryTransactions]) => {
        const amount = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const transactionCount = categoryTransactions.length;
        const averageAmount = amount / transactionCount;
        const percentage = totalSpending > 0 ? (amount / totalSpending) * 100 : 0;

        return {
          categoryName,
          amount,
          percentage,
          transactionCount,
          averageAmount
        };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  async getMonthlySpendingTrends(dateRange?: DateRange): Promise<MonthlySpendingTrend[]> {
  const transactions = await this.getTransactionsInRange(dateRange);
  const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
  const monthlyData: { [monthKey: string]: Transaction[] } = {};

    // Group transactions by month
  converted.forEach(transaction => {
      const monthKey = transaction.date.toISOString().slice(0, 7); // YYYY-MM
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = [];
      }
      monthlyData[monthKey].push(transaction);
    });

    // Calculate monthly statistics
    return Object.entries(monthlyData)
      .map(([monthKey, monthTransactions]) => {
        const totalSpending = monthTransactions
          .filter(t => t.type === 'expense' || t.amount < 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);
        
        const totalIncome = monthTransactions
          .filter(t => t.type === 'income' || t.amount > 0)
          .reduce((sum, t) => sum + Math.abs(t.amount), 0);

        const date = new Date(monthKey + '-01');
        const month = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const year = date.getFullYear();

        return {
          month,
          year,
          monthKey,
          totalSpending,
          totalIncome,
          netAmount: totalIncome - totalSpending,
          transactionCount: monthTransactions.length
        };
      })
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }

  async getIncomeExpenseAnalysis(dateRange?: DateRange): Promise<IncomeExpenseAnalysis> {
  const transactions = await this.getTransactionsInRange(dateRange);
  const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
    
  const totalIncome = converted
      .filter(t => t.type === 'income' || t.amount > 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
  const totalExpenses = converted
      .filter(t => t.type === 'expense' || t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const netIncome = totalIncome - totalExpenses;
    const incomeToExpenseRatio = totalExpenses > 0 ? totalIncome / totalExpenses : 0;
    const expenseToIncomeRatio = totalIncome > 0 ? totalExpenses / totalIncome : 0;
    const savingsRate = totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0;

    return {
      totalIncome,
      totalExpenses,
      netIncome,
      incomeToExpenseRatio,
      expenseToIncomeRatio,
      savingsRate
    };
  }

  async getCategoryDeepDive(categoryName: string, dateRange?: DateRange): Promise<CategoryDeepDive | null> {
  const transactions = await this.getTransactionsInRange(dateRange);
  const categoryTransactionsRaw = transactions
      .filter(t => t.category === categoryName && (t.type === 'expense' || t.amount < 0))
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  const categoryTransactions = await currencyDisplayService.convertTransactionsBatch(categoryTransactionsRaw);

    if (categoryTransactions.length === 0) {
      return null;
    }

    const totalAmount = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const transactionCount = categoryTransactions.length;
    const averageTransaction = totalAmount / transactionCount;
    
    // Find largest and smallest transactions
    const sortedByAmount = [...categoryTransactions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    const largestTransaction = sortedByAmount[0];
    const smallestTransaction = sortedByAmount[sortedByAmount.length - 1];
    
    // Get recent transactions (last 5)
    const recentTransactions = categoryTransactions.slice(0, 5);
    
    // Calculate monthly trend for this category
  const monthlyTotals: { [monthKey: string]: number } = {};
  categoryTransactions.forEach(transaction => {
      const monthKey = transaction.date.toISOString().slice(0, 7);
      monthlyTotals[monthKey] = (monthlyTotals[monthKey] || 0) + Math.abs(transaction.amount);
    });
    
    const monthlyTrend = Object.entries(monthlyTotals)
      .map(([monthKey, amount]) => {
        const date = new Date(monthKey + '-01');
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        return { month, amount };
      })
      .sort((a, b) => a.month.localeCompare(b.month));

    return {
      categoryName,
      totalAmount,
      transactionCount,
      averageTransaction,
      largestTransaction,
      smallestTransaction,
      recentTransactions,
      monthlyTrend
    };
  }

  async getBurnRateAnalysis(dateRange?: DateRange): Promise<BurnRateAnalysis> {
  const allTransactions = await this.getTransactionsInRange(dateRange);
  const convertedAll = await currencyDisplayService.convertTransactionsBatch(allTransactions);
  const expenseTransactions = convertedAll.filter(t => t.type === 'expense' || t.amount < 0);
    
    if (expenseTransactions.length === 0) {
      return {
        dailyBurnRate: 0,
        monthlyBurnRate: 0,
        projectedMonthlySpending: 0,
        daysRemaining: 0,
        projectedEndOfMonthBalance: 0,
        burnRateTrend: 'stable',
        recommendedDailySpending: 0
      };
    }

    // Calculate daily burn rate
  const totalSpending = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const earliestDate = new Date(Math.min(...expenseTransactions.map(t => t.date.getTime())));
    const latestDate = new Date(Math.max(...expenseTransactions.map(t => t.date.getTime())));
    const daysDiff = Math.max(1, Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)));
    const dailyBurnRate = totalSpending / daysDiff;
    const monthlyBurnRate = dailyBurnRate * 30;

    // Current month analysis
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysInMonth = currentMonthEnd.getDate();
    const daysPassed = now.getDate();
    const daysRemaining = Math.max(0, daysInMonth - daysPassed);

    const currentMonthExpenses = expenseTransactions
      .filter(t => t.date >= currentMonthStart && t.date <= now)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    const projectedMonthlySpending = daysPassed > 0 ? (currentMonthExpenses / daysPassed) * daysInMonth : monthlyBurnRate;

    // Get income for balance projection
  const currentMonthIncome = convertedAll
      .filter(t => (t.type === 'income' || t.amount > 0) && t.date >= currentMonthStart && t.date <= now)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const projectedEndOfMonthBalance = currentMonthIncome - projectedMonthlySpending;

    // Calculate trend (last 3 months)
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);
    const last3MonthsExpenses = expenseTransactions.filter(t => t.date >= threeMonthsAgo);
    
    // Group by month for trend analysis
    const monthlySpending: { [month: string]: number } = {};
    last3MonthsExpenses.forEach(t => {
      const monthKey = t.date.toISOString().slice(0, 7);
      monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + Math.abs(t.amount);
    });

    const monthlyValues = Object.values(monthlySpending);
    let burnRateTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    
    if (monthlyValues.length >= 2) {
      const recentAvg = monthlyValues.slice(-2).reduce((a, b) => a + b, 0) / 2;
      const earlierAvg = monthlyValues.slice(0, -1).reduce((a, b) => a + b, 0) / (monthlyValues.length - 1);
      
      if (recentAvg > earlierAvg * 1.1) {
        burnRateTrend = 'increasing';
      } else if (recentAvg < earlierAvg * 0.9) {
        burnRateTrend = 'decreasing';
      }
    }

    // Simple recommended daily spending (could be enhanced with budget integration)
    const recommendedDailySpending = monthlyBurnRate / 30;

    return {
      dailyBurnRate,
      monthlyBurnRate,
      projectedMonthlySpending,
      daysRemaining,
      projectedEndOfMonthBalance,
      burnRateTrend,
      recommendedDailySpending
    };
  }

  async getSpendingInsights(dateRange?: DateRange): Promise<SpendingInsights> {
    const transactions = await this.getTransactionsInRange(dateRange);
    
    const totalTransactions = transactions.length;
    const verifiedTransactions = transactions.filter(t => t.isVerified === true).length;
    const verificationRate = totalTransactions > 0 ? (verifiedTransactions / totalTransactions) * 100 : 0;
    
    const transactionsWithConfidence = transactions.filter(t => typeof t.confidence === 'number');
    const averageConfidence = transactionsWithConfidence.length > 0 
      ? transactionsWithConfidence.reduce((sum, t) => sum + (t.confidence || 0), 0) / transactionsWithConfidence.length
      : 0;
    
    const highConfidenceTransactions = transactions.filter(t => (t.confidence || 0) > 0.8).length;
    const lowConfidenceTransactions = transactions.filter(t => (t.confidence || 0) < 0.5 && (t.confidence || 0) > 0).length;
    const needsReviewCount = transactions.filter(t => !t.isVerified && (t.confidence || 0) < 0.8).length;

    return {
      totalTransactions,
      verifiedTransactions,
      verificationRate,
      averageConfidence: averageConfidence * 100, // Convert to percentage
      highConfidenceTransactions,
      lowConfidenceTransactions,
      needsReviewCount
    };
  }

  private async getTransactionsInRange(dateRange?: DateRange, includeTransfers: boolean = false): Promise<Transaction[]> {
    const allTransactions = await dataService.getAllTransactions();
    
    // Filter out transfers by default (unless specifically requested)
    let filteredTransactions = includeTransfers ? allTransactions : allTransactions.filter(t => t.type !== 'transfer');
    
    if (!dateRange) {
      return filteredTransactions;
    }

    return filteredTransactions.filter(transaction => 
      transaction.date >= dateRange.startDate && 
      transaction.date <= dateRange.endDate
    );
  }

  // Utility function to get default date range (last 12 months)
  getDefaultDateRange(): DateRange {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(endDate.getFullYear() - 1);
    
    return { startDate, endDate };
  }

  // Utility function to get current month date range
  getCurrentMonthRange(): DateRange {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    
    return { startDate, endDate };
  }

  // Utility function to get last 3 months date range
  getLastThreeMonthsRange(): DateRange {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - 3);
    
    return { startDate, endDate };
  }
}

export const reportsService = new ReportsService();
export default reportsService;