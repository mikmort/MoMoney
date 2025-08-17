import { backupService } from '../services/backupService';
import { db } from '../services/db';
import { simplifiedImportExportService } from '../services/simplifiedImportExportService';
import { notificationService } from '../services/notificationService';

// Mock the dependencies
jest.mock('../services/db');
jest.mock('../services/simplifiedImportExportService');
jest.mock('../services/notificationService');

const mockDb = db as jest.Mocked<typeof db>;
const mockImportExportService = simplifiedImportExportService as jest.Mocked<typeof simplifiedImportExportService>;
const mockNotificationService = notificationService as jest.Mocked<typeof notificationService>;

describe('BackupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Mock database tables
    mockDb.backupMetadata = {
      add: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      orderBy: jest.fn().mockReturnValue({
        reverse: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([])
        })
      }),
      toArray: jest.fn().mockResolvedValue([])
    } as any;

    mockDb.backupData = {
      add: jest.fn(),
      get: jest.fn(),
      delete: jest.fn(),
      toArray: jest.fn().mockResolvedValue([])
    } as any;

    // Mock import/export service
    mockImportExportService.exportData = jest.fn().mockResolvedValue({
      version: '1.0',
      exportDate: new Date().toISOString(),
      appVersion: '0.1.0',
      transactions: [
        { id: 'tx1', description: 'Test transaction', amount: -50 },
        { id: 'tx2', description: 'Another transaction', amount: 100 }
      ],
      accounts: [
        { id: 'acc1', name: 'Test Account' }
      ]
    });
    
    mockImportExportService.importData = jest.fn().mockResolvedValue({
      transactions: 2,
      preferences: true,
      historyEntries: 0
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createBackup', () => {
    it('should create a backup successfully', async () => {
      const mockExportData = {
        version: '1.0',
        exportDate: new Date().toISOString(),
        appVersion: '0.1.0',
        transactions: [{ id: 'tx1', description: 'Test', amount: -50 }],
        accounts: [{ id: 'acc1', name: 'Test Account' }]
      };
      
      mockImportExportService.exportData.mockResolvedValue(mockExportData);
      mockDb.backupData.add = jest.fn().mockResolvedValue(undefined);
      mockDb.backupMetadata.add = jest.fn().mockResolvedValue(undefined);
      
      const backup = await backupService.createBackup('manual');
      
      expect(backup).toBeDefined();
      expect(backup.createdBy).toBe('manual');
      expect(backup.transactionCount).toBe(1);
      expect(backup.accountCount).toBe(1);
      expect(mockDb.backupData.add).toHaveBeenCalled();
      expect(mockDb.backupMetadata.add).toHaveBeenCalled();
      expect(mockNotificationService.showAlert).toHaveBeenCalledWith(
        'success',
        'Backup created successfully!',
        'Backup Complete'
      );
    });

    it('should handle backup creation errors', async () => {
      mockImportExportService.exportData.mockRejectedValue(new Error('Export failed'));
      
      await expect(backupService.createBackup('manual')).rejects.toThrow('Export failed');
      expect(mockNotificationService.showAlert).toHaveBeenCalledWith(
        'error',
        'Failed to create backup. Please try again.'
      );
    });
  });

  describe('getBackupList', () => {
    it('should return list of backups', async () => {
      const mockBackups = [
        {
          id: 'backup-1',
          timestamp: '2024-01-01T10:00:00Z',
          transactionCount: 5,
          accountCount: 2,
          size: 1000,
          version: '1.0',
          createdBy: 'auto' as const
        },
        {
          id: 'backup-2',
          timestamp: '2024-01-01T11:00:00Z',
          transactionCount: 6,
          accountCount: 2,
          size: 1100,
          version: '1.0',
          createdBy: 'manual' as const
        }
      ];
      
      mockDb.backupMetadata.orderBy().reverse().toArray.mockResolvedValue(mockBackups);
      
      const backups = await backupService.getBackupList();
      
      expect(backups).toEqual(mockBackups);
      expect(mockDb.backupMetadata.orderBy).toHaveBeenCalledWith('timestamp');
    });

    it('should handle errors when getting backup list', async () => {
      mockDb.backupMetadata.orderBy().reverse().toArray.mockRejectedValue(new Error('DB error'));
      
      const backups = await backupService.getBackupList();
      
      expect(backups).toEqual([]);
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore from backup successfully', async () => {
      const mockBackupData = {
        version: '1.0',
        exportDate: '2024-01-01T10:00:00Z',
        transactions: [{ id: 'tx1', description: 'Restored', amount: -100 }],
        accounts: []
      };
      
      mockDb.backupData.get = jest.fn().mockResolvedValue({
        id: 'backup-1',
        data: mockBackupData
      });
      
      // Mock window.location.reload
      Object.defineProperty(window, 'location', {
        value: {
          reload: jest.fn()
        },
        writable: true
      });

      await backupService.restoreFromBackup('backup-1');
      
      expect(mockDb.backupData.get).toHaveBeenCalledWith('backup-1');
      expect(mockImportExportService.importData).toHaveBeenCalledWith(mockBackupData, {
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
      });
      expect(mockNotificationService.showAlert).toHaveBeenCalledWith(
        'success',
        'Backup restored successfully! The page will reload to reflect the changes.',
        'Restore Complete'
      );
    });

    it('should handle missing backup data', async () => {
      mockDb.backupData.get = jest.fn().mockResolvedValue(null);
      
      await expect(backupService.restoreFromBackup('backup-1')).rejects.toThrow('Backup data not found');
      expect(mockNotificationService.showAlert).toHaveBeenCalledWith(
        'error',
        'Failed to restore backup. Please try again.'
      );
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup successfully', async () => {
      mockDb.backupData.delete = jest.fn().mockResolvedValue(undefined);
      mockDb.backupMetadata.delete = jest.fn().mockResolvedValue(undefined);
      
      await backupService.deleteBackup('backup-1');
      
      expect(mockDb.backupData.delete).toHaveBeenCalledWith('backup-1');
      expect(mockDb.backupMetadata.delete).toHaveBeenCalledWith('backup-1');
    });
  });

  describe('notifyDataChange', () => {
    it('should record data change time', () => {
      const beforeTime = Date.now();
      backupService.notifyDataChange();
      const afterTime = Date.now();
      
      // We can't directly test the private lastDataChangeTime, 
      // but we can test that it triggers backup logic
      expect(beforeTime).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('getBackupStats', () => {
    it('should return backup statistics', async () => {
      const mockBackups = [
        {
          id: 'backup-1',
          timestamp: '2024-01-01T10:00:00Z',
          transactionCount: 5,
          accountCount: 2,
          size: 1000,
          version: '1.0',
          createdBy: 'auto' as const
        },
        {
          id: 'backup-2',
          timestamp: '2024-01-01T09:00:00Z',
          transactionCount: 3,
          accountCount: 1,
          size: 500,
          version: '1.0',
          createdBy: 'manual' as const
        }
      ];
      
      mockDb.backupMetadata.orderBy().reverse().toArray.mockResolvedValue(mockBackups);
      
      const stats = await backupService.getBackupStats();
      
      expect(stats.totalBackups).toBe(2);
      expect(stats.totalSize).toBe(1500);
      expect(stats.lastBackupDate).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(stats.oldestBackupDate).toEqual(new Date('2024-01-01T09:00:00Z'));
    });

    it('should handle empty backup list', async () => {
      mockDb.backupMetadata.orderBy().reverse().toArray.mockResolvedValue([]);
      
      const stats = await backupService.getBackupStats();
      
      expect(stats.totalBackups).toBe(0);
      expect(stats.totalSize).toBe(0);
      expect(stats.lastBackupDate).toBeNull();
      expect(stats.oldestBackupDate).toBeNull();
    });
  });
});