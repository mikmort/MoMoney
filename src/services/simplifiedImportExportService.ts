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

  // Clear existing data
  await db.clearAll();
  await rulesService.clearAllRules();
    
    // Import transactions
    if (data.transactions.length > 0) {
      // Ensure dates are properly converted
      const processedTransactions = data.transactions.map((t: any) => ({
        ...t,
        date: new Date(t.date),
        addedDate: t.addedDate ? new Date(t.addedDate) : undefined,
        lastModifiedDate: t.lastModifiedDate ? new Date(t.lastModifiedDate) : undefined,
      }));
      
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