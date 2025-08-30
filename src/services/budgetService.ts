import { Budget, Transaction, Category, BudgetViewPeriod } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { isExpenseCategory } from '../utils/categoryTypeUtils';
import { currencyDisplayService } from './currencyDisplayService';

class BudgetService {
  private budgets: Budget[] = [];
  private readonly STORAGE_KEY = 'mo-money-budgets';

  constructor() {
    this.loadBudgets();
  }

  private loadBudgets(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Convert date strings back to Date objects
        this.budgets = parsed.map((budget: any) => ({
          ...budget,
          startDate: new Date(budget.startDate),
          endDate: budget.endDate ? new Date(budget.endDate) : undefined,
        }));
      } else {
        // Initialize with some sample budgets
        this.initializeSampleBudgets();
      }
    } catch (error) {
      console.error('Failed to load budgets:', error);
      this.budgets = [];
      this.initializeSampleBudgets();
    }
  }

  private saveBudgets(): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.budgets));
    } catch (error) {
      console.error('Failed to save budgets:', error);
    }
  }

  private initializeSampleBudgets(): void {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    this.budgets = [
      {
        id: uuidv4(),
        name: 'Monthly Food & Dining',
        categoryId: 'food',
        amount: 800,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 80,
      },
      {
        id: uuidv4(),
        name: 'Transportation Budget',
        categoryId: 'transportation',
        amount: 300,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 90,
      },
      {
        id: uuidv4(),
        name: 'Entertainment Fund',
        categoryId: 'entertainment',
        amount: 200,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 75,
      },
      {
        id: uuidv4(),
        name: 'Shopping Budget',
        categoryId: 'shopping',
        amount: 400,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 80,
      },
      {
        id: uuidv4(),
        name: 'Personal Care Budget',
        categoryId: 'personal',
        amount: 300,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 85,
      },
      {
        id: uuidv4(),
        name: 'Travel Budget',
        categoryId: 'travel',
        amount: 500,
        period: 'monthly',
        startDate: startOfMonth,
        isActive: true,
        alertThreshold: 90,
      },
    ];
    this.saveBudgets();
  }

  getAllBudgets(): Budget[] {
    return [...this.budgets];
  }

  getActiveBudgets(): Budget[] {
    return this.budgets.filter(budget => budget.isActive);
  }

  getBudgetById(id: string): Budget | undefined {
    return this.budgets.find(budget => budget.id === id);
  }

  createBudget(budgetData: Omit<Budget, 'id'>): Budget {
    const newBudget: Budget = {
      ...budgetData,
      id: uuidv4(),
    };
    
    this.budgets.push(newBudget);
    this.saveBudgets();
    return newBudget;
  }

  updateBudget(id: string, updates: Partial<Omit<Budget, 'id'>>): Budget | null {
    const index = this.budgets.findIndex(budget => budget.id === id);
    if (index === -1) return null;

    this.budgets[index] = { ...this.budgets[index], ...updates };
    this.saveBudgets();
    return this.budgets[index];
  }

  deleteBudget(id: string): boolean {
    const index = this.budgets.findIndex(budget => budget.id === id);
    if (index === -1) return false;

    this.budgets.splice(index, 1);
    this.saveBudgets();
    return true;
  }

  /**
   * Calculate budget amount based on view period
   * Budgets are stored as monthly amounts, so we need to adjust for other periods
   */
  private calculateBudgetAmountForViewPeriod(budget: Budget, viewPeriod: BudgetViewPeriod): number {
    // All budgets are stored as monthly amounts regardless of their defined period
    const monthlyAmount = budget.amount;
    
    switch (viewPeriod) {
      case 'weekly':
        return monthlyAmount / 4.33; // Average weeks per month
      case 'monthly':
        return monthlyAmount;
      case 'quarterly':
        return monthlyAmount * 3;
      case 'annual':
        return monthlyAmount * 12;
      default:
        return monthlyAmount;
    }
  }

  /**
   * Get view period dates based on selected view period and reference date
   */
  private getViewPeriodDates(viewPeriod: BudgetViewPeriod, referenceDate: { year: number; month: number }): { startDate: Date; endDate: Date } {
    switch (viewPeriod) {
      case 'weekly':
        // Find the week that contains the first day of the specified month
        const monthStart = new Date(referenceDate.year, referenceDate.month, 1);
        const dayOfWeek = monthStart.getDay();
        const weekStart = new Date(monthStart.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
        const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
        return { startDate: weekStart, endDate: weekEnd };
        
      case 'monthly':
        return {
          startDate: new Date(referenceDate.year, referenceDate.month, 1),
          endDate: new Date(referenceDate.year, referenceDate.month + 1, 0) // Last day of the month
        };
        
      case 'quarterly':
        // Find which quarter the month belongs to
        const quarterStartMonth = Math.floor(referenceDate.month / 3) * 3;
        return {
          startDate: new Date(referenceDate.year, quarterStartMonth, 1),
          endDate: new Date(referenceDate.year, quarterStartMonth + 3, 0)
        };
        
      case 'annual':
        return {
          startDate: new Date(referenceDate.year, 0, 1),
          endDate: new Date(referenceDate.year, 12, 0)
        };
        
      default:
        return {
          startDate: new Date(referenceDate.year, referenceDate.month, 1),
          endDate: new Date(referenceDate.year, referenceDate.month + 1, 0)
        };
    }
  }

  /**
   * Calculate budget progress for a specific budget
   */
  async calculateBudgetProgress(budget: Budget, transactions: Transaction[], categories: Category[], forMonth?: { year: number; month: number }): Promise<{
    budgetId: string;
    categoryName: string;
    budgetAmount: number;
    actualSpent: number;
    percentage: number;
    remaining: number;
    status: 'safe' | 'warning' | 'danger' | 'exceeded';
    daysInPeriod: number;
    daysRemaining: number;
    transactions: Transaction[];
  }> {
    const category = categories.find(c => c.id === budget.categoryId);
    const categoryName = category?.name || 'Unknown Category';

    // Calculate period dates - if forMonth is provided, override for that specific month
    const { startDate, endDate } = forMonth 
      ? this.getBudgetPeriodDatesForMonth(budget, forMonth)
      : this.getBudgetPeriodDates(budget);
    
    // Filter transactions for this category and period
    // Match by category name rather than ID since transactions store category names
    const categoryTransactions = transactions.filter(t => {
      // Handle both direct category name match and subcategory format (e.g., "Food & Dining → Groceries")
      const transactionCategory = t.category;
      const isMainCategory = transactionCategory === categoryName;
      const isSubcategory = transactionCategory && transactionCategory.startsWith(categoryName + ' →');
      
      return (isMainCategory || isSubcategory) &&
             isExpenseCategory(t.category) &&
             t.date >= startDate &&
             t.date <= endDate;
    });

    // Convert transactions to default currency for accurate budget calculations
    const convertedCategoryTransactions = await currencyDisplayService.convertTransactionsBatch(categoryTransactions);

    const actualSpent = convertedCategoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0); // Use absolute value to handle both positive and negative amounts
    const percentage = (actualSpent / budget.amount) * 100;
    const remaining = budget.amount - actualSpent;

    // Calculate days - use current date or the end of the specified month
    const now = forMonth 
      ? new Date(forMonth.year, forMonth.month, 1) // Use start of specified month for reference
      : new Date();
    const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine status
    let status: 'safe' | 'warning' | 'danger' | 'exceeded' = 'safe';
    if (percentage >= 100) {
      status = 'exceeded';
    } else if (percentage >= (budget.alertThreshold || 80)) {
      status = 'danger';
    } else if (percentage >= 60) {
      status = 'warning';
    }

    return {
      budgetId: budget.id,
      categoryName,
      budgetAmount: budget.amount,
      actualSpent,
      percentage: Math.round(percentage * 100) / 100,
      remaining,
      status,
      daysInPeriod,
      daysRemaining,
      transactions: convertedCategoryTransactions,
    };
  }

  /**
   * Get budget period start and end dates
   */
  private getBudgetPeriodDates(budget: Budget): { startDate: Date; endDate: Date } {
    const start = new Date(budget.startDate);
    let end = new Date(budget.endDate || budget.startDate);

    if (!budget.endDate) {
      // Calculate end date based on period
      switch (budget.period) {
        case 'weekly':
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          end = new Date(start.getFullYear(), start.getMonth() + 1, 0); // Last day of the month
          break;
        case 'quarterly':
          end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
          break;
        case 'yearly':
          end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
          break;
      }
    }

    return { startDate: start, endDate: end };
  }

  /**
   * Get budget period start and end dates for a specific month
   */
  private getBudgetPeriodDatesForMonth(budget: Budget, forMonth: { year: number; month: number }): { startDate: Date; endDate: Date } {
    // For monthly budgets, use the specific month requested
    // For other periods, calculate the period that contains the specified month
    
    switch (budget.period) {
      case 'weekly':
        // For weekly budgets, find the week that contains the first day of the specified month
        const monthStart = new Date(forMonth.year, forMonth.month, 1);
        const dayOfWeek = monthStart.getDay();
        const startDate = new Date(monthStart.getTime() - (dayOfWeek * 24 * 60 * 60 * 1000));
        const endDate = new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000);
        return { startDate, endDate };
        
      case 'monthly':
        // Use the specific month
        return {
          startDate: new Date(forMonth.year, forMonth.month, 1),
          endDate: new Date(forMonth.year, forMonth.month + 1, 0) // Last day of the month
        };
        
      case 'quarterly':
        // Find which quarter the month belongs to
        const quarterStartMonth = Math.floor(forMonth.month / 3) * 3;
        return {
          startDate: new Date(forMonth.year, quarterStartMonth, 1),
          endDate: new Date(forMonth.year, quarterStartMonth + 3, 0)
        };
        
      case 'yearly':
        // Use the full year
        return {
          startDate: new Date(forMonth.year, 0, 1),
          endDate: new Date(forMonth.year, 12, 0)
        };
        
      default:
        // Fallback to monthly
        return {
          startDate: new Date(forMonth.year, forMonth.month, 1),
          endDate: new Date(forMonth.year, forMonth.month + 1, 0)
        };
    }
  }

  /**
   * Get budget progress for all active budgets
   */
  async getBudgetProgressForAll(transactions: Transaction[], categories: Category[], forMonth?: { year: number; month: number }): Promise<{
    budgetId: string;
    categoryName: string;
    budgetAmount: number;
    actualSpent: number;
    percentage: number;
    remaining: number;
    status: 'safe' | 'warning' | 'danger' | 'exceeded';
    daysInPeriod: number;
    daysRemaining: number;
    transactions: Transaction[];
  }[]> {
    const activeBudgets = this.getActiveBudgets();
    return Promise.all(activeBudgets.map(budget => 
      this.calculateBudgetProgress(budget, transactions, categories, forMonth)
    ));
  }

  /**
   * Get budget progress for all active budgets with view period support
   */
  async getBudgetProgressForAllWithViewPeriod(
    transactions: Transaction[], 
    categories: Category[], 
    referenceDate: { year: number; month: number },
    viewPeriod: BudgetViewPeriod = 'monthly'
  ): Promise<{
    budgetId: string;
    categoryName: string;
    budgetAmount: number;
    actualSpent: number;
    percentage: number;
    remaining: number;
    status: 'safe' | 'warning' | 'danger' | 'exceeded';
    daysInPeriod: number;
    daysRemaining: number;
    transactions: Transaction[];
    viewPeriod: BudgetViewPeriod;
  }[]> {
    const activeBudgets = this.getActiveBudgets();
    return Promise.all(activeBudgets.map(budget => 
      this.calculateBudgetProgressWithViewPeriod(budget, transactions, categories, referenceDate, viewPeriod)
    ));
  }

  /**
   * Calculate budget progress for a specific budget with view period support
   */
  async calculateBudgetProgressWithViewPeriod(
    budget: Budget, 
    transactions: Transaction[], 
    categories: Category[], 
    referenceDate: { year: number; month: number },
    viewPeriod: BudgetViewPeriod = 'monthly'
  ): Promise<{
    budgetId: string;
    categoryName: string;
    budgetAmount: number;
    actualSpent: number;
    percentage: number;
    remaining: number;
    status: 'safe' | 'warning' | 'danger' | 'exceeded';
    daysInPeriod: number;
    daysRemaining: number;
    transactions: Transaction[];
    viewPeriod: BudgetViewPeriod;
  }> {
    const category = categories.find(c => c.id === budget.categoryId);
    const categoryName = category?.name || 'Unknown Category';

    // Get the date range for the view period
    const { startDate, endDate } = this.getViewPeriodDates(viewPeriod, referenceDate);
    
    // Calculate the budget amount for this view period
    const budgetAmount = this.calculateBudgetAmountForViewPeriod(budget, viewPeriod);
    
    // Filter transactions for this category and period
    const categoryTransactions = transactions.filter(t => {
      const transactionCategory = t.category;
      const isMainCategory = transactionCategory === categoryName;
      const isSubcategory = transactionCategory && transactionCategory.startsWith(categoryName + ' →');
      
      return (isMainCategory || isSubcategory) &&
             t.type === 'expense' &&
             t.date >= startDate &&
             t.date <= endDate;
    });

    // Convert transactions to default currency for accurate budget calculations
    const convertedCategoryTransactions = await currencyDisplayService.convertTransactionsBatch(categoryTransactions);

    const actualSpent = convertedCategoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const percentage = budgetAmount > 0 ? (actualSpent / budgetAmount) * 100 : 0;
    const remaining = budgetAmount - actualSpent;

    // Calculate days 
    const now = new Date();
    const daysInPeriod = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Determine status
    let status: 'safe' | 'warning' | 'danger' | 'exceeded' = 'safe';
    if (percentage >= 100) {
      status = 'exceeded';
    } else if (percentage >= (budget.alertThreshold || 80)) {
      status = 'danger';
    } else if (percentage >= 60) {
      status = 'warning';
    }

    return {
      budgetId: budget.id,
      categoryName,
      budgetAmount,
      actualSpent,
      percentage: Math.round(percentage * 100) / 100,
      remaining,
      status,
      daysInPeriod,
      daysRemaining,
      transactions: convertedCategoryTransactions,
      viewPeriod,
    };
  }

  /**
   * Get budget recommendations based on spending patterns
   */
  async getBudgetRecommendations(transactions: Transaction[], categories: Category[]): Promise<{
    categoryId: string;
    categoryName: string;
    averageMonthlySpend: number;
    recommendedBudget: number;
    reasoning: string;
  }[]> {
    // Calculate average monthly spending per category
    const categorySpending: { [categoryId: string]: number[] } = {};
    
    // Get last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const recentTransactions = transactions.filter(t => 
      t.type === 'expense' && t.date >= sixMonthsAgo
    );

    // Convert transactions to default currency for accurate calculations
    const convertedRecentTransactions = await currencyDisplayService.convertTransactionsBatch(recentTransactions);

    // Group by category and month
    convertedRecentTransactions.forEach(t => {
      if (!categorySpending[t.category]) {
        categorySpending[t.category] = [];
      }
      categorySpending[t.category].push(Math.abs(t.amount));
    });

    const recommendations = Object.entries(categorySpending).map(([categoryId, amounts]) => {
      const category = categories.find(c => c.id === categoryId);
      const categoryName = category?.name || 'Unknown Category';
      const averageMonthlySpend = amounts.reduce((sum, amount) => sum + amount, 0) / Math.max(amounts.length, 1);
      
      // Recommend 10-20% buffer on top of average spending
      const recommendedBudget = Math.ceil(averageMonthlySpend * 1.15);
      
      const reasoning = `Based on ${amounts.length} transactions with average monthly spending of $${averageMonthlySpend.toFixed(2)}`;
      
      return {
        categoryId,
        categoryName,
        averageMonthlySpend,
        recommendedBudget,
        reasoning,
      };
    });

    // Sort by average spending (highest first) and return top 10
    return recommendations
      .sort((a, b) => b.averageMonthlySpend - a.averageMonthlySpend)
      .slice(0, 10);
  }
}

export const budgetService = new BudgetService();