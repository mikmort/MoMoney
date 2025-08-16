import { backupIntegrityService, BackupIntegrityReport } from '../services/backupIntegrityService';
import { Transaction, Account } from '../types';
import { ExportData } from '../services/simplifiedImportExportService';

// Mock dependencies
jest.mock('../services/dataService', () => ({
  dataService: {
    detectDuplicates: jest.fn()
  }
}));

describe('BackupIntegrityService', () => {
  const createMockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
    id: 'test-id',
    date: new Date('2024-01-01'),
    amount: -50.00,
    description: 'Test Transaction',
    category: 'Food',
    account: 'Test Account',
    type: 'expense' as const,
    addedDate: new Date(),
    lastModifiedDate: new Date(),
    ...overrides
  });

  const createMockAccount = (overrides: Partial<Account> = {}): Account => ({
    id: 'test-account-id',
    name: 'Test Account',
    type: 'checking',
    institution: 'Test Bank',
    currency: 'USD',
    isActive: true,
    ...overrides
  });

  const createMockBackupData = (
    transactions: Transaction[] = [],
    accounts: Account[] = []
  ): ExportData => ({
    version: '1.0',
    exportDate: '2024-01-01T00:00:00.000Z',
    appVersion: '0.1.0',
    transactions,
    preferences: null,
    transactionHistory: [],
    accounts,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Healthy Backup Analysis', () => {
    it('should report healthy backup with no issues', async () => {
      const transactions = [
        createMockTransaction({ id: 'tx1', account: 'Checking' }),
        createMockTransaction({ id: 'tx2', account: 'Savings', amount: -25.00 })
      ];
      
      const accounts = [
        createMockAccount({ name: 'Checking' }),
        createMockAccount({ name: 'Savings' })
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.totalTransactions).toBe(2);
      expect(report.totalAccounts).toBe(2);
      expect(report.summary.isHealthy).toBe(true);
      expect(report.summary.criticalIssues).toBe(0);
      expect(report.issues).toHaveLength(0);
    });
  });

  describe('Orphaned Account Detection', () => {
    it('should detect transactions with non-existent account references', async () => {
      const transactions = [
        createMockTransaction({ id: 'tx1', account: 'Valid Account' }),
        createMockTransaction({ id: 'tx2', account: 'Non-existent Account' })
      ];
      
      const accounts = [
        createMockAccount({ name: 'Valid Account' })
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.summary.isHealthy).toBe(false);
      expect(report.summary.criticalIssues).toBe(1);
      
      const orphanedIssue = report.issues.find(issue => issue.category === 'orphaned_account');
      expect(orphanedIssue).toBeDefined();
      expect(orphanedIssue!.message).toContain('1 transactions reference non-existent accounts');
      expect(orphanedIssue!.count).toBe(1);
    });

    it('should handle account references by both name and ID', async () => {
      const accounts = [
        createMockAccount({ id: 'account-123', name: 'Test Account' })
      ];
      
      const transactions = [
        createMockTransaction({ id: 'tx1', account: 'Test Account' }), // By name
        createMockTransaction({ id: 'tx2', account: 'account-123' }), // By ID
        createMockTransaction({ id: 'tx3', account: 'Invalid Account' }) // Invalid
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.summary.criticalIssues).toBe(1);
      const orphanedIssue = report.issues.find(issue => issue.category === 'orphaned_account');
      expect(orphanedIssue!.count).toBe(1); // Only one invalid reference
    });
  });

  describe('Missing Fields Detection', () => {
    it('should detect transactions with missing required fields', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const transactions = [
        createMockTransaction({ id: '', account: 'Test Account' }), // Missing ID
        createMockTransaction({ description: '', account: 'Test Account' }), // Missing description
        { ...createMockTransaction({ account: 'Test Account' }), amount: undefined } as any // Missing amount
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      // Count critical issues (missing fields + invalid amounts)
      expect(report.summary.criticalIssues).toBeGreaterThanOrEqual(3);
      
      const missingFields = report.issues.filter(issue => issue.category === 'missing_field');
      expect(missingFields.length).toBeGreaterThanOrEqual(3);
      expect(missingFields.map(issue => issue.message)).toEqual(
        expect.arrayContaining([
          expect.stringContaining('missing required field: id'),
          expect.stringContaining('missing required field: description'),
          expect.stringContaining('missing required field: amount')
        ])
      );
    });
  });

  describe('Date Validation', () => {
    it('should detect invalid date formats', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const transactions = [
        createMockTransaction({ id: 'tx1', date: 'invalid-date' as any, account: 'Test Account' }),
        createMockTransaction({ id: 'tx2', date: new Date('1800-01-01'), account: 'Test Account' }), // Too old
        createMockTransaction({ id: 'tx3', date: new Date('2030-01-01'), account: 'Test Account' }) // Too far in future
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.summary.criticalIssues).toBe(1);
      
      const dateIssue = report.issues.find(issue => issue.category === 'invalid_date');
      expect(dateIssue).toBeDefined();
      expect(dateIssue!.count).toBe(3);
      expect(dateIssue!.details).toHaveLength(3);
    });
  });

  describe('Duplicate Transaction Detection', () => {
    it('should detect potential duplicate transactions', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const baseTransaction = createMockTransaction({ 
        account: 'Test Account',
        date: new Date('2024-01-01'),
        amount: -50.00,
        description: 'Starbucks Coffee Shop'
      });
      
      const transactions = [
        { ...baseTransaction, id: 'tx1' },
        { ...baseTransaction, id: 'tx2' }, // Exact duplicate (same first 20 chars)
        { ...baseTransaction, id: 'tx3', description: 'Different description' } // Different description
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.summary.warnings).toBe(1);
      expect(report.duplicateGroups).toHaveLength(1);
      expect(report.duplicateGroups[0].count).toBe(2); // Only first 2 match
      
      const duplicateIssue = report.issues.find(issue => issue.category === 'duplicate_transaction');
      expect(duplicateIssue).toBeDefined();
      expect(duplicateIssue!.type).toBe('warning');
    });
  });

  describe('Large Amount Detection', () => {
    it('should flag transactions with very large amounts', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const transactions = [
        createMockTransaction({ id: 'tx1', amount: -150000, account: 'Test Account' }), // $150k
        createMockTransaction({ id: 'tx2', amount: 1200000, account: 'Test Account' }), // $1.2M
        createMockTransaction({ id: 'tx3', amount: -50, account: 'Test Account' }) // Normal amount
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      expect(report.summary.warnings).toBe(1);
      expect(report.largeTransactions).toHaveLength(2);
      
      const largeAmountIssue = report.issues.find(issue => issue.category === 'large_amount');
      expect(largeAmountIssue).toBeDefined();
      expect(largeAmountIssue!.count).toBe(2);
    });
  });

  describe('Amount Validation', () => {
    it('should detect invalid amount values', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const transactions = [
        { ...createMockTransaction({ account: 'Test Account' }), amount: null } as any,
        { ...createMockTransaction({ account: 'Test Account' }), amount: undefined } as any,
        { ...createMockTransaction({ account: 'Test Account' }), amount: NaN },
        { ...createMockTransaction({ account: 'Test Account' }), amount: Infinity },
        { ...createMockTransaction({ account: 'Test Account' }), amount: 'invalid' } as any
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      // Should have both missing_field and invalid_amount issues
      expect(report.summary.criticalIssues).toBeGreaterThanOrEqual(1);
      
      const amountIssue = report.issues.find(issue => issue.category === 'invalid_amount');
      expect(amountIssue).toBeDefined();
      expect(amountIssue!.count).toBe(5);
    });
  });

  describe('Data Consistency Checks', () => {
    it('should check backup metadata consistency', async () => {
      const backupData: ExportData = {
        version: '',
        exportDate: '',
        appVersion: '0.1.0',
        transactions: [],
        preferences: null,
        transactionHistory: []
      };
      
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      const consistencyIssues = report.issues.filter(issue => issue.category === 'data_consistency');
      expect(consistencyIssues.length).toBeGreaterThan(0);
      expect(consistencyIssues.some(issue => issue.message.includes('version'))).toBe(true);
      expect(consistencyIssues.some(issue => issue.message.includes('export date'))).toBe(true);
    });

    it('should report transaction date span information', async () => {
      const accounts = [createMockAccount({ name: 'Test Account' })];
      
      const transactions = [
        createMockTransaction({ id: 'tx1', date: new Date('2000-01-01'), account: 'Test Account' }),
        createMockTransaction({ id: 'tx2', date: new Date('2024-01-01'), account: 'Test Account' })
      ];
      
      const backupData = createMockBackupData(transactions, accounts);
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      const spanIssue = report.issues.find(issue => 
        issue.category === 'data_consistency' && 
        issue.message.includes('Transaction date span')
      );
      expect(spanIssue).toBeDefined();
      expect(spanIssue!.type).toBe('info');
    });
  });

  describe('Real Backup Data Analysis', () => {
    it('should analyze the actual backup file from the issue', async () => {
      // This test would run against the real backup file
      const fs = require('fs');
      const path = require('path');
      
      const backupPath = '/home/runner/work/MoMoney/MoMoney/momoney-backup-2025-08-16.json';
      
      // Skip if file doesn't exist (for CI/CD environments)
      if (!fs.existsSync(backupPath)) {
        console.log('Skipping real backup analysis - file not found');
        return;
      }
      
      const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      const report = await backupIntegrityService.analyzeBackupFile(backupData);
      
      console.log('Real Backup Analysis Results:');
      console.log(`Total Transactions: ${report.totalTransactions}`);
      console.log(`Total Accounts: ${report.totalAccounts}`);
      console.log(`Critical Issues: ${report.summary.criticalIssues}`);
      console.log(`Warnings: ${report.summary.warnings}`);
      console.log(`Info: ${report.summary.info}`);
      console.log(`Duplicate Groups: ${report.duplicateGroups.length}`);
      console.log(`Large Transactions: ${report.largeTransactions.length}`);
      
      // Should match our earlier analysis
      expect(report.totalTransactions).toBe(2143);
      expect(report.totalAccounts).toBe(22);
      expect(report.summary.isHealthy).toBe(true); // No critical issues
      expect(report.duplicateGroups.length).toBe(30); // 30 duplicate groups
      expect(report.largeTransactions.length).toBe(7); // 7 large transactions
    });
  });
});