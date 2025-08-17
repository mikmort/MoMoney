import { ExportData, simplifiedImportExportService } from './simplifiedImportExportService';
import { db } from './db';
import { notificationService } from './notificationService';
import type { BackupMetadata } from '../types/backup';

// Internal logger helpers: silence in test to avoid Jest noise
const __IS_TEST__ = process.env.NODE_ENV === 'test';
const backupLog = (...args: any[]) => { if (!__IS_TEST__) console.log('[BACKUP]', ...args); };
const backupWarn = (...args: any[]) => { if (!__IS_TEST__) console.warn('[BACKUP]', ...args); };
const backupError = (...args: any[]) => { if (!__IS_TEST__) console.error('[BACKUP]', ...args); };

class BackupService {
  private lastBackupTime: Date | null = null;
  private readonly BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private readonly MAX_BACKUPS = 3;
  private lastDataChangeTime: Date | null = null;
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Load last backup time from storage
      await this.loadLastBackupTime();
      this.isInitialized = true;
      backupLog('BackupService initialized');
    } catch (error) {
      backupError('Failed to initialize BackupService:', error);
    }
  }

  private async loadLastBackupTime(): Promise<void> {
    try {
      // Directly query database without going through getBackupList to avoid circular initialization
      const backups = await db.backupMetadata.orderBy('timestamp').reverse().toArray();
      if (backups.length > 0) {
        // Find the most recent backup
        const latestBackup = backups.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )[0];
        this.lastBackupTime = new Date(latestBackup.timestamp);
      }
    } catch (error) {
      backupWarn('Could not load last backup time:', error);
    }
  }

  /**
   * Notify the backup service that data has been changed
   * This should be called by dataService when transactions are modified
   */
  public notifyDataChange(): void {
    this.lastDataChangeTime = new Date();
    backupLog('Data change detected at', this.lastDataChangeTime.toISOString());
    
    // Check if we need to create a backup
    this.checkAndCreateBackup();
  }

  private async checkAndCreateBackup(): Promise<void> {
    try {
      await this.ensureInitialized();

      // Don't create backups if no data changes occurred
      if (!this.lastDataChangeTime) {
        return;
      }

      // Check if enough time has passed since last backup
      if (this.lastBackupTime) {
        const timeSinceLastBackup = Date.now() - this.lastBackupTime.getTime();
        if (timeSinceLastBackup < this.BACKUP_INTERVAL_MS) {
          backupLog(`Backup skipped - only ${Math.round(timeSinceLastBackup / 60000)} minutes since last backup`);
          return;
        }
      }

      backupLog('Creating automatic backup...');
      await this.createBackup('auto');
    } catch (error) {
      backupError('Failed to check/create backup:', error);
    }
  }

  /**
   * Create a new backup
   */
  public async createBackup(createdBy: 'auto' | 'manual' = 'auto'): Promise<BackupMetadata> {
    await this.ensureInitialized();

    try {
      backupLog(`Creating ${createdBy} backup...`);

      // Export current data
      const exportData = await simplifiedImportExportService.exportData();
      
      // Create backup metadata
      const backup: BackupMetadata = {
        id: `backup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString(),
        transactionCount: exportData.transactions?.length || 0,
        accountCount: exportData.accounts?.length || 0,
        size: JSON.stringify(exportData).length,
        version: exportData.version || '1.0',
        createdBy
      };

      // Store backup data and metadata
      await db.backupData.add({
        id: backup.id,
        data: exportData
      });

      await db.backupMetadata.add(backup);

      // Update last backup time
      this.lastBackupTime = new Date(backup.timestamp);

      // Cleanup old backups
      await this.cleanupOldBackups();

      backupLog(`${createdBy} backup created:`, backup.id, `(${backup.transactionCount} transactions, ${backup.accountCount} accounts)`);
      
      if (createdBy === 'manual') {
        notificationService.showAlert('success', 'Backup created successfully!', 'Backup Complete');
      }

      return backup;
    } catch (error) {
      backupError('Failed to create backup:', error);
      if (createdBy === 'manual') {
        notificationService.showAlert('error', 'Failed to create backup. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Remove old backups to maintain max limit
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.getBackupList();
      
      if (backups.length > this.MAX_BACKUPS) {
        // Sort by timestamp, oldest first
        const sortedBackups = backups.sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Remove oldest backups
        const toRemove = sortedBackups.slice(0, backups.length - this.MAX_BACKUPS);
        
        for (const backup of toRemove) {
          await this.deleteBackup(backup.id);
          backupLog('Cleaned up old backup:', backup.id);
        }
      }
    } catch (error) {
      backupError('Failed to cleanup old backups:', error);
    }
  }

  /**
   * Get list of all backups
   */
  public async getBackupList(): Promise<BackupMetadata[]> {
    await this.ensureInitialized();
    
    try {
      const backups = await db.backupMetadata.orderBy('timestamp').reverse().toArray();
      return backups;
    } catch (error) {
      backupError('Failed to get backup list:', error);
      return [];
    }
  }

  /**
   * Get backup data by ID
   */
  public async getBackupData(backupId: string): Promise<ExportData | null> {
    await this.ensureInitialized();
    
    try {
      const backupData = await db.backupData.get(backupId);
      return backupData?.data || null;
    } catch (error) {
      backupError('Failed to get backup data:', error);
      return null;
    }
  }

  /**
   * Restore from a backup
   */
  public async restoreFromBackup(backupId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      backupLog('Restoring from backup:', backupId);
      
      const backupData = await this.getBackupData(backupId);
      if (!backupData) {
        throw new Error('Backup data not found');
      }

      // Import the backup data with all options enabled
      const importOptions = {
        transactions: true,
        accounts: true,
        categories: true,
        budgets: true,
        rules: true,
        preferences: true,
        transactionHistory: true,
        balanceHistory: true,
        currencyRates: true,
        transferMatches: true
      };

      const result = await simplifiedImportExportService.importData(backupData, importOptions);
      
      backupLog('Backup restore completed:', result);
      notificationService.showAlert('success', 'Backup restored successfully! The page will reload to reflect the changes.', 'Restore Complete');
      
      // Reload page after showing message
      setTimeout(() => window.location.reload(), 3000);
    } catch (error) {
      backupError('Failed to restore backup:', error);
      notificationService.showAlert('error', 'Failed to restore backup. Please try again.');
      throw error;
    }
  }

  /**
   * Delete a backup
   */
  public async deleteBackup(backupId: string): Promise<void> {
    await this.ensureInitialized();
    
    try {
      await db.backupData.delete(backupId);
      await db.backupMetadata.delete(backupId);
      backupLog('Backup deleted:', backupId);
    } catch (error) {
      backupError('Failed to delete backup:', error);
      throw error;
    }
  }

  /**
   * Get backup statistics
   */
  public async getBackupStats(): Promise<{
    totalBackups: number;
    totalSize: number;
    lastBackupDate: Date | null;
    oldestBackupDate: Date | null;
  }> {
    await this.ensureInitialized();
    
    try {
      const backups = await this.getBackupList();
      const totalSize = backups.reduce((sum, backup) => sum + backup.size, 0);
      
      return {
        totalBackups: backups.length,
        totalSize,
        lastBackupDate: backups.length > 0 ? new Date(backups[0].timestamp) : null,
        oldestBackupDate: backups.length > 0 ? new Date(backups[backups.length - 1].timestamp) : null
      };
    } catch (error) {
      backupError('Failed to get backup stats:', error);
      return {
        totalBackups: 0,
        totalSize: 0,
        lastBackupDate: null,
        oldestBackupDate: null
      };
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }
}

// Create and export singleton instance
export const backupService = new BackupService();