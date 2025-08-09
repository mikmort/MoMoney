import { Transaction, UserPreferences } from '../types';
import { db } from './db';

export interface ExportData {
  version: string;
  exportDate: string;
  appVersion: string;
  transactions: Transaction[];
  preferences: UserPreferences | null;
  transactionHistory: any[];
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

    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      appVersion: '0.1.0',
      transactions: transactions,
      preferences: preferences,
      transactionHistory: historyEntries
    };
  }

  /**
   * Import data from JSON file
   */
  async importData(data: ExportData): Promise<{
    transactions: number;
    preferences: boolean;
    historyEntries: number;
  }> {
    // Validate data structure
    if (!data.version || !data.transactions) {
      throw new Error('Invalid backup file format');
    }

    // Clear existing data
    await db.clearAll();
    
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
    
    return {
      transactions: data.transactions.length,
      preferences: !!data.preferences,
      historyEntries: data.transactionHistory?.length || 0
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