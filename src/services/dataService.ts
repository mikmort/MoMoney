import { Transaction, Category, Subcategory } from '../types';
import { v4 as uuidv4 } from 'uuid';

class DataService {
  private transactions: Transaction[] = [];
  private storageKey = 'mo-money-transactions';

  constructor() {
    this.loadFromStorage();
    // Initialize with sample data if empty
    if (this.transactions.length === 0) {
      this.initializeSampleData();
    }
  }

  private initializeSampleData(): void {
    const now = new Date();
    const sampleTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2025-08-01'),
        description: 'Whole Foods Market #123',
        additionalNotes: 'Weekly grocery shopping',
        category: 'Food & Dining',
        subcategory: 'Groceries',
        amount: -125.50,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.95,
        reasoning: 'High confidence grocery store categorization',
        isVerified: false,
        vendor: 'Whole Foods'
      },
      {
        date: new Date('2025-08-01'),
        description: 'Starbucks Coffee',
        category: 'Food & Dining',
        subcategory: 'Coffee Shops',
        amount: -4.50,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.89,
        reasoning: 'Coffee shop transaction identified',
        isVerified: true
      },
      {
        date: new Date('2025-07-31'),
        description: 'Payroll Deposit - ABC Corp',
        category: 'Income',
        subcategory: 'Salary',
        amount: 2500.00,
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.98,
        reasoning: 'Payroll deposit clearly identified',
        isVerified: true
      },
      {
        date: new Date('2025-07-30'),
        description: 'Shell Gas Station',
        category: 'Transportation',
        subcategory: 'Gas & Fuel',
        amount: -75.00,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.92,
        reasoning: 'Gas station transaction',
        isVerified: false
      },
      {
        date: new Date('2025-07-30'),
        description: 'Rent Payment - Apartment Complex',
        additionalNotes: 'Monthly rent payment',
        category: 'Housing',
        subcategory: 'Rent',
        amount: -1200.00,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.99,
        reasoning: 'Rent payment clearly identified',
        isVerified: true
      }
    ];

    // Add sample transactions
    this.addTransactions(sampleTransactions);
  }

  // Core CRUD operations
  async getAllTransactions(): Promise<Transaction[]> {
    console.log(`DataService: getAllTransactions called, returning ${this.transactions.length} transactions`);
    return [...this.transactions];
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    return this.transactions.find(t => t.id === id) || null;
  }

  async addTransaction(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<Transaction> {
    const now = new Date();
    const newTransaction: Transaction = {
      ...transaction,
      id: uuidv4(),
      addedDate: now,
      lastModifiedDate: now,
    };
    
    this.transactions.push(newTransaction);
    this.saveToStorage();
    return newTransaction;
  }

  async addTransactions(transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<Transaction[]> {
    console.log(`DataService: Adding ${transactions.length} transactions`);
    const now = new Date();
    const newTransactions = transactions.map(transaction => ({
      ...transaction,
      id: uuidv4(),
      addedDate: now,
      lastModifiedDate: now,
    }));
    
    console.log(`DataService: Created ${newTransactions.length} new transaction objects`);
    this.transactions.push(...newTransactions);
    console.log(`DataService: Total transactions now: ${this.transactions.length}`);
    this.saveToStorage();
    console.log(`DataService: Saved to localStorage`);
    return newTransactions;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;

    this.transactions[index] = {
      ...this.transactions[index],
      ...updates,
      lastModifiedDate: new Date(),
    };
    
    this.saveToStorage();
    return this.transactions[index];
  }

  async deleteTransaction(id: string): Promise<boolean> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return false;

    this.transactions.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  async deleteTransactions(ids: string[]): Promise<number> {
    const initialLength = this.transactions.length;
    this.transactions = this.transactions.filter(t => !ids.includes(t.id));
    const deletedCount = initialLength - this.transactions.length;
    
    if (deletedCount > 0) {
      this.saveToStorage();
    }
    
    return deletedCount;
  }

  // Query operations
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    return this.transactions.filter(t => 
      t.date >= startDate && t.date <= endDate
    );
  }

  async getTransactionsByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    return this.transactions.filter(t => 
      t.category === category && 
      (subcategory === undefined || t.subcategory === subcategory)
    );
  }

  async searchTransactions(query: string): Promise<Transaction[]> {
    const lowerQuery = query.toLowerCase();
    return this.transactions.filter(t => 
      t.description.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery) ||
      t.subcategory?.toLowerCase().includes(lowerQuery) ||
      t.additionalNotes?.toLowerCase().includes(lowerQuery) ||
      t.vendor?.toLowerCase().includes(lowerQuery)
    );
  }

  // Export/Import operations
  async exportToJSON(): Promise<string> {
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      transactions: this.transactions,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async exportToCSV(): Promise<string> {
    const headers = [
      'ID', 'Date', 'Description', 'Additional Notes', 'Category', 
      'Subcategory', 'Amount', 'Account', 'Type', 'Confidence', 
      'Reasoning', 'Added Date', 'Last Modified Date'
    ];
    
    const csvRows = [headers.join(',')];
    
    this.transactions.forEach(transaction => {
      const row = [
        transaction.id,
        transaction.date.toISOString().split('T')[0],
        `"${transaction.description.replace(/"/g, '""')}"`,
        `"${(transaction.additionalNotes || '').replace(/"/g, '""')}"`,
        transaction.category,
        transaction.subcategory || '',
        transaction.amount,
        transaction.account || '',
        transaction.type || '',
        transaction.confidence || '',
        `"${(transaction.reasoning || '').replace(/"/g, '""')}"`,
        transaction.addedDate.toISOString(),
        transaction.lastModifiedDate.toISOString(),
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  async importFromJSON(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const data = JSON.parse(jsonData);
      const errors: string[] = [];
      let imported = 0;

      if (!data.transactions || !Array.isArray(data.transactions)) {
        throw new Error('Invalid JSON format: transactions array not found');
      }

      const validTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

      data.transactions.forEach((transaction: any, index: number) => {
        try {
          // Validate required fields
          if (!transaction.date || !transaction.description || !transaction.category || transaction.amount === undefined) {
            errors.push(`Row ${index + 1}: Missing required fields`);
            return;
          }

          const validTransaction = {
            date: new Date(transaction.date),
            description: transaction.description,
            additionalNotes: transaction.additionalNotes,
            category: transaction.category,
            subcategory: transaction.subcategory,
            amount: Number(transaction.amount),
            account: transaction.account,
            type: transaction.type,
            isRecurring: transaction.isRecurring,
            tags: transaction.tags,
            originalText: transaction.originalText,
            confidence: transaction.confidence,
            reasoning: transaction.reasoning,
            isVerified: transaction.isVerified,
            vendor: transaction.vendor,
            location: transaction.location,
          };

          validTransactions.push(validTransaction);
          imported++;
        } catch (error) {
          errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      });

      if (validTransactions.length > 0) {
        await this.addTransactions(validTransactions);
      }

      return { success: true, imported, errors };
    } catch (error) {
      return { 
        success: false, 
        imported: 0, 
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'] 
      };
    }
  }

  // Storage operations
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.transactions = data.map((t: any) => ({
          ...t,
          date: new Date(t.date),
          addedDate: new Date(t.addedDate),
          lastModifiedDate: new Date(t.lastModifiedDate),
        }));
      }
    } catch (error) {
      console.error('Failed to load transactions from storage:', error);
      this.transactions = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.transactions));
    } catch (error) {
      console.error('Failed to save transactions to storage:', error);
    }
  }

  // Utility methods
  async getStats(): Promise<{
    total: number;
    totalIncome: number;
    totalExpenses: number;
    categories: { [category: string]: number };
  }> {
    const stats = {
      total: this.transactions.length,
      totalIncome: 0,
      totalExpenses: 0,
      categories: {} as { [category: string]: number },
    };

    this.transactions.forEach(transaction => {
      if (transaction.type === 'income' || transaction.amount > 0) {
        stats.totalIncome += Math.abs(transaction.amount);
      } else {
        stats.totalExpenses += Math.abs(transaction.amount);
      }

      const category = transaction.category;
      stats.categories[category] = (stats.categories[category] || 0) + Math.abs(transaction.amount);
    });

    return stats;
  }

  async clearAllData(): Promise<void> {
    this.transactions = [];
    this.saveToStorage();
  }
}

// Create singleton instance
export const dataService = new DataService();
export default dataService;
