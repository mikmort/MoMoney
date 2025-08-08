import { Transaction, DuplicateDetectionResult, DuplicateTransaction } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { db, TransactionHistoryEntry } from './db';

class DataService {
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // Check if we need to migrate from localStorage
      await this.migrateFromLocalStorage();
      
      // Check if we need to initialize with sample data
      const transactionCount = await db.transactions.count();
      if (transactionCount === 0) {
        await this.initializeSampleData();
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize DataService:', error);
      this.isInitialized = true; // Continue even if initialization fails
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async migrateFromLocalStorage(): Promise<void> {
    try {
      // Check if IndexedDB is already initialized
      if (await db.isInitialized()) {
        return;
      }

      const storageKey = 'mo-money-transactions';
      const historyStorageKey = 'mo-money-transaction-history';

      // Migrate transactions from localStorage
      const storedTransactions = localStorage.getItem(storageKey);
      if (storedTransactions) {
        console.log('Migrating transactions from localStorage to IndexedDB...');
        const transactions = JSON.parse(storedTransactions).map((t: any) => ({
          ...t,
          date: new Date(t.date),
          addedDate: new Date(t.addedDate),
          lastModifiedDate: new Date(t.lastModifiedDate),
        }));

        await db.transactions.bulkAdd(transactions);
        console.log(`Migrated ${transactions.length} transactions to IndexedDB`);
      }

      // Migrate transaction history from localStorage
      const storedHistory = localStorage.getItem(historyStorageKey);
      if (storedHistory) {
        console.log('Migrating transaction history from localStorage to IndexedDB...');
        const history = JSON.parse(storedHistory);
        const historyEntries: TransactionHistoryEntry[] = [];

        Object.keys(history).forEach((transactionId: string) => {
          history[transactionId].forEach((entry: any) => {
            historyEntries.push({
              id: entry.id,
              transactionId,
              timestamp: entry.timestamp,
              note: entry.note,
              data: {
                ...entry.data,
                date: new Date(entry.data.date),
                addedDate: entry.data.addedDate ? new Date(entry.data.addedDate) : undefined,
                lastModifiedDate: entry.data.lastModifiedDate ? new Date(entry.data.lastModifiedDate) : undefined,
              }
            });
          });
        });

        if (historyEntries.length > 0) {
          await db.transactionHistory.bulkAdd(historyEntries);
          console.log(`Migrated ${historyEntries.length} history entries to IndexedDB`);
        }
      }

      // Mark as initialized and optionally clear localStorage
      await db.markInitialized();
      console.log('Migration from localStorage to IndexedDB completed successfully');
      
      // Clear localStorage after successful migration (optional - commented out for safety)
      // localStorage.removeItem(storageKey);
      // localStorage.removeItem(historyStorageKey);
    } catch (error) {
      console.error('Error during localStorage migration:', error);
    }
  }

  private async initializeSampleData(): Promise<void> {
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
      }
    ];

    // Add sample transactions
    await this.addTransactions(sampleTransactions);
  }

  // Core CRUD operations
  async getAllTransactions(): Promise<Transaction[]> {
    await this.ensureInitialized();
    try {
      const transactions = await db.transactions.orderBy('date').reverse().toArray();
      console.log(`DataService: getAllTransactions called, returning ${transactions.length} transactions`);
      return transactions;
    } catch (error) {
      console.error('Error getting all transactions:', error);
      return [];
    }
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    try {
      const transaction = await db.transactions.get(id);
      return transaction || null;
    } catch (error) {
      console.error('Error getting transaction by id:', error);
      return null;
    }
  }

  async addTransaction(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<Transaction> {
    await this.ensureInitialized();
    try {
      const now = new Date();
      const newTransaction: Transaction = {
        ...transaction,
        id: uuidv4(),
        addedDate: now,
        lastModifiedDate: now,
      };
      
      await db.transactions.add(newTransaction);
      return newTransaction;
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  }

  async addTransactions(transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<Transaction[]> {
    await this.ensureInitialized();
    try {
      console.log(`DataService: Adding ${transactions.length} transactions`);
      const now = new Date();
      const newTransactions = transactions.map(transaction => ({
        ...transaction,
        id: uuidv4(),
        addedDate: now,
        lastModifiedDate: now,
      }));
      
      console.log(`DataService: Created ${newTransactions.length} new transaction objects`);
      await db.transactions.bulkAdd(newTransactions);
      const totalCount = await db.transactions.count();
      console.log(`DataService: Total transactions now: ${totalCount}`);
      return newTransactions;
    } catch (error) {
      console.error('Error adding transactions:', error);
      throw error;
    }
  }

  async updateTransaction(id: string, updates: Partial<Transaction>, note?: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    try {
      const current = await db.transactions.get(id);
      if (!current) return null;

      // Record a snapshot of the current transaction before updating
      await this.addHistorySnapshot(current.id, current, note);

      const updatedTransaction: Transaction = {
        ...current,
        ...updates,
        id: current.id, // Ensure ID doesn't change
        lastModifiedDate: new Date(),
      };
      
      await db.transactions.put(updatedTransaction);
      return updatedTransaction;
    } catch (error) {
      console.error('Error updating transaction:', error);
      return null;
    }
  }

  async deleteTransaction(id: string): Promise<boolean> {
    await this.ensureInitialized();
    try {
      await db.transactions.delete(id);
      return true;
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return false;
    }
  }

  async deleteTransactions(ids: string[]): Promise<number> {
    await this.ensureInitialized();
    try {
      const deletedCount = await db.transactions.where('id').anyOf(ids).delete();
      return deletedCount;
    } catch (error) {
      console.error('Error deleting transactions:', error);
      return 0;
    }
  }

  // Query operations
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    await this.ensureInitialized();
    try {
      return await db.transactions
        .where('date')
        .between(startDate, endDate, true, true)
        .toArray();
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
      return [];
    }
  }

  async getTransactionsByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    await this.ensureInitialized();
    try {
      let query = db.transactions.where('category').equals(category);
      if (subcategory !== undefined) {
        return await query.and(t => t.subcategory === subcategory).toArray();
      }
      return await query.toArray();
    } catch (error) {
      console.error('Error getting transactions by category:', error);
      return [];
    }
  }

  async searchTransactions(query: string): Promise<Transaction[]> {
    await this.ensureInitialized();
    try {
      const lowerQuery = query.toLowerCase();
      return await db.transactions
        .filter(t => 
          t.description.toLowerCase().includes(lowerQuery) ||
          t.category.toLowerCase().includes(lowerQuery) ||
          (t.subcategory?.toLowerCase().includes(lowerQuery) || false) ||
          (t.notes?.toLowerCase().includes(lowerQuery) || false) ||
          (t.vendor?.toLowerCase().includes(lowerQuery) || false)
        )
        .toArray();
    } catch (error) {
      console.error('Error searching transactions:', error);
      return [];
    }
  }

  // Export/Import operations
  async exportToJSON(): Promise<string> {
    await this.ensureInitialized();
    try {
      const transactions = await db.transactions.toArray();
      const exportData = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        transactions: transactions,
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Error exporting to JSON:', error);
      throw error;
    }
  }

  async exportToCSV(): Promise<string> {
    await this.ensureInitialized();
    try {
      const transactions = await db.transactions.toArray();
      const headers = [
        'ID', 'Date', 'Description', 'Additional Notes', 'Category', 
        'Subcategory', 'Amount', 'Account', 'Type', 'Confidence', 
        'Reasoning', 'Added Date', 'Last Modified Date'
      ];
      
      const csvRows = [headers.join(',')];
      
      transactions.forEach(transaction => {
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
    } catch (error) {
      console.error('Error exporting to CSV:', error);
      throw error;
    }
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

  // History operations
  private async addHistorySnapshot(transactionId: string, snapshot: Transaction, note?: string): Promise<void> {
    try {
      const entry: TransactionHistoryEntry = {
        id: uuidv4(),
        transactionId,
        timestamp: new Date().toISOString(),
        data: { ...snapshot },
        note,
      };
      await db.transactionHistory.add(entry);
    } catch (error) {
      console.error('Error adding history snapshot:', error);
    }
  }

  async getTransactionHistory(transactionId: string): Promise<Array<{ id: string; timestamp: string; data: Transaction; note?: string }>> {
    await this.ensureInitialized();
    try {
      const entries = await db.transactionHistory
        .where('transactionId')
        .equals(transactionId)
        .toArray();
      
      // Sort by timestamp descending
      entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return entries.map(entry => ({
        id: entry.id,
        timestamp: entry.timestamp,
        data: entry.data,
        note: entry.note
      }));
    } catch (error) {
      console.error('Error getting transaction history:', error);
      return [];
    }
  }

  async restoreTransactionVersion(transactionId: string, versionId: string, note?: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    try {
      const current = await db.transactions.get(transactionId);
      if (!current) return null;
      
      const version = await db.transactionHistory.get(versionId);
      if (!version || version.transactionId !== transactionId) return null;

      // Snapshot current before restoring
      await this.addHistorySnapshot(transactionId, current, note ? `Before restore: ${note}` : 'Auto-snapshot before restore');

      // Restore
      const restored: Transaction = {
        ...version.data,
        id: transactionId, // ensure id remains the same
        lastModifiedDate: new Date(),
      };
      
      await db.transactions.put(restored);
      return restored;
    } catch (error) {
      console.error('Error restoring transaction version:', error);
      return null;
    }
  }

  // Utility methods
  async getStats(): Promise<{
    total: number;
    totalIncome: number;
    totalExpenses: number;
    categories: { [category: string]: number };
  }> {
    await this.ensureInitialized();
    try {
      const transactions = await db.transactions.toArray();
      const stats = {
        total: transactions.length,
        totalIncome: 0,
        totalExpenses: 0,
        categories: {} as { [category: string]: number },
      };

      transactions.forEach(transaction => {
        if (transaction.type === 'income' || transaction.amount > 0) {
          stats.totalIncome += Math.abs(transaction.amount);
        } else {
          stats.totalExpenses += Math.abs(transaction.amount);
        }

        const category = transaction.category;
        stats.categories[category] = (stats.categories[category] || 0) + Math.abs(transaction.amount);
      });

      return stats;
    } catch (error) {
      console.error('Error getting stats:', error);
      return {
        total: 0,
        totalIncome: 0,
        totalExpenses: 0,
        categories: {},
      };
    }
  }

  async clearAllData(): Promise<void> {
    await this.ensureInitialized();
    try {
      await db.clearAllData();
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }

  // Duplicate detection
  async detectDuplicates(newTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<DuplicateDetectionResult> {
    await this.ensureInitialized();
    const duplicates: DuplicateTransaction[] = [];
    const uniqueTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

    for (const newTransaction of newTransactions) {
      const existingTransaction = await this.findDuplicate(newTransaction);
      
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

  private async findDuplicate(newTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<Transaction | null> {
    try {
      const newDate = new Date(newTransaction.date);
      const startOfDay = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate());
      const endOfDay = new Date(newDate.getFullYear(), newDate.getMonth(), newDate.getDate(), 23, 59, 59, 999);

      const potentialDuplicates = await db.transactions
        .where('date')
        .between(startOfDay, endOfDay, true, true)
        .and(t => 
          t.amount === newTransaction.amount &&
          t.description === newTransaction.description &&
          t.account === newTransaction.account
        )
        .first();

      return potentialDuplicates || null;
    } catch (error) {
      console.error('Error finding duplicate:', error);
      return null;
    }
  }
}

// Create singleton instance
export const dataService = new DataService();
export default dataService;
