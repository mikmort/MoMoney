import { Transaction, UserPreferences, Account, Category, CategoryRule } from '../types';
import { db } from './db';
import { accountManagementService } from './accountManagementService';
import { rulesService } from './rulesService';
import { defaultCategories } from '../data/defaultCategories';

export interface ExportData {
  version: string;
  exportDate: string;
  appVersion: string;
  transactions: Transaction[];
  preferences: UserPreferences | null;
  transactionHistory: any[];
  accounts?: Account[];
  rules?: CategoryRule[];
  categories?: Category[];
}

class SimplifiedImportExportService {
  
  /**
   * Export all app data to JSON format (SQLite structure compatible)
   */
  async exportData(): Promise<ExportData> {
    // Get all data from IndexedDB
    const transactions = await db.transactions.toArray();
    const preferences = await db.getUserPreferences();
    const historyEntries = await db.transactionHistory.toArray();
    const accounts = accountManagementService.getAccounts();
    const rules = await rulesService.getAllRules();
    // Categories are stored in localStorage
    const categoriesKey = 'mo-money-categories';
    let categories: Category[] | undefined = undefined;
    try {
      const stored = localStorage.getItem(categoriesKey);
      if (stored) {
        categories = JSON.parse(stored);
      } else {
        categories = defaultCategories;
      }
    } catch (err) {
      console.warn('Failed to read categories from storage; exporting defaults. Error:', err);
      categories = defaultCategories;
    }

    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      appVersion: '0.1.0',
      transactions,
      preferences,
      transactionHistory: historyEntries,
      accounts,
      rules,
      categories
    };
  }

  /**
   * Import data from JSON file
   */
  async importData(data: ExportData): Promise<{
    transactions: number;
    preferences: boolean;
    historyEntries: number;
  accounts?: number;
  rules?: number;
  categories?: number;
  }> {
    // Validate data structure
    if (!data.version || !data.transactions) {
      throw new Error('Invalid backup file format');
    }

    // Pre-validate all data to ensure we have at least some valid content before clearing existing data
    const processedTransactions: any[] = [];
    let skippedCount = 0;
    let hasValidTransactions = false;
    
    if (data.transactions.length > 0) {
      for (const t of data.transactions) {
        try {
          // Validate required fields - for completely corrupted data, fail fast
          if (!t.id || !t.description) {
            // If ALL transactions are missing core fields, this is corrupted data - fail completely
            if (data.transactions.every(tx => !tx.id || !tx.description)) {
              throw new Error('All transactions missing required fields (id, description)');
            }
            console.warn(`Skipping transaction with missing required fields:`, t);
            skippedCount++;
            continue;
          }
          if (!t.date) {
            if (data.transactions.every(tx => !tx.date)) {
              throw new Error('All transactions missing required date field');
            }
            console.warn(`Skipping transaction with missing date field:`, t);
            skippedCount++;
            continue;
          }
          if (t.amount === undefined || t.amount === null) {
            if (data.transactions.every(tx => tx.amount === undefined || tx.amount === null)) {
              throw new Error('All transactions missing required amount field');
            }
            console.warn(`Skipping transaction with missing amount field:`, t);
            skippedCount++;
            continue;
          }

          // Ensure proper data types and set defaults
          const processedTransaction = {
            ...t,
            date: new Date(t.date),
            amount: typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount),
            addedDate: t.addedDate ? new Date(t.addedDate) : new Date(),
            lastModifiedDate: t.lastModifiedDate ? new Date(t.lastModifiedDate) : new Date(),
          };

          // Validate amount is a valid number - skip invalid ones
          if (!isFinite(processedTransaction.amount) || isNaN(processedTransaction.amount)) {
            console.warn(`Skipping transaction with invalid amount: ${t.amount}`, t);
            skippedCount++;
            continue;
          }

          processedTransactions.push(processedTransaction);
          hasValidTransactions = true;
        } catch (error) {
          console.warn(`Skipping invalid transaction:`, t, error);
          skippedCount++;
          continue;
        }
      }
    }

    // If no valid transactions found, treat as corrupted data
    if (!hasValidTransactions && data.transactions.length > 0) {
      throw new Error('No valid transactions found in import data');
    }

    if (skippedCount > 0) {
      console.warn(`Skipped ${skippedCount} invalid transactions during import`);
    }

    // Only clear and import after validation passes
    await db.clearAll();
    await rulesService.clearAllRules();
    
    // Import valid transactions
    if (processedTransactions.length > 0) {
      await db.transactions.bulkAdd(processedTransactions);
    }
    
  // Import preferences
    if (data.preferences) {
      await db.saveUserPreferences(data.preferences);
    }
    
    // Import history
    if (data.transactionHistory && data.transactionHistory.length > 0) {
      const processedHistory = data.transactionHistory.map((entry: any) => ({
        ...entry,
        data: {
          ...entry.data,
          date: new Date(entry.data.date),
          addedDate: entry.data.addedDate ? new Date(entry.data.addedDate) : undefined,
          lastModifiedDate: entry.data.lastModifiedDate ? new Date(entry.data.lastModifiedDate) : undefined,
        }
      }));
      
      await db.transactionHistory.bulkAdd(processedHistory);
    }

    // Import accounts (optional)
    let accountsImported = 0;
    if (data.accounts && Array.isArray(data.accounts)) {
      accountManagementService.replaceAccounts(data.accounts);
      accountsImported = data.accounts.length;
    }

    // Import rules (optional)
    let rulesImported = 0;
    if (data.rules && Array.isArray(data.rules)) {
      await rulesService.importRules(data.rules);
      rulesImported = data.rules.length;
    }

    // Import categories (optional)
    let categoriesImported = 0;
    if (data.categories && Array.isArray(data.categories)) {
      try {
        localStorage.setItem('mo-money-categories', JSON.stringify(data.categories));
        categoriesImported = data.categories.length;
      } catch (err) {
        console.error('Failed to import categories to storage:', err);
      }
    }
    
    return {
      transactions: data.transactions.length,
      preferences: !!data.preferences,
      historyEntries: data.transactionHistory?.length || 0,
      accounts: accountsImported || undefined,
      rules: rulesImported || undefined,
      categories: categoriesImported || undefined
    };
  }

  /**
   * Download JSON file
   */
  downloadFile(data: ExportData, filename: string = 'momoney-backup.json') {
    const jsonString = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
  }

  /**
   * Read file as text
   */
  readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}

export const simplifiedImportExportService = new SimplifiedImportExportService();