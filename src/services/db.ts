import Dexie, { Table } from 'dexie';
import { Transaction, UserPreferences } from '../types';

// History entry interface for transaction versioning
export interface TransactionHistoryEntry {
  id: string;
  transactionId: string;
  timestamp: string;
  data: Transaction;
  note?: string;
}

// User preferences storage interface
export interface StoredUserPreferences extends UserPreferences {
  id: string; // Always 'default' for single-user app
  lastModified: Date;
}

// Data integrity check results
export interface DBHealthCheck {
  isHealthy: boolean;
  issues: string[];
  stats: {
    totalTransactions: number;
    transactionsWithInvalidDates: number;
    transactionsWithMissingIds: number;
    quarantinedTransactions: number;
  };
  performedAt: Date;
}

// Schema version tracking
const CURRENT_APP_DATA_VERSION = '1.2.0';
const APP_VERSION_KEY = 'APP_DATA_VERSION';

// Dexie database class
export class MoMoneyDB extends Dexie {
  // Tables
  transactions!: Table<Transaction>;
  transactionHistory!: Table<TransactionHistoryEntry>;
  userPreferences!: Table<StoredUserPreferences>;

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

    // Add lifecycle handlers for robustness
    this.on('versionchange', () => {
      console.warn('[DB] Database version change detected, closing connection to avoid blocking upgrades');
      this.close();
    });
    
    this.on('blocked', () => {
      console.error('[DB] Database upgrade blocked - another tab may be open');
      // Surface this to the UI via a global event or toast
      window.dispatchEvent(new CustomEvent('db-blocked', {
        detail: { message: 'Database upgrade blocked. Please close other Mo Money tabs and refresh.' }
      }));
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

  // Robust bulk operations with fallback
  async robustBulkPut(table: Table, items: any[]): Promise<{ successful: number; failed: number; errors: string[] }> {
    const results = { successful: 0, failed: 0, errors: [] as string[] };
    
    try {
      // Try bulk operation first
      await table.bulkPut(items);
      results.successful = items.length;
      console.log(`[DB] Bulk operation successful: ${items.length} items`);
      return results;
    } catch (error: any) {
      console.warn(`[DB] Bulk operation failed, falling back to individual operations:`, error);
      
      // If bulk fails, try individual operations
      for (const item of items) {
        try {
          await table.put(item);
          results.successful++;
        } catch (itemError: any) {
          results.failed++;
          const errorMsg = `Failed to save item ${item.id || 'unknown'}: ${itemError.message}`;
          results.errors.push(errorMsg);
          console.error(`[DB] ${errorMsg}`, itemError);
          
          // Attempt data repair for common issues
          try {
            const repairedItem = this.repairTransactionData(item);
            if (repairedItem) {
              await table.put(repairedItem);
              results.successful++;
              results.failed--;
              results.errors.pop(); // Remove the error since we recovered
              console.log(`[DB] Data repair successful for item ${item.id}`);
            }
          } catch (repairError) {
            console.error(`[DB] Data repair failed for item ${item.id}:`, repairError);
          }
        }
      }
    }
    
    return results;
  }
  
  // Repair common data issues
  private repairTransactionData(item: any): any | null {
    try {
      const repaired = { ...item };
      
      // Fix date fields
      if (repaired.date && !(repaired.date instanceof Date)) {
        repaired.date = new Date(repaired.date);
        if (isNaN(repaired.date.getTime())) {
          console.warn(`[DB] Cannot repair invalid date for item ${item.id}`);
          return null;
        }
      }
      
      if (repaired.addedDate && !(repaired.addedDate instanceof Date)) {
        repaired.addedDate = new Date(repaired.addedDate);
      }
      
      if (repaired.lastModifiedDate && !(repaired.lastModifiedDate instanceof Date)) {
        repaired.lastModifiedDate = new Date(repaired.lastModifiedDate);
      }
      
      // Ensure required fields exist
      if (!repaired.id) {
        repaired.id = Math.random().toString(36).substring(2);
      }
      
      // Ensure amount is a number
      if (typeof repaired.amount === 'string') {
        repaired.amount = parseFloat(repaired.amount);
      }
      
      return repaired;
    } catch (error) {
      console.error('[DB] Data repair failed:', error);
      return null;
    }
  }

  // Comprehensive health check
  async performHealthCheck(): Promise<DBHealthCheck> {
    console.log('[DB] Starting database health check...');
    const startTime = Date.now();
    
    const issues: string[] = [];
    const stats = {
      totalTransactions: 0,
      transactionsWithInvalidDates: 0,
      transactionsWithMissingIds: 0,
      quarantinedTransactions: 0
    };
    
    try {
      // Get transaction count from DB
      const dbCount = await this.transactions.count();
      stats.totalTransactions = dbCount;
      
      // Load all transactions for validation
      const allTransactions = await this.transactions.toArray();
      
      // Check data integrity
      const quarantined: any[] = [];
      for (const transaction of allTransactions) {
        // Check for missing IDs
        if (!transaction.id) {
          stats.transactionsWithMissingIds++;
          issues.push(`Transaction missing ID: ${transaction.description || 'Unknown'}`);
          quarantined.push(transaction);
          continue;
        }
        
        // Check for invalid dates
        if (!transaction.date || !(transaction.date instanceof Date) || isNaN(transaction.date.getTime())) {
          stats.transactionsWithInvalidDates++;
          issues.push(`Transaction ${transaction.id} has invalid date: ${transaction.date}`);
          quarantined.push(transaction);
          continue;
        }
        
        // Check required fields
        if (!transaction.category || !transaction.description || transaction.amount === undefined) {
          issues.push(`Transaction ${transaction.id} missing required fields`);
          quarantined.push(transaction);
          continue;
        }
      }
      
      stats.quarantinedTransactions = quarantined.length;
      
      // Store quarantined data for potential repair
      if (quarantined.length > 0) {
        localStorage.setItem('mo-money-quarantined-data', JSON.stringify({
          timestamp: new Date().toISOString(),
          data: quarantined
        }));
      }
      
      const isHealthy = issues.length === 0;
      const checkDuration = Date.now() - startTime;
      
      console.log(`[DB] Health check completed in ${checkDuration}ms:`, {
        healthy: isHealthy,
        issues: issues.length,
        stats
      });
      
      return {
        isHealthy,
        issues,
        stats,
        performedAt: new Date()
      };
      
    } catch (error) {
      console.error('[DB] Health check failed:', error);
      return {
        isHealthy: false,
        issues: [`Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        stats,
        performedAt: new Date()
      };
    }
  }

  // Check and handle app version changes
  checkAppVersion(): { needsReset: boolean; currentVersion: string; storedVersion: string | null } {
    const storedVersion = localStorage.getItem(APP_VERSION_KEY);
    const needsReset = storedVersion !== null && storedVersion !== CURRENT_APP_DATA_VERSION;
    
    console.log(`[DB] App version check: stored=${storedVersion}, current=${CURRENT_APP_DATA_VERSION}, needsReset=${needsReset}`);
    
    return {
      needsReset,
      currentVersion: CURRENT_APP_DATA_VERSION,
      storedVersion
    };
  }

  // Update stored app version
  updateAppVersion(): void {
    localStorage.setItem(APP_VERSION_KEY, CURRENT_APP_DATA_VERSION);
    console.log(`[DB] App version updated to ${CURRENT_APP_DATA_VERSION}`);
  }

  // Create support bundle for diagnostics
  async createSupportBundle(): Promise<string> {
    console.log('[DB] Creating support bundle...');
    
    const healthCheck = await this.performHealthCheck();
    const appVersionCheck = this.checkAppVersion();
    
    // Get sample of recent transactions (anonymized)
    const recentTransactions = await this.transactions
      .orderBy('date')
      .reverse()
      .limit(10)
      .toArray();
    
    const anonymizedTransactions = recentTransactions.map(t => ({
      id: t.id,
      date: t.date?.toISOString() || 'invalid',
      category: t.category,
      subcategory: t.subcategory,
      amount: '***', // Anonymize amounts
      account: t.account ? '***' : null,
      type: t.type,
      confidence: t.confidence,
      isVerified: t.isVerified,
      addedDate: t.addedDate?.toISOString(),
      lastModifiedDate: t.lastModifiedDate?.toISOString()
    }));
    
    const supportBundle = {
      timestamp: new Date().toISOString(),
      version: CURRENT_APP_DATA_VERSION,
      userAgent: navigator.userAgent,
      url: window.location.href,
      localStorage: {
        keys: Object.keys(localStorage),
        appVersion: localStorage.getItem(APP_VERSION_KEY),
        hasQuarantinedData: localStorage.getItem('mo-money-quarantined-data') !== null
      },
      database: {
        name: this.name,
        isOpen: this.isOpen(),
        tables: ['transactions', 'transactionHistory', 'userPreferences']
      },
      healthCheck,
      appVersionCheck,
      sampleTransactions: anonymizedTransactions,
      environment: {
        indexedDBSupported: 'indexedDB' in window,
        localStorageSupported: 'localStorage' in window,
        serviceWorkerSupported: 'serviceWorker' in navigator
      }
    };
    
    return JSON.stringify(supportBundle, null, 2);
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
    console.log('[DB] Initializing database...');
    
    // Check app version before opening database
    const versionCheck = db.checkAppVersion();
    if (versionCheck.needsReset) {
      console.warn('[DB] App version changed, may need data migration or reset');
      // For now, just update the version - could add migration logic here
      db.updateAppVersion();
    }
    
    await db.open();
    console.log('[DB] Database opened successfully');
    
    // Check if we need to migrate from localStorage
    const transactionCount = await db.transactions.count();
    
    if (transactionCount === 0) {
      // No data in IndexedDB, check for localStorage data to migrate
      const migrationResult = await db.migrateFromLocalStorage();
      if (migrationResult.transactions > 0 || migrationResult.history > 0) {
        console.log('[DB] Database migration completed:', migrationResult);
      }
    }
    
    // Update app version if not already set
    if (!versionCheck.storedVersion) {
      db.updateAppVersion();
    }
    
  } catch (error) {
    console.error('[DB] Failed to initialize database:', error);
    throw error;
  }
};

// Perform post-initialization health check
export const performPostInitHealthCheck = async (): Promise<{ needsReset: boolean; healthCheck: DBHealthCheck }> => {
  console.log('[DB] Performing post-initialization health check...');
  
  try {
    const healthCheck = await db.performHealthCheck();
    const needsReset = !healthCheck.isHealthy && healthCheck.issues.length > 3; // Arbitrary threshold
    
    if (needsReset) {
      console.error('[DB] Database appears corrupted, may need reset:', healthCheck);
    } else if (!healthCheck.isHealthy) {
      console.warn('[DB] Database has some issues but appears recoverable:', healthCheck);
    } else {
      console.log('[DB] Database health check passed ✅');
    }
    
    // Log health statistics
    console.log(`[DB] Health Stats: ${healthCheck.stats.totalTransactions} transactions, ${healthCheck.issues.length} issues`);
    
    return { needsReset, healthCheck };
  } catch (error) {
    console.error('[DB] Health check failed:', error);
    return {
      needsReset: true,
      healthCheck: {
        isHealthy: false,
        issues: ['Health check failed to run'],
        stats: { totalTransactions: 0, transactionsWithInvalidDates: 0, transactionsWithMissingIds: 0, quarantinedTransactions: 0 },
        performedAt: new Date()
      }
    };
  }
};