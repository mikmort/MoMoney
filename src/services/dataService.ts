import { Transaction, DuplicateDetectionResult, DuplicateTransaction } from '../types';
import { v4 as uuidv4 } from 'uuid';

class DataService {
  private transactions: Transaction[] = [];
  private storageKey = 'mo-money-transactions';
  private historyStorageKey = 'mo-money-transaction-history';
  private history: { [transactionId: string]: Array<{ id: string; timestamp: string; data: Transaction; note?: string }> } = {};
  
  // In-memory undo/redo stacks for fast operations during active editing
  private undoStacks: { [transactionId: string]: Transaction[] } = {};
  private redoStacks: { [transactionId: string]: Transaction[] } = {};
  private readonly MAX_UNDO_STACK_SIZE = 10;

  constructor() {
    this.loadFromStorage();
  this.loadHistoryFromStorage();
    // Initialize with sample data if empty
    if (this.transactions.length === 0) {
      this.initializeSampleData();
    }
  }

  private initializeSampleData(): void {
    const sampleTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2025-08-01'),
        description: 'Whole Foods Market #123',
        notes: 'Weekly grocery shopping',
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
        notes: 'Monthly rent payment',
        category: 'Housing',
        subcategory: 'Rent',
        amount: -1200.00,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.99,
        reasoning: 'Rent payment clearly identified',
        isVerified: true
      },
      // Sample transfer transactions for testing
      {
        date: new Date('2025-08-01'),
        description: 'Transfer to Savings - Chase Online',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        amount: -500.00,
        account: 'Chase Checking',
        type: 'transfer',
        confidence: 0.95,
        reasoning: 'Internal transfer identified',
        isVerified: false
      },
      {
        date: new Date('2025-08-01'),
        description: 'Transfer from Checking - Chase Online',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        amount: 500.00,
        account: 'Chase Savings',
        type: 'transfer',
        confidence: 0.95,
        reasoning: 'Internal transfer identified',
        isVerified: false
      },
      {
        date: new Date('2025-07-28'),
        description: 'ATM Withdrawal - Chase ATM #1234',
        category: 'Internal Transfer',
        subcategory: 'Withdrawal',
        amount: -100.00,
        account: 'Chase Checking',
        type: 'transfer',
        confidence: 0.90,
        reasoning: 'ATM withdrawal identified',
        isVerified: false
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

  async updateTransaction(id: string, updates: Partial<Transaction>, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    const current = this.transactions[index];
    
    // Add current state to undo stack before making changes
    this.addToUndoStack(id, { ...current });
    
    // Clear redo stack when making a new change
    this.clearRedoStack(id);
    
    // Record a snapshot of the current transaction before updating (persistent history)
    this.addHistorySnapshot(current.id, current, note);

    this.transactions[index] = {
      ...current,
      ...updates,
      lastModifiedDate: new Date(),
    };
    
    this.saveToStorage();
    this.saveHistoryToStorage();
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
      t.notes?.toLowerCase().includes(lowerQuery) ||
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
        `"${(transaction.notes || '').replace(/"/g, '""')}"`,
        transaction.category,
        transaction.subcategory || '',
        transaction.amount,
        transaction.account || '',
        transaction.type || '',
        transaction.confidence || '',
        `"${(transaction.reasoning || '').replace(/"/g, '""')}"`,
        transaction.addedDate?.toISOString() || '',
        transaction.lastModifiedDate?.toISOString() || '',
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
            notes: transaction.additionalNotes || transaction.notes,
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

  private loadHistoryFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.historyStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Rehydrate dates inside snapshots
        Object.keys(parsed).forEach((txId: string) => {
          parsed[txId] = parsed[txId].map((entry: any) => ({
            ...entry,
            data: {
              ...entry.data,
              date: new Date(entry.data.date),
              addedDate: entry.data.addedDate ? new Date(entry.data.addedDate) : undefined,
              lastModifiedDate: entry.data.lastModifiedDate ? new Date(entry.data.lastModifiedDate) : undefined,
            }
          }));
        });
        this.history = parsed;
      }
    } catch (error) {
      console.error('Failed to load transaction history from storage:', error);
      this.history = {};
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem(this.historyStorageKey, JSON.stringify(this.history));
    } catch (error) {
      console.error('Failed to save transaction history to storage:', error);
    }
  }

  private addHistorySnapshot(transactionId: string, snapshot: Transaction, note?: string): void {
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      data: { ...snapshot },
      note,
    };
    if (!this.history[transactionId]) {
      this.history[transactionId] = [];
    }
    this.history[transactionId].push(entry);
  }

  async getTransactionHistory(transactionId: string): Promise<Array<{ id: string; timestamp: string; data: Transaction; note?: string }>> {
    return [...(this.history[transactionId] || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async restoreTransactionVersion(transactionId: string, versionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    const versions = this.history[transactionId] || [];
    const version = versions.find(v => v.id === versionId);
    if (!version) return null;

    // Snapshot current before restoring
    const current = this.transactions[index];
    this.addHistorySnapshot(transactionId, current, note ? `Before restore: ${note}` : 'Auto-snapshot before restore');

    // Restore
    const restored: Transaction = {
      ...version.data,
      id: transactionId, // ensure id remains the same
      lastModifiedDate: new Date(),
    };
    this.transactions[index] = restored;
    this.saveToStorage();
    this.saveHistoryToStorage();
    return restored;
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
    this.history = {};
    this.undoStacks = {};
    this.redoStacks = {};
    this.saveToStorage();
    this.saveHistoryToStorage();
  }

  // Duplicate detection
  async detectDuplicates(newTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<DuplicateDetectionResult> {
    const duplicates: DuplicateTransaction[] = [];
    const uniqueTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

    for (const newTransaction of newTransactions) {
      const existingTransaction = this.findDuplicate(newTransaction);
      
      if (existingTransaction) {
        duplicates.push({
          existingTransaction,
          newTransaction,
          matchFields: ['date', 'amount', 'description', 'account']
        });
      } else {
        uniqueTransactions.push(newTransaction);
      }
    }

    return {
      duplicates,
      uniqueTransactions
    };
  }

  private findDuplicate(newTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Transaction | null {
    return this.transactions.find(existing => {
      // Compare date (same day)
      const existingDate = new Date(existing.date);
      const newDate = new Date(newTransaction.date);
      const sameDate = existingDate.toDateString() === newDate.toDateString();
      
      // Compare other fields
      const sameAmount = existing.amount === newTransaction.amount;
      const sameDescription = existing.description === newTransaction.description;
      const sameAccount = existing.account === newTransaction.account;
      
      return sameDate && sameAmount && sameDescription && sameAccount;
    }) || null;
  }

  // In-memory undo/redo functionality for fast operations during active editing
  private addToUndoStack(transactionId: string, transactionState: Transaction): void {
    if (!this.undoStacks[transactionId]) {
      this.undoStacks[transactionId] = [];
    }
    
    this.undoStacks[transactionId].push({ ...transactionState });
    
    // Limit stack size to prevent memory issues
    if (this.undoStacks[transactionId].length > this.MAX_UNDO_STACK_SIZE) {
      this.undoStacks[transactionId].shift(); // Remove oldest entry
    }
  }
  
  private addToRedoStack(transactionId: string, transactionState: Transaction): void {
    if (!this.redoStacks[transactionId]) {
      this.redoStacks[transactionId] = [];
    }
    
    this.redoStacks[transactionId].push({ ...transactionState });
    
    // Limit stack size to prevent memory issues
    if (this.redoStacks[transactionId].length > this.MAX_UNDO_STACK_SIZE) {
      this.redoStacks[transactionId].shift(); // Remove oldest entry
    }
  }
  
  private clearRedoStack(transactionId: string): void {
    this.redoStacks[transactionId] = [];
  }
  
  async canUndoTransaction(transactionId: string): Promise<boolean> {
    const undoStack = this.undoStacks[transactionId] || [];
    const historyItems = this.history[transactionId] || [];
    return undoStack.length > 0 || historyItems.length > 0;
  }
  
  async canRedoTransaction(transactionId: string): Promise<boolean> {
    const redoStack = this.redoStacks[transactionId] || [];
    return redoStack.length > 0;
  }
  
  async undoTransactionEdit(transactionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    
    const current = this.transactions[index];
    const undoStack = this.undoStacks[transactionId] || [];
    
    let previousState: Transaction | null = null;
    
    // First try to get from in-memory undo stack
    if (undoStack.length > 0) {
      previousState = undoStack.pop()!;
    } else {
      // Fall back to persistent history if no in-memory undo available
      const historyItems = this.history[transactionId] || [];
      if (historyItems.length > 0) {
        // Get the most recent history item
        const sortedHistory = [...historyItems].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        previousState = sortedHistory[0].data;
      }
    }
    
    if (!previousState) return null;
    
    // Add current state to redo stack
    this.addToRedoStack(transactionId, current);
    
    // Restore previous state
    const restoredTransaction: Transaction = {
      ...previousState,
      id: transactionId, // Ensure ID remains the same
      lastModifiedDate: new Date()
    };
    
    this.transactions[index] = restoredTransaction;
    
    // Add a history snapshot for the undo operation
    this.addHistorySnapshot(transactionId, current, note ? `Undo: ${note}` : 'Undo edit operation');
    
    this.saveToStorage();
    this.saveHistoryToStorage();
    return restoredTransaction;
  }
  
  async redoTransactionEdit(transactionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    
    const redoStack = this.redoStacks[transactionId] || [];
    if (redoStack.length === 0) return null;
    
    const current = this.transactions[index];
    const nextState = redoStack.pop()!;
    
    // Add current state to undo stack
    this.addToUndoStack(transactionId, current);
    
    // Restore next state
    const restoredTransaction: Transaction = {
      ...nextState,
      id: transactionId, // Ensure ID remains the same
      lastModifiedDate: new Date()
    };
    
    this.transactions[index] = restoredTransaction;
    
    // Add a history snapshot for the redo operation
    this.addHistorySnapshot(transactionId, current, note ? `Redo: ${note}` : 'Redo edit operation');
    
    this.saveToStorage();
    this.saveHistoryToStorage();
    return restoredTransaction;
  }
  
  async getUndoRedoStatus(transactionId: string): Promise<{
    canUndo: boolean;
    canRedo: boolean;
    undoStackSize: number;
    redoStackSize: number;
  }> {
    const undoStack = this.undoStacks[transactionId] || [];
    const redoStack = this.redoStacks[transactionId] || [];
    const historyItems = this.history[transactionId] || [];
    
    return {
      canUndo: undoStack.length > 0 || historyItems.length > 0,
      canRedo: redoStack.length > 0,
      undoStackSize: undoStack.length,
      redoStackSize: redoStack.length
    };
  }
}

// Create singleton instance
export const dataService = new DataService();
export default dataService;
