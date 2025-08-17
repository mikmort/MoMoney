import type { ExportData } from '../services/simplifiedImportExportService';

// Backup metadata interface
export interface BackupMetadata {
  id: string;
  timestamp: string;
  transactionCount: number;
  accountCount: number;
  size: number; // Size in bytes of the backup data
  version: string;
  createdBy: 'auto' | 'manual';
}

// Backup data storage interface
export interface BackupData {
  id: string; // Same as metadata ID
  data: ExportData; // The complete backup data
}