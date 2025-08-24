import { Transaction } from '../types';
import { dataService } from './dataService';
import { currencyDisplayService } from './currencyDisplayService';
import { userPreferencesService } from './userPreferencesService';
import { isAssetAllocationCategory, getCategoryNamesOfType } from '../utils/categoryTypeUtils';

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
  rangeStart?: Date;
  rangeEnd?: Date;
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

export interface ReportsFilters {
  dateRange?: DateRange;
  selectedTypes?: string[];
  selectedCategories?: string[];
  selectedAccounts?: string[];
}

class ReportsService {
  // Helper method to comprehensively identify internal transfers
  private isInternalTransfer(transaction: Transaction): boolean {
    // Check by transaction type first (most reliable)
    if (transaction.type === 'transfer') {
      return true;
    }
    
    // Check by category name (catch misclassified transfers)
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

  // Helper method to get category names by type from defaultCategories
  private getCategoriesOfType(type: 'income' | 'expense'): string[] {
    return getCategoryNamesOfType(type);
  }

  // Helper method to filter transactions by category type (income/expense categories)
  private filterTransactionsByCategoryType(transactions: Transaction[], type: 'income' | 'expense'): Transaction[] {
    const categoryNames = this.getCategoriesOfType(type);
    return transactions.filter(t => categoryNames.includes(t.category));
  }

  // Helper method to filter transactions based on user preferences and selected types
  private async filterTransactionsForReports(transactions: Transaction[], type: 'income' | 'expense', selectedTypes?: string[]): Promise<Transaction[]> {
    const preferences = await userPreferencesService.getPreferences();
    
    return transactions.filter(t => {
      // If selectedTypes is provided, filter by those types first
      if (selectedTypes && selectedTypes.length > 0) {
        // Check if transaction type is in selected types
        if (!selectedTypes.includes(t.type)) {
          return false;
        }
        
        // For transfers, still apply income/expense filtering based on amount
        if (t.type === 'transfer' && this.isInternalTransfer(t)) {
          if (type === 'expense') {
            return t.amount < 0;
          } else if (type === 'income') {
            return t.amount > 0;
          }
          return false;
        }
        
        // For asset-allocation transactions, apply income/expense filtering based on amount
        if (isAssetAllocationCategory(t.category)) {
          if (type === 'expense') {
            return t.amount < 0;
          } else if (type === 'income') {
            return t.amount > 0;
          }
          return false;
        }
        
        // For other selected types, apply income/expense filtering based on category type
        if (type === 'expense') {
          return this.filterTransactionsByCategoryType([t], 'expense').length > 0;
        } else if (type === 'income') {
          return this.filterTransactionsByCategoryType([t], 'income').length > 0;
        }
        
        return true;
      }
      
      // Legacy behavior: Check if this is an internal transfer using comprehensive detection
      if (this.isInternalTransfer(t)) {
        return false; // Exclude transfers by default when no selectedTypes specified
      }
      
      // Check if this is an asset allocation transaction
      if (isAssetAllocationCategory(t.category)) {
        // Only include asset allocation transactions if user has enabled it
        return preferences.includeInvestmentsInReports;
      }
      
      // For regular income/expense filtering based on category type
      if (type === 'expense') {
        return this.filterTransactionsByCategoryType([t], 'expense').length > 0;
      } else if (type === 'income') {
        return this.filterTransactionsByCategoryType([t], 'income').length > 0;
      }
      
      return false;
    });
  }

  // Legacy method for backward compatibility
  private async filterTransactionsForReportsLegacy(transactions: Transaction[], type: 'income' | 'expense', includeTransfers: boolean = false): Promise<Transaction[]> {
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
      if (isAssetAllocationCategory(t.category)) {
        // Only include asset allocation transactions if user has enabled it
        return preferences.includeInvestmentsInReports;
      }
      
      // For regular income/expense filtering based on category type
      if (type === 'expense') {
        return this.filterTransactionsByCategoryType([t], 'expense').length > 0;
      } else if (type === 'income') {
        return this.filterTransactionsByCategoryType([t], 'income').length > 0;
      }
      
      return false;
    });
  }

  // New method signatures that support comprehensive filtering
  async getSpendingByCategory(filters?: ReportsFilters): Promise<SpendingByCategory[]>;
  async getSpendingByCategory(dateRange?: DateRange, selectedTypes?: string[]): Promise<SpendingByCategory[]>;
  async getSpendingByCategory(dateRange?: DateRange, includeTransfers?: boolean): Promise<SpendingByCategory[]>;
  async getSpendingByCategory(filtersOrDateRange?: ReportsFilters | DateRange, selectedTypesOrIncludeTransfers?: string[] | boolean): Promise<SpendingByCategory[]> {
    let transactions: Transaction[];
    let shouldIncludeTransfers = false;
    let shouldIncludeAssetAllocation = false;
  let selectedCategoryFilter: string[] | undefined;
    
    // Handle the new ReportsFilters interface
    if (filtersOrDateRange && (
      'selectedCategories' in filtersOrDateRange || 
      'selectedAccounts' in filtersOrDateRange || 
      'selectedTypes' in filtersOrDateRange
    )) {
      const filters = filtersOrDateRange as ReportsFilters;
      transactions = await this.getFilteredTransactions(filters);
      const selectedTypes = filters.selectedTypes || ['expense'];
      shouldIncludeTransfers = selectedTypes.includes('transfer');
      shouldIncludeAssetAllocation = selectedTypes.includes('asset-allocation');
      selectedCategoryFilter = filters.selectedCategories;
    } else {
      // Handle legacy calls
      const dateRange = filtersOrDateRange as DateRange | undefined;
      if (Array.isArray(selectedTypesOrIncludeTransfers)) {
        // New behavior with selectedTypes array
        transactions = await this.getTransactionsInRange(dateRange, true); // Get all transactions
        shouldIncludeTransfers = selectedTypesOrIncludeTransfers.includes('transfer');
        shouldIncludeAssetAllocation = selectedTypesOrIncludeTransfers.includes('asset-allocation');
      } else {
        // Legacy behavior with includeTransfers boolean
        shouldIncludeTransfers = selectedTypesOrIncludeTransfers || false;
        transactions = await this.getTransactionsInRange(dateRange, shouldIncludeTransfers);
      }
    }
    
    // Filter transactions: expense categories by default, plus transfers/asset-allocation if requested
    const expenseCategories = this.getCategoriesOfType('expense');
    let expenseTransactions = transactions.filter(t => expenseCategories.includes(t.category));

    // If the user explicitly filtered by categories, include those even if not in default expense list.
    if (selectedCategoryFilter && selectedCategoryFilter.length > 0) {
      const explicitCategoryTransactions = transactions.filter(t => 
        selectedCategoryFilter!.includes(t.category) && !expenseTransactions.some(e => e.id === t.id)
      );
      if (explicitCategoryTransactions.length > 0) {
        expenseTransactions = [...expenseTransactions, ...explicitCategoryTransactions];
      }
    }
    
    // Add transfers if explicitly requested
    if (shouldIncludeTransfers) {
      const transferTransactions = transactions.filter(t => 
        (t.type === 'transfer' || t.category === 'Internal Transfer') && t.amount < 0 // Only negative transfers for spending
      );
      expenseTransactions = [...expenseTransactions, ...transferTransactions];
    }
    
    // Add asset allocation if explicitly requested
    if (shouldIncludeAssetAllocation) {
      const assetTransactions = transactions.filter(t => 
        isAssetAllocationCategory(t.category) && t.amount < 0 // Only negative for spending
      );
      expenseTransactions = [...expenseTransactions, ...assetTransactions];
    }
    
    // Remove duplicates (in case a transaction matches multiple criteria)
    expenseTransactions = expenseTransactions.filter((transaction, index, self) =>
      index === self.findIndex(t => t.id === transaction.id)
    );
    
    if (expenseTransactions.length === 0) {
      return [];
    }

    // Convert all transactions to default currency for aggregation
    const convertedExpenses = await currencyDisplayService.convertTransactionsBatch(expenseTransactions);
    
    // Group transactions by category
    const categoryTotals: { [category: string]: Transaction[] } = {};
    convertedExpenses.forEach(transaction => {
      const category = transaction.category;
      if (!categoryTotals[category]) {
        categoryTotals[category] = [];
      }
      categoryTotals[category].push(transaction);
    });

    // Calculate total spending for percentage calculation
    // Use the new logic: sum all amounts (positive expenses + negative expenses)
    const totalSpending = convertedExpenses.reduce((sum, t) => sum + (-t.amount), 0); // Flip sign so negatives become positive

    // Calculate statistics for each category
    return Object.entries(categoryTotals)
      .map(([categoryName, categoryTransactions]) => {
        // Sum all amounts in category (positive and negative) and flip sign to make expenses positive
        const amount = categoryTransactions.reduce((sum, t) => sum + (-t.amount), 0);
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

  async getMonthlySpendingTrends(filters?: ReportsFilters): Promise<MonthlySpendingTrend[]>;
  async getMonthlySpendingTrends(dateRange?: DateRange, selectedTypes?: string[]): Promise<MonthlySpendingTrend[]>;
  async getMonthlySpendingTrends(dateRange?: DateRange, includeTransfers?: boolean): Promise<MonthlySpendingTrend[]>;
  async getMonthlySpendingTrends(filtersOrDateRange?: ReportsFilters | DateRange, selectedTypesOrIncludeTransfers?: string[] | boolean): Promise<MonthlySpendingTrend[]> {
    let transactions: Transaction[];
    
    // Handle the new ReportsFilters interface
    if (filtersOrDateRange && (
      'selectedCategories' in filtersOrDateRange || 
      'selectedAccounts' in filtersOrDateRange || 
      'selectedTypes' in filtersOrDateRange
    )) {
      const filters = filtersOrDateRange as ReportsFilters;
      transactions = await this.getFilteredTransactions(filters);
    } else {
      // Handle legacy calls
      const dateRange = filtersOrDateRange as DateRange | undefined;
      if (Array.isArray(selectedTypesOrIncludeTransfers)) {
        // New behavior with selectedTypes array
        transactions = await this.getTransactionsInRange(dateRange, true); // Get all transactions
      } else {
        // Legacy behavior with includeTransfers boolean
        const includeTransfers = selectedTypesOrIncludeTransfers || false;
        transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
      }
    }
    
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
        let expenseTransactions: Transaction[];
        let incomeTransactions: Transaction[];
        let shouldIncludeTransfers = false;
        let shouldIncludeAssetAllocation = false;
        
        // Determine what to include based on parameters
        if (filtersOrDateRange && (
          'selectedCategories' in filtersOrDateRange || 
          'selectedAccounts' in filtersOrDateRange || 
          'selectedTypes' in filtersOrDateRange
        )) {
          const filters = filtersOrDateRange as ReportsFilters;
          const selectedTypes = filters.selectedTypes || ['income', 'expense'];
          shouldIncludeTransfers = selectedTypes.includes('transfer');
          shouldIncludeAssetAllocation = selectedTypes.includes('asset-allocation');
        } else if (Array.isArray(selectedTypesOrIncludeTransfers)) {
          shouldIncludeTransfers = selectedTypesOrIncludeTransfers.includes('transfer');
          shouldIncludeAssetAllocation = selectedTypesOrIncludeTransfers.includes('asset-allocation');
        } else {
          shouldIncludeTransfers = selectedTypesOrIncludeTransfers || false;
        }
        
        // Filter by category type instead of transaction type for all cases
        const expenseCategories = this.getCategoriesOfType('expense');
        const incomeCategories = this.getCategoriesOfType('income');
        
        expenseTransactions = monthTransactions.filter(t => expenseCategories.includes(t.category));
        incomeTransactions = monthTransactions.filter(t => incomeCategories.includes(t.category));
        
        // Add transfers if requested
        if (shouldIncludeTransfers) {
          const transferTransactions = monthTransactions.filter(t => 
            t.type === 'transfer' || t.category === 'Internal Transfer'
          );
          // Add to expenses or income based on amount
          transferTransactions.forEach(t => {
            if (t.amount < 0) {
              expenseTransactions.push(t);
            } else {
              incomeTransactions.push(t);
            }
          });
        }
        
        // Add asset allocation if requested
        if (shouldIncludeAssetAllocation) {
          const assetTransactions = monthTransactions.filter(t => 
            isAssetAllocationCategory(t.category)
          );
          // Add to expenses or income based on amount
          assetTransactions.forEach(t => {
            if (t.amount < 0) {
              expenseTransactions.push(t);
            } else {
              incomeTransactions.push(t);
            }
          });
        }
        
        // Calculate totals using new logic
        const totalSpending = expenseTransactions.reduce((sum, t) => sum + (-t.amount), 0); // Flip sign for expenses
        const totalIncome = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

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

  async getIncomeExpenseAnalysis(filters?: ReportsFilters): Promise<IncomeExpenseAnalysis>;
  async getIncomeExpenseAnalysis(dateRange?: DateRange, selectedTypes?: string[]): Promise<IncomeExpenseAnalysis>;
  async getIncomeExpenseAnalysis(dateRange?: DateRange, includeTransfers?: boolean): Promise<IncomeExpenseAnalysis>;
  async getIncomeExpenseAnalysis(filtersOrDateRange?: ReportsFilters | DateRange, selectedTypesOrIncludeTransfers?: string[] | boolean): Promise<IncomeExpenseAnalysis> {
    let transactions: Transaction[];
    let incomeTransactions: Transaction[];
    let expenseTransactions: Transaction[];
    
    // Handle the new ReportsFilters interface
    if (filtersOrDateRange && (
      'selectedCategories' in filtersOrDateRange || 
      'selectedAccounts' in filtersOrDateRange || 
      'selectedTypes' in filtersOrDateRange
    )) {
      const filters = filtersOrDateRange as ReportsFilters;
      transactions = await this.getFilteredTransactions(filters);
      const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
      const selectedTypes = filters.selectedTypes || ['income', 'expense'];
      incomeTransactions = await this.filterTransactionsForReports(converted, 'income', selectedTypes);
      expenseTransactions = await this.filterTransactionsForReports(converted, 'expense', selectedTypes);
    } else if (Array.isArray(selectedTypesOrIncludeTransfers)) {
      // New behavior with selectedTypes array
      const dateRange = filtersOrDateRange as DateRange | undefined;
      transactions = await this.getTransactionsInRange(dateRange, true);
      const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
      incomeTransactions = await this.filterTransactionsForReports(converted, 'income', selectedTypesOrIncludeTransfers);
      expenseTransactions = await this.filterTransactionsForReports(converted, 'expense', selectedTypesOrIncludeTransfers);
    } else {
      // Legacy behavior with includeTransfers boolean
      const dateRange = filtersOrDateRange as DateRange | undefined;
      const includeTransfers = selectedTypesOrIncludeTransfers || false;
      transactions = await this.getTransactionsInRange(dateRange, includeTransfers);
      const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
      incomeTransactions = await this.filterTransactionsForReportsLegacy(converted, 'income', includeTransfers);
      expenseTransactions = await this.filterTransactionsForReportsLegacy(converted, 'expense', includeTransfers);
    }
    
    const totalIncome = incomeTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const totalExpenses = expenseTransactions.reduce((sum, t) => sum + (-t.amount), 0);

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
  // For deep dive we intentionally do NOT exclude internal transfers for the target category
  // because broad transfer heuristics were removing valid category transactions.
    const all = await dataService.getAllTransactions();
    const inRange = dateRange ? all.filter(t => t.date >= dateRange.startDate && t.date <= dateRange.endDate) : all;
    let working = inRange;
    if (!includeTransfers) {
      // Exclude all internal transfers, regardless of category
      working = inRange.filter(t => !this.isInternalTransfer(t));
    }
    const transactions = working;
    const preferences = await userPreferencesService.getPreferences();
    
    const categoryTransactionsRaw = transactions
      .filter(t => {
        if (t.category !== categoryName) return false;
        // Do NOT exclude internal transfers for the category itself; we want full parity with pie chart selection
        if (isAssetAllocationCategory(t.category) && !preferences.includeInvestmentsInReports) return false;
        return true;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
    const categoryTransactions = await currencyDisplayService.convertTransactionsBatch(categoryTransactionsRaw);

    if (categoryTransactions.length === 0) {
      return null;
    }

  // Calculate net spending: properly handle expenses and refunds based on category type
  // This handles cases like: Purchase1: -$400, Purchase2: -$200, Refund: $100 = 400 + 200 - 100 = $500
  
  // Determine if this is an expense or income category
  const expenseCategories = this.getCategoriesOfType('expense');
  const incomeCategories = this.getCategoriesOfType('income');
  const isExpenseCategory = expenseCategories.includes(categoryName);
  const isIncomeCategory = incomeCategories.includes(categoryName);

  let totalAmount: number;
  let transactionCount: number;
  let averageTransaction: number;

  if (isExpenseCategory) {
    // For expense categories: properly handle refunds by subtracting positive amounts
    totalAmount = categoryTransactions.reduce((sum, t) => {
      if (t.amount < 0) {
        // Expense: add absolute value to total spending
        return sum + Math.abs(t.amount);
      } else {
        // Refund: subtract from total spending
        return sum - t.amount;
      }
    }, 0);
    
    // Count only spending transactions for compatibility
    const spendingTransactions = categoryTransactions.filter(t => t.amount < 0);
    transactionCount = spendingTransactions.length;
    averageTransaction = transactionCount > 0 ? totalAmount / transactionCount : 0;
  } else if (isIncomeCategory) {
    // For income categories: sum all amounts (positive and negative income)
    totalAmount = categoryTransactions.reduce((sum, t) => sum + t.amount, 0);
    transactionCount = categoryTransactions.length;
    averageTransaction = transactionCount > 0 ? totalAmount / transactionCount : 0;
  } else {
    // Fallback for other categories: use refund-aware calculation
    totalAmount = categoryTransactions.reduce((sum, t) => {
      if (t.amount < 0) {
        // Expense: add absolute value to total spending
        return sum + Math.abs(t.amount);
      } else {
        // Refund: subtract from total spending
        return sum - t.amount;
      }
    }, 0);
    
    const spendingTransactions = categoryTransactions.filter(t => t.amount < 0);
    transactionCount = spendingTransactions.length;
    averageTransaction = transactionCount > 0 ? totalAmount / transactionCount : 0;
  }
    
    // Find largest and smallest transactions
  const sortedByAmount = [...categoryTransactions].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const largestTransaction = sortedByAmount[0] || categoryTransactions[0];
  const smallestTransaction = sortedByAmount[sortedByAmount.length - 1] || categoryTransactions[categoryTransactions.length - 1];
    
  // Use all transactions in the selected date range for drilldown (avoid arbitrary 100 limit so charts reflect full period)
  const recentTransactions = categoryTransactions; // already sorted most recent first
    
    // Determine granularity and calculate trend
    const { granularity, title } = this.determineTrendGranularity(dateRange);
    const trendTotals: { [periodKey: string]: { amount: number; date: Date } } = {};
    
    categoryTransactions.forEach(transaction => {
      const periodKey = this.getPeriodKey(transaction.date, granularity);
      if (!trendTotals[periodKey]) {
        trendTotals[periodKey] = { amount: 0, date: transaction.date };
      }
      // Use the same calculation logic as the total amount to ensure consistency
      if (isExpenseCategory) {
        // For expense categories: properly handle refunds by subtracting positive amounts
        if (transaction.amount < 0) {
          // Expense: add absolute value
          trendTotals[periodKey].amount += Math.abs(transaction.amount);
        } else {
          // Refund: subtract amount
          trendTotals[periodKey].amount -= transaction.amount;
        }
      } else if (isIncomeCategory) {
        // For income categories: sum all amounts
        trendTotals[periodKey].amount += transaction.amount;
      } else {
        // Fallback for other categories: use refund-aware calculation
        if (transaction.amount < 0) {
          // Expense: add absolute value
          trendTotals[periodKey].amount += Math.abs(transaction.amount);
        } else {
          // Refund: subtract amount
          trendTotals[periodKey].amount -= transaction.amount;
        }
      }
    });
    
    const trend = Object.entries(trendTotals)
      .map(([periodKey, data]) => {
        let label: string;
        let sortDate: Date;
        if (granularity === 'weekly') {
          const weekStart = new Date(periodKey);
            label = this.formatPeriodLabel(data.date, granularity, weekStart);
            sortDate = weekStart;
        } else if (granularity === 'monthly') {
            // periodKey YYYY-MM
            sortDate = new Date(periodKey + '-01T00:00:00');
            label = this.formatPeriodLabel(sortDate, granularity);
        } else { // daily
            sortDate = new Date(periodKey + 'T00:00:00');
            label = this.formatPeriodLabel(sortDate, granularity);
        }
        return { label, amount: data.amount, sortDate };
      })
      .sort((a, b) => a.sortDate.getTime() - b.sortDate.getTime())
      .map(t => ({ label: t.label, amount: t.amount }));

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
  trendTitle: title,
  rangeStart: dateRange?.startDate,
  rangeEnd: dateRange?.endDate
    };
  }

  async getBurnRateAnalysis(filters?: ReportsFilters): Promise<BurnRateAnalysis>;
  async getBurnRateAnalysis(dateRange?: DateRange, includeTransfers?: boolean): Promise<BurnRateAnalysis>;
  async getBurnRateAnalysis(filtersOrDateRange?: ReportsFilters | DateRange, includeTransfers: boolean = false): Promise<BurnRateAnalysis> {
    let transactions: Transaction[];
    let expenseTransactions: Transaction[];
    
    // Handle the new ReportsFilters interface
    if (filtersOrDateRange && (
      'selectedCategories' in filtersOrDateRange || 
      'selectedAccounts' in filtersOrDateRange || 
      'selectedTypes' in filtersOrDateRange
    )) {
      const filters = filtersOrDateRange as ReportsFilters;
      transactions = await this.getFilteredTransactions(filters);
      const converted = await currencyDisplayService.convertTransactionsBatch(transactions);
      const selectedTypes = filters.selectedTypes || ['expense'];
      expenseTransactions = await this.filterTransactionsForReports(converted, 'expense', selectedTypes);
    } else {
      // Legacy behavior
      const dateRange = filtersOrDateRange as DateRange | undefined;
      const allTransactions = await this.getTransactionsInRange(dateRange, includeTransfers);
      const convertedAll = await currencyDisplayService.convertTransactionsBatch(allTransactions);
      expenseTransactions = await this.filterTransactionsForReportsLegacy(convertedAll, 'expense', includeTransfers);
      transactions = convertedAll;
    }
    
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
  const totalSpending = expenseTransactions.reduce((sum, t) => sum + (-t.amount), 0);
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
      .reduce((sum, t) => sum + (-t.amount), 0);
    
    const projectedMonthlySpending = daysPassed > 0 ? (currentMonthExpenses / daysPassed) * daysInMonth : monthlyBurnRate;

    // Get income for balance projection
    const currentMonthIncome = transactions
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
      monthlySpending[monthKey] = (monthlySpending[monthKey] || 0) + (-t.amount);
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

  private async getFilteredTransactions(filters?: ReportsFilters): Promise<Transaction[]> {
    const allTransactions = await dataService.getAllTransactions();
    let filteredTransactions = allTransactions;

    // Apply date range filter
    if (filters?.dateRange) {
      filteredTransactions = filteredTransactions.filter(transaction => 
        transaction.date >= filters.dateRange!.startDate && 
        transaction.date <= filters.dateRange!.endDate
      );
    }

    // Apply category filter
    if (filters?.selectedCategories && filters.selectedCategories.length > 0) {
      filteredTransactions = filteredTransactions.filter(transaction =>
        filters.selectedCategories!.includes(transaction.category)
      );
    }

    // Apply account filter
    if (filters?.selectedAccounts && filters.selectedAccounts.length > 0) {
      filteredTransactions = filteredTransactions.filter(transaction =>
        filters.selectedAccounts!.includes(transaction.account)
      );
    }

    return filteredTransactions;
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

  // Utility function to get current year date range
  getCurrentYearRange(): DateRange {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), 0, 1); // January 1st of current year
    const endDate = new Date(now.getFullYear(), 11, 31); // December 31st of current year
    
    return { startDate, endDate };
  }

  // Utility function to get previous year date range
  getPreviousYearRange(): DateRange {
    const now = new Date();
    const previousYear = now.getFullYear() - 1;
    const startDate = new Date(previousYear, 0, 1); // January 1st of previous year
    const endDate = new Date(previousYear, 11, 31); // December 31st of previous year
    
    return { startDate, endDate };
  }

  // Utility function to get year before last date range
  getYearBeforeLastRange(): DateRange {
    const now = new Date();
    const yearBeforeLast = now.getFullYear() - 2;
    const startDate = new Date(yearBeforeLast, 0, 1); // January 1st of year before last
    const endDate = new Date(yearBeforeLast, 11, 31); // December 31st of year before last
    
    return { startDate, endDate };
  }

  // Get income breakdown by category (similar to spending but for income)
  async getIncomeByCategory(filters?: ReportsFilters): Promise<any[]>;
  async getIncomeByCategory(dateRange?: DateRange, includeTransfers?: boolean): Promise<any[]>;
  async getIncomeByCategory(filtersOrDateRange?: ReportsFilters | DateRange, includeTransfersOrUndefined?: boolean): Promise<any[]> {
    try {
      let transactions: Transaction[];
      let shouldIncludeTransfers = false;
      let shouldIncludeAssetAllocation = false;
      
      // Handle the new ReportsFilters interface
      if (filtersOrDateRange && (
        'selectedCategories' in filtersOrDateRange || 
        'selectedAccounts' in filtersOrDateRange || 
        'selectedTypes' in filtersOrDateRange
      )) {
        const filters = filtersOrDateRange as ReportsFilters;
        transactions = await this.getFilteredTransactions(filters);
        const selectedTypes = filters.selectedTypes || ['income'];
        shouldIncludeTransfers = selectedTypes.includes('transfer');
        shouldIncludeAssetAllocation = selectedTypes.includes('asset-allocation');
      } else {
        // Legacy behavior
        const dateRange = filtersOrDateRange as DateRange | undefined;
        shouldIncludeTransfers = includeTransfersOrUndefined || false;
        transactions = await this.getTransactionsInRange(dateRange, shouldIncludeTransfers);
      }
      
      // Filter transactions: income categories by default, plus transfers/asset-allocation if requested
      const incomeCategories = this.getCategoriesOfType('income');
      let incomeTransactions = transactions.filter(t => incomeCategories.includes(t.category));
      
      // Add transfers if explicitly requested
      if (shouldIncludeTransfers) {
        const transferTransactions = transactions.filter(t => 
          (t.type === 'transfer' || t.category === 'Internal Transfer') && t.amount > 0 // Only positive transfers for income
        );
        incomeTransactions = [...incomeTransactions, ...transferTransactions];
      }
      
      // Add asset allocation if explicitly requested
      if (shouldIncludeAssetAllocation) {
        const assetTransactions = transactions.filter(t => 
          isAssetAllocationCategory(t.category) && t.amount > 0 // Only positive for income
        );
        incomeTransactions = [...incomeTransactions, ...assetTransactions];
      }
      
      // Remove duplicates (in case a transaction matches multiple criteria)
      incomeTransactions = incomeTransactions.filter((transaction, index, self) =>
        index === self.findIndex(t => t.id === transaction.id)
      );
      
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
        // Use new logic: sum all amounts (positive and negative income)
        acc[category].amount += transaction.amount;
        acc[category].count += 1;
        acc[category].transactions.push(transaction);
        return acc;
      }, {} as { [key: string]: { amount: number; count: number; transactions: any[] } });
      
      // Convert to array with additional stats
      return Object.entries(categoryTotals).map(([categoryName, data]) => {
        const dateRange = filtersOrDateRange && 'dateRange' in filtersOrDateRange 
          ? (filtersOrDateRange as ReportsFilters).dateRange
          : (filtersOrDateRange as DateRange | undefined);
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