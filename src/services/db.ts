import Dexie, { Table } from 'dexie';
import { Transaction, UserPreferences, AttachedFile } from '../types';

// History entry interface for transaction versioning
export interface TransactionHistoryEntry {
  id: string;
  transactionId: string;
  timestamp: string;
  data: Transaction;
  note?: string;
}

// File storage interface for receipts and documents
export interface StoredFile extends AttachedFile {
  data: ArrayBuffer; // The actual file binary data
}
export interface StoredUserPreferences extends UserPreferences {
  id: string; // Always 'default' for single-user app
  lastModified: Date;
}

// Dexie database class
export class MoMoneyDB extends Dexie {
  // Tables
  transactions!: Table<Transaction>;
  transactionHistory!: Table<TransactionHistoryEntry>;
  userPreferences!: Table<StoredUserPreferences>;
  attachedFiles!: Table<StoredFile>;

  constructor() {
    super('MoMoneyDB');

    // Schema definition
    this.version(1).stores({
      transactions: 'id, date, amount, category, subcategory, account, type, addedDate, lastModifiedDate, isVerified, vendor, isAnomaly',
      transactionHistory: 'id, transactionId, timestamp'
    });

    // Version 2: Add user preferences table
    this.version(2).stores({
      transactions: 'id, date, amount, category, subcategory, account, type, addedDate, lastModifiedDate, isVerified, vendor, isAnomaly',
      transactionHistory: 'id, transactionId, timestamp',
      userPreferences: 'id, lastModified'
    });

    // Version 3: Add attached files table for receipt uploads
    this.version(3).stores({
      transactions: 'id, date, amount, category, subcategory, account, type, addedDate, lastModifiedDate, isVerified, vendor, isAnomaly',
      transactionHistory: 'id, transactionId, timestamp',
      userPreferences: 'id, lastModified',
      attachedFiles: 'id, filename, fileType, uploadDate'
    });

    // Hooks for data handling
    this.transactions.hook('creating', (primKey, obj, trans) => {
      // Ensure dates are properly stored - they should already be Date objects
      // No need to reassign, just validate they exist
    });

    this.transactions.hook('updating', (modifications: any, primKey, obj, trans) => {
      // Update lastModifiedDate on updates
      modifications.lastModifiedDate = new Date();
    });
  }

  // Migration method to import data from localStorage
  async migrateFromLocalStorage(): Promise<{ transactions: number; history: number }> {
    console.log('Checking for localStorage data to migrate...');
    
    let transactionCount = 0;
    let historyCount = 0;

    try {
      // Migrate transactions
      const transactionsData = localStorage.getItem('mo-money-transactions');
      if (transactionsData) {
        const transactions = JSON.parse(transactionsData);
        if (Array.isArray(transactions) && transactions.length > 0) {
          console.log(`Migrating ${transactions.length} transactions from localStorage...`);
          
          // Convert date strings back to Date objects
          const processedTransactions = transactions.map((t: any) => ({
            ...t,
            date: new Date(t.date),
            addedDate: t.addedDate ? new Date(t.addedDate) : undefined,
            lastModifiedDate: t.lastModifiedDate ? new Date(t.lastModifiedDate) : undefined,
          }));

          await this.transactions.bulkAdd(processedTransactions);
          transactionCount = processedTransactions.length;
          console.log(`Successfully migrated ${transactionCount} transactions`);
        }
      }

      // Migrate transaction history
      const historyData = localStorage.getItem('mo-money-transaction-history');
      if (historyData) {
        const historyMap = JSON.parse(historyData);
        const historyEntries: TransactionHistoryEntry[] = [];

        Object.keys(historyMap).forEach((transactionId: string) => {
          const entries = historyMap[transactionId];
          if (Array.isArray(entries)) {
            entries.forEach((entry: any) => {
              historyEntries.push({
                id: entry.id,
                transactionId,
                timestamp: entry.timestamp,
                data: {
                  ...entry.data,
                  date: new Date(entry.data.date),
                  addedDate: entry.data.addedDate ? new Date(entry.data.addedDate) : undefined,
                  lastModifiedDate: entry.data.lastModifiedDate ? new Date(entry.data.lastModifiedDate) : undefined,
                },
                note: entry.note
              });
            });
          }
        });

        if (historyEntries.length > 0) {
          console.log(`Migrating ${historyEntries.length} history entries from localStorage...`);
          await this.transactionHistory.bulkAdd(historyEntries);
          historyCount = historyEntries.length;
          console.log(`Successfully migrated ${historyCount} history entries`);
        }
      }

      // Clear localStorage after successful migration
      if (transactionCount > 0 || historyCount > 0) {
        console.log('Migration completed successfully. Clearing localStorage...');
        localStorage.removeItem('mo-money-transactions');
        localStorage.removeItem('mo-money-transaction-history');
      }

    } catch (error) {
      console.error('Error during migration from localStorage:', error);
      throw error;
    }

    return { transactions: transactionCount, history: historyCount };
  }

  // Helper method to get transaction history for a specific transaction
  async getTransactionHistory(transactionId: string): Promise<TransactionHistoryEntry[]> {
    return await this.transactionHistory
      .where('transactionId')
      .equals(transactionId)
      .reverse()
      .sortBy('timestamp');
  }

  // Helper method to add a history entry
  async addHistoryEntry(entry: Omit<TransactionHistoryEntry, 'id'>): Promise<string> {
    const id = await this.transactionHistory.add({
      ...entry,
      id: Math.random().toString(36).substring(2), // Use fallback ID generation for compatibility
    });
    return id.toString();
  }

  // User preferences methods
  async getUserPreferences(): Promise<UserPreferences | null> {
    const stored = await this.userPreferences.get('default');
    if (!stored) return null;
    
    // Return just the preferences without the storage metadata
    const { id, lastModified, ...preferences } = stored;
    return preferences;
  }

  async saveUserPreferences(preferences: UserPreferences): Promise<void> {
    const stored: StoredUserPreferences = {
      id: 'default',
      ...preferences,
      lastModified: new Date()
    };
    await this.userPreferences.put(stored);
  }

  // Clear all data
  async clearAll(): Promise<void> {
    await this.transaction('rw', [this.transactions, this.transactionHistory, this.userPreferences], async () => {
      await this.transactions.clear();
      await this.transactionHistory.clear();
      await this.userPreferences.clear();
    });
  }
}

// Create and export singleton instance
export const db = new MoMoneyDB();

// Initialize database and perform migration on first load
export const initializeDB = async (): Promise<void> => {
  try {
    await db.open();
    
    // Check if we need to migrate from localStorage
    const transactionCount = await db.transactions.count();
    
    if (transactionCount === 0) {
      // No data in IndexedDB, check for localStorage data to migrate
      const migrationResult = await db.migrateFromLocalStorage();
      if (migrationResult.transactions > 0 || migrationResult.history > 0) {
        console.log('Database migration completed:', migrationResult);
      }
    }
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
};