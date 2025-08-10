import { Budget, Transaction, Category } from '../types';
import { v4 as uuidv4 } from 'uuid';

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
   * Calculate budget progress for a specific budget
   */
  calculateBudgetProgress(budget: Budget, transactions: Transaction[], categories: Category[]): {
    budgetId: string;
    categoryName: string;
    budgetAmount: number;
    actualSpent: number;
    percentage: number;
    remaining: number;
    status: 'safe' | 'warning' | 'danger' | 'exceeded';
    daysInPeriod: number;
    daysRemaining: number;
  } {
    const category = categories.find(c => c.id === budget.categoryId);
    const categoryName = category?.name || 'Unknown Category';

    // Calculate period dates
    const { startDate, endDate } = this.getBudgetPeriodDates(budget);
    
    // Filter transactions for this category and period
    // Match by category name rather than ID since transactions store category names
    const categoryTransactions = transactions.filter(t => {
      // Handle both direct category name match and subcategory format (e.g., "Food & Dining → Groceries")
      const transactionCategory = t.category;
      const isMainCategory = transactionCategory === categoryName;
      const isSubcategory = transactionCategory && transactionCategory.startsWith(categoryName + ' →');
      
      return (isMainCategory || isSubcategory) &&
             t.type === 'expense' &&
             t.date >= startDate &&
             t.date <= endDate;
    });

    const actualSpent = categoryTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const percentage = (actualSpent / budget.amount) * 100;
    const remaining = budget.amount - actualSpent;

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
      budgetAmount: budget.amount,
      actualSpent,
      percentage: Math.round(percentage * 100) / 100,
      remaining,
      status,
      daysInPeriod,
      daysRemaining,
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
   * Get budget progress for all active budgets
   */
  getBudgetProgressForAll(transactions: Transaction[], categories: Category[]) {
    const activeBudgets = this.getActiveBudgets();
    return activeBudgets.map(budget => 
      this.calculateBudgetProgress(budget, transactions, categories)
    );
  }

  /**
   * Get budget recommendations based on spending patterns
   */
  getBudgetRecommendations(transactions: Transaction[], categories: Category[]): {
    categoryId: string;
    categoryName: string;
    averageMonthlySpend: number;
    recommendedBudget: number;
    reasoning: string;
  }[] {
    // Calculate average monthly spending per category
    const categorySpending: { [categoryId: string]: number[] } = {};
    
    // Get last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    
    const recentTransactions = transactions.filter(t => 
      t.type === 'expense' && t.date >= sixMonthsAgo
    );

    // Group by category and month
    recentTransactions.forEach(t => {
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