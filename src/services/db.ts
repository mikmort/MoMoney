import Dexie, { Table } from 'dexie';
import { Transaction } from '../types';

// Interface for transaction history entries
export interface TransactionHistoryEntry {
  id: string;
  transactionId: string;
  timestamp: string;
  data: Transaction;
  note?: string;
}

// Interface for metadata storage
export interface MetadataEntry {
  key: string;
  value: any;
  updatedAt: Date;
}

// Dexie database class
export class MoMoneyDatabase extends Dexie {
  // Tables
  transactions!: Table<Transaction, string>;
  transactionHistory!: Table<TransactionHistoryEntry, string>;
  metadata!: Table<MetadataEntry, string>;

  constructor() {
    super('MoMoneyDB');

    // Define database schema
    this.version(1).stores({
      transactions: 'id, date, amount, description, category, subcategory, account, type, addedDate, lastModifiedDate, isVerified, vendor',
      transactionHistory: 'id, transactionId, timestamp',
      metadata: 'key, updatedAt'
    });

    // Hook to ensure Date objects are properly handled
    this.transactions.hook('creating', function (primKey, obj, trans) {
      // Ensure dates are Date objects
      if (obj.date && typeof obj.date === 'string') {
        obj.date = new Date(obj.date);
      }
      if (obj.addedDate && typeof obj.addedDate === 'string') {
        obj.addedDate = new Date(obj.addedDate);
      }
      if (obj.lastModifiedDate && typeof obj.lastModifiedDate === 'string') {
        obj.lastModifiedDate = new Date(obj.lastModifiedDate);
      }
    });

    this.transactions.hook('updating', function (modifications, primKey, obj, trans) {
      // Ensure dates are Date objects when updating
      const mods = modifications as any;
      if (mods.date && typeof mods.date === 'string') {
        mods.date = new Date(mods.date);
      }
      if (mods.addedDate && typeof mods.addedDate === 'string') {
        mods.addedDate = new Date(mods.addedDate);
      }
      if (mods.lastModifiedDate && typeof mods.lastModifiedDate === 'string') {
        mods.lastModifiedDate = new Date(mods.lastModifiedDate);
      }
    });

    this.transactionHistory.hook('creating', function (primKey, obj, trans) {
      // Ensure dates in history data are Date objects
      if (obj.data.date && typeof obj.data.date === 'string') {
        obj.data.date = new Date(obj.data.date);
      }
      if (obj.data.addedDate && typeof obj.data.addedDate === 'string') {
        obj.data.addedDate = new Date(obj.data.addedDate);
      }
      if (obj.data.lastModifiedDate && typeof obj.data.lastModifiedDate === 'string') {
        obj.data.lastModifiedDate = new Date(obj.data.lastModifiedDate);
      }
    });

    this.metadata.hook('creating', function (primKey, obj, trans) {
      if (!obj.updatedAt) {
        obj.updatedAt = new Date();
      }
    });

    this.metadata.hook('updating', function (modifications, primKey, obj, trans) {
      const mods = modifications as any;
      mods.updatedAt = new Date();
    });
  }

  // Method to check if database has been initialized
  async isInitialized(): Promise<boolean> {
    try {
      const metadata = await this.metadata.get('initialized');
      return metadata?.value === true;
    } catch (error) {
      console.error('Error checking initialization status:', error);
      return false;
    }
  }

  // Method to mark database as initialized
  async markInitialized(): Promise<void> {
    try {
      await this.metadata.put({
        key: 'initialized',
        value: true,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error marking database as initialized:', error);
    }
  }

  // Method to get database version/migration info
  async getDatabaseVersion(): Promise<string> {
    try {
      const metadata = await this.metadata.get('version');
      return metadata?.value || '1.0.0';
    } catch (error) {
      console.error('Error getting database version:', error);
      return '1.0.0';
    }
  }

  // Method to set database version
  async setDatabaseVersion(version: string): Promise<void> {
    try {
      await this.metadata.put({
        key: 'version',
        value: version,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error setting database version:', error);
    }
  }

  // Method to clear all data (for development/testing)
  async clearAllData(): Promise<void> {
    try {
      await this.transaction('rw', this.transactions, this.transactionHistory, this.metadata, async () => {
        await this.transactions.clear();
        await this.transactionHistory.clear();
        await this.metadata.clear();
      });
    } catch (error) {
      console.error('Error clearing all data:', error);
      throw error;
    }
  }
}

// Create and export singleton database instance
export const db = new MoMoneyDatabase();

// Export default for convenience
export default db;