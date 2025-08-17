import { Transaction } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';
import { userPreferencesService } from './userPreferencesService';

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

export type TrendGranularity = 'daily' | 'weekly' | 'monthly';

export interface CategoryDeepDive {
  categoryName: string;
  totalAmount: number;
  transactionCount: number;
  averageTransaction: number;
  largestTransaction: Transaction;
  smallestTransaction: Transaction;
  recentTransactions: Transaction[];
  trend: { label: string; amount: number }[];
  trendGranularity: TrendGranularity;
  trendTitle: string;
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
  // Helper method to comprehensively identify internal transfers
  private isInternalTransfer(transaction: Transaction): boolean {
    // Check by transaction type first (most reliable)
    if (transaction.type === 'transfer') {
      return true;
    }
    
    // Check by category (catch misclassified transfers)
    const category = transaction.category.toLowerCase();
    const transferCategories = [
      'internal transfer',
      'transfer',
      'transfers',
      'between accounts',
      'account transfer',
      'bank transfer'
    ];
    
    if (transferCategories.some(cat => category.includes(cat))) {
      return true;
    }
    
    // Check by description (catch transactions with transfer keywords)
    const description = transaction.description.toLowerCase();
    const transferKeywords = [
      'transfer to',
      'transfer from',
      'transfer - ',
      'online transfer',
      'mobile transfer',
      'atm withdrawal',
      'atm deposit',
      'cash withdrawal',
      'cash deposit',
      'withdrawal - atm',
      'deposit - atm',
      'zelle transfer',
      'venmo transfer',
      'paypal transfer',
      'wire transfer',
      'ach transfer',
      'electronic transfer',
      'internal transfer',
      'between accounts',
      'move money',
      'fund transfer',
      'account transfer',
      'savings transfer',
      'checking transfer'
    ];
    
    if (transferKeywords.some(keyword => description.includes(keyword))) {
      return true;
    }
    
    // Check for common ATM patterns
    if (/atm\s*(withdrawal|deposit|cash|#)/i.test(description)) {
      return true;
    }
    
    // Check for transfer patterns with account names
    if (/transfer.*(?:saving|checking|account)/i.test(description) || 
        /(?:saving|checking|account).*transfer/i.test(description)) {
      return true;
    }
    
    return false;
  }

  // Helper method to filter transactions based on user preferences
  private async filterTransactionsForReports(transactions: Transaction[], type: 'income' | 'expense', includeTransfers: boolean = false): Promise<Transaction[]> {
    const preferences = await userPreferencesService.getPreferences();
    
    return transactions.filter(t => {
      // Check if this is an internal transfer using comprehensive detection
      if (this.isInternalTransfer(t)) {
        if (!includeTransfers) {
          return false; // Exclude all types of internal transfers when not requested
        }
        // If including transfers, still apply income/expense filtering based on amount
        if (type === 'expense') {
          return t.amount < 0;
        } else if (type === 'income') {
          return t.amount > 0;
        }
        return false;
      }
      
      // Check if this is an asset allocation transaction
      if (t.type === 'asset-allocation') {
        // Only include asset allocation transactions if user has enabled it
        return preferences.includeInvestmentsInReports;
      }
      
      // For regular income/expense filtering
      if (type === 'expense') {
        return t.type === 'expense' || t.amount < 0;
      } else if (type === 'income') {
        return t.type === 'income' || t.amount > 0;
      }
      
      return false;
    });
  }

  async getSpendingByCategory(dateRange?: DateRange, includeTransfers: boolean = false): Promise<SpendingByCategory[]> {
    const transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
    const expenseTransactions = await this.filterTransactionsForReports(transactions, 'expense', includeTransfers);
    
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

  async getMonthlySpendingTrends(dateRange?: DateRange, includeTransfers: boolean = false): Promise<MonthlySpendingTrend[]> {
    const transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
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
    const preferences = await userPreferencesService.getPreferences();
    
    return Object.entries(monthlyData)
      .map(([monthKey, monthTransactions]) => {
        const expenseTransactions = monthTransactions.filter(t => {
          if (this.isInternalTransfer(t)) {
            return includeTransfers && t.amount < 0;
          }
          if (t.type === 'asset-allocation') return preferences.includeInvestmentsInReports;
          return t.type === 'expense' || t.amount < 0;
        });
        
        const incomeTransactions = monthTransactions.filter(t => {
          if (this.isInternalTransfer(t)) {
            return includeTransfers && t.amount > 0;
          }
          if (t.type === 'asset-allocation') return preferences.includeInvestmentsInReports;
          return t.type === 'income' || t.amount > 0;
        });
        
        const totalSpending = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
        const totalIncome = incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

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

  async getIncomeExpenseAnalysis(dateRange?: DateRange, includeTransfers: boolean = false): Promise<IncomeExpenseAnalysis> {
    const transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
    const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
    
    const incomeTransactions = await this.filterTransactionsForReports(converted, 'income', includeTransfers);
    const expenseTransactions = await this.filterTransactionsForReports(converted, 'expense', includeTransfers);
    
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

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

  // Helper method to determine appropriate granularity based on date range
  private determineTrendGranularity(dateRange?: DateRange): { granularity: TrendGranularity; title: string } {
    if (!dateRange) {
      return { granularity: 'monthly', title: 'Monthly Trend' };
    }

    const daysDiff = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff <= 7) {
      return { granularity: 'daily', title: 'Daily Trend' };
    } else if (daysDiff <= 31) {
      return { granularity: 'daily', title: 'Daily Trend' };
    } else if (daysDiff <= 62) {
      return { granularity: 'weekly', title: 'Weekly Trend' };
    } else {
      return { granularity: 'monthly', title: 'Monthly Trend' };
    }
  }

  // Helper method to format period labels based on granularity
  private formatPeriodLabel(date: Date, granularity: TrendGranularity, weekStart?: Date): string {
    switch (granularity) {
      case 'daily':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'weekly':
        if (weekStart) {
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          return `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}-${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      case 'monthly':
      default:
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
  }

  // Helper method to get period key for grouping
  private getPeriodKey(date: Date, granularity: TrendGranularity): string {
    switch (granularity) {
      case 'daily':
        return date.toISOString().slice(0, 10); // YYYY-MM-DD
      case 'weekly':
        // Get the Monday of the week
        const weekStart = new Date(date);
        const day = weekStart.getDay();
        const diff = weekStart.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
        weekStart.setDate(diff);
        return weekStart.toISOString().slice(0, 10); // Monday of the week
      case 'monthly':
      default:
        return date.toISOString().slice(0, 7); // YYYY-MM
    }
  }

  async getCategoryDeepDive(categoryName: string, dateRange?: DateRange, includeTransfers: boolean = false): Promise<CategoryDeepDive | null> {
    const transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
    const preferences = await userPreferencesService.getPreferences();
    
    const categoryTransactionsRaw = transactions
      .filter(t => {
        // Must match the category name
        if (t.category !== categoryName) return false;
        
        // Check transaction type
        if (this.isInternalTransfer(t)) {
          return includeTransfers && t.amount < 0; // Only include negative transfers for expense analysis
        }
        if (t.type === 'asset-allocation') return preferences.includeInvestmentsInReports;
        return t.type === 'expense' || t.amount < 0;
      })
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
    
    // Get recent transactions (up to 100 most recent)
    const recentTransactions = categoryTransactions.slice(0, 100);
    
    // Determine granularity and calculate trend
    const { granularity, title } = this.determineTrendGranularity(dateRange);
    const trendTotals: { [periodKey: string]: { amount: number; date: Date } } = {};
    
    categoryTransactions.forEach(transaction => {
      const periodKey = this.getPeriodKey(transaction.date, granularity);
      if (!trendTotals[periodKey]) {
        trendTotals[periodKey] = { amount: 0, date: transaction.date };
      }
      trendTotals[periodKey].amount += Math.abs(transaction.amount);
    });
    
    const trend = Object.entries(trendTotals)
      .map(([periodKey, data]) => {
        let label: string;
        if (granularity === 'weekly') {
          // For weekly, parse the period key to get the Monday date
          const weekStart = new Date(periodKey);
          label = this.formatPeriodLabel(data.date, granularity, weekStart);
        } else {
          label = this.formatPeriodLabel(data.date, granularity);
        }
        return { label, amount: data.amount };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    return {
      categoryName,
      totalAmount,
      transactionCount,
      averageTransaction,
      largestTransaction,
      smallestTransaction,
      recentTransactions,
      trend,
      trendGranularity: granularity,
      trendTitle: title
    };
  }

  async getBurnRateAnalysis(dateRange?: DateRange, includeTransfers: boolean = false): Promise<BurnRateAnalysis> {
    const allTransactions = await this.getTransactionsInRange(dateRange, includeTransfers);
    const convertedAll = await currencyDisplayService.convertTransactionsBatch(allTransactions);
    const expenseTransactions = await this.filterTransactionsForReports(convertedAll, 'expense', includeTransfers);
    
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

  async getSpendingInsights(dateRange?: DateRange, includeTransfers: boolean = false): Promise<SpendingInsights> {
    const transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
    
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
    
    // Filter out transfers using comprehensive detection (unless specifically requested)
    let filteredTransactions = includeTransfers ? allTransactions : allTransactions.filter(t => !this.isInternalTransfer(t));
    
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

  // Get income breakdown by category (similar to spending but for income)
  async getIncomeByCategory(dateRange?: DateRange, includeTransfers: boolean = false): Promise<any[]> {
    try {
      const transactions = await dataService.getAllTransactions();
      
      let filteredTransactions = transactions;
      
      // Apply date range filter
      if (dateRange) {
        filteredTransactions = filteredTransactions.filter(t => {
          const transactionDate = new Date(t.date);
          return transactionDate >= dateRange.startDate && transactionDate <= dateRange.endDate;
        });
      }
      
      // Filter for income transactions
      const incomeTransactions = await this.filterTransactionsForReports(filteredTransactions, 'income', includeTransfers);
      
      // Convert to common currency
      const convertedIncomeTransactions = await currencyDisplayService.convertTransactionsBatch(incomeTransactions);
      
      // Group by category
      const categoryTotals = convertedIncomeTransactions.reduce((acc, transaction) => {
        const category = transaction.category;
        if (!acc[category]) {
          acc[category] = { 
            amount: 0, 
            count: 0, 
            transactions: [] 
          };
        }
        acc[category].amount += Math.abs(transaction.amount);
        acc[category].count += 1;
        acc[category].transactions.push(transaction);
        return acc;
      }, {} as { [key: string]: { amount: number; count: number; transactions: any[] } });
      
      // Convert to array with additional stats
      return Object.entries(categoryTotals).map(([categoryName, data]) => {
        const frequency = this.calculateFrequency(data.transactions, dateRange);
        return {
          categoryName,
          amount: data.amount,
          transactionCount: data.count,
          averageAmount: data.amount / data.count,
          frequency
        };
      }).sort((a, b) => b.amount - a.amount);
      
    } catch (error) {
      console.error('Error getting income by category:', error);
      return [];
    }
  }

  // Helper to calculate frequency of transactions
  private calculateFrequency(transactions: any[], dateRange?: DateRange): string {
    if (transactions.length <= 1) return 'One-time';
    
    const sortedTransactions = transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const firstDate = new Date(sortedTransactions[0].date);
    const lastDate = new Date(sortedTransactions[sortedTransactions.length - 1].date);
    const daysDiff = Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) return 'Same day';
    
    const avgDaysBetween = daysDiff / (transactions.length - 1);
    
    if (avgDaysBetween <= 7) return 'Weekly';
    if (avgDaysBetween <= 15) return 'Bi-weekly';  
    if (avgDaysBetween <= 35) return 'Monthly';
    if (avgDaysBetween <= 95) return 'Quarterly';
    
    return 'Irregular';
  }
}

export const reportsService = new ReportsService();
export default reportsService;