import { Transaction, Account, DuplicateTransaction, DuplicateDetectionConfig } from '../types';
import { ExportData } from './simplifiedImportExportService';
import { dataService } from './dataService';
import { accountManagementService } from './accountManagementService';

export interface BackupIntegrityIssue {
  type: 'critical' | 'warning' | 'info';
  category: 'orphaned_account' | 'missing_field' | 'invalid_date' | 'duplicate_transaction' | 'large_amount' | 'invalid_amount' | 'data_consistency';
  message: string;
  transactionId?: string;
  count?: number;
  details?: any;
}

export interface BackupIntegrityReport {
  totalTransactions: number;
  totalAccounts: number;
  issues: BackupIntegrityIssue[];
  duplicateGroups: Array<{
    signature: string;
    transactions: Transaction[];
    count: number;
  }>;
  largeTransactions: Array<{
    transaction: Transaction;
    reason: string;
  }>;
  summary: {
    criticalIssues: number;
    warnings: number;
    info: number;
    isHealthy: boolean;
  };
}

class BackupIntegrityService {
  
  /**
   * Analyze a backup file for data integrity issues
   */
  async analyzeBackupFile(backupData: ExportData): Promise<BackupIntegrityReport> {
    const issues: BackupIntegrityIssue[] = [];
    const duplicateGroups: Array<{ signature: string; transactions: Transaction[]; count: number; }> = [];
    const largeTransactions: Array<{ transaction: Transaction; reason: string; }> = [];
    
    const transactions = backupData.transactions || [];
    const accounts = backupData.accounts || [];
    
    // Build account lookup maps
    const accountNameMap = new Set(accounts.map(acc => acc.name));
    const accountIdMap = new Set(accounts.map(acc => acc.id));
    
    // Track statistics
    let criticalIssues = 0;
    let warnings = 0;
    let info = 0;
    
    // 1. Analyze orphaned account references
    const orphanedTransactions = this.findOrphanedTransactions(transactions, accountNameMap, accountIdMap);
    if (orphanedTransactions.length > 0) {
      criticalIssues++;
      issues.push({
        type: 'critical',
        category: 'orphaned_account',
        message: `${orphanedTransactions.length} transactions reference non-existent accounts`,
        count: orphanedTransactions.length,
        details: orphanedTransactions.slice(0, 5).map(tx => ({
          id: tx.id,
          account: tx.account,
          description: tx.description,
          amount: tx.amount
        }))
      });
    }
    
    // 2. Check for missing required fields
    const missingFieldsAnalysis = this.analyzeMissingFields(transactions);
    for (const [field, count] of Object.entries(missingFieldsAnalysis)) {
      if (count > 0) {
        criticalIssues++;
        issues.push({
          type: 'critical',
          category: 'missing_field',
          message: `${count} transactions missing required field: ${field}`,
          count: count
        });
      }
    }
    
    // 3. Validate dates
    const dateIssues = this.validateTransactionDates(transactions);
    if (dateIssues.length > 0) {
      criticalIssues++;
      issues.push({
        type: 'critical',
        category: 'invalid_date',
        message: `${dateIssues.length} transactions have invalid or impossible dates`,
        count: dateIssues.length,
        details: dateIssues.slice(0, 5)
      });
    }
    
    // 4. Detect duplicate transactions
    const duplicateAnalysis = this.detectDuplicateTransactions(transactions);
    if (duplicateAnalysis.groups.length > 0) {
      warnings++;
      duplicateGroups.push(...duplicateAnalysis.groups);
      issues.push({
        type: 'warning',
        category: 'duplicate_transaction',
        message: `${duplicateAnalysis.groups.length} potential duplicate transaction groups found (${duplicateAnalysis.totalDuplicates} total duplicates)`,
        count: duplicateAnalysis.groups.length,
        details: { totalDuplicates: duplicateAnalysis.totalDuplicates }
      });
    }
    
    // 5. Flag large amount transactions
    const largeAmountAnalysis = this.findLargeAmountTransactions(transactions);
    if (largeAmountAnalysis.length > 0) {
      warnings++;
      largeTransactions.push(...largeAmountAnalysis);
      issues.push({
        type: 'warning',
        category: 'large_amount',
        message: `${largeAmountAnalysis.length} transactions with unusually large amounts (>$100k)`,
        count: largeAmountAnalysis.length
      });
    }
    
    // 6. Validate amount fields
    const invalidAmounts = this.validateAmounts(transactions);
    if (invalidAmounts.length > 0) {
      criticalIssues++;
      issues.push({
        type: 'critical',
        category: 'invalid_amount',
        message: `${invalidAmounts.length} transactions with invalid amounts`,
        count: invalidAmounts.length,
        details: invalidAmounts.slice(0, 5)
      });
    }
    
    // 7. Data consistency checks
    const consistencyIssues = this.checkDataConsistency(backupData);
    issues.push(...consistencyIssues);
    consistencyIssues.forEach(issue => {
      if (issue.type === 'critical') criticalIssues++;
      else if (issue.type === 'warning') warnings++;
      else info++;
    });
    
    return {
      totalTransactions: transactions.length,
      totalAccounts: accounts.length,
      issues,
      duplicateGroups,
      largeTransactions,
      summary: {
        criticalIssues,
        warnings,
        info,
        isHealthy: criticalIssues === 0
      }
    };
  }
  
  /**
   * Find transactions that reference accounts that don't exist
   */
  private findOrphanedTransactions(transactions: Transaction[], accountNames: Set<string>, accountIds: Set<string>): Transaction[] {
    return transactions.filter(tx => {
      const account = tx.account || '';
      return !accountNames.has(account) && !accountIds.has(account);
    });
  }
  
  /**
   * Analyze missing required fields
   */
  private analyzeMissingFields(transactions: Transaction[]): Record<string, number> {
    const requiredFields = ['id', 'date', 'description', 'amount', 'account', 'type'];
    const missing: Record<string, number> = {};
    
    for (const field of requiredFields) {
      missing[field] = 0;
    }
    
    for (const tx of transactions) {
      for (const field of requiredFields) {
        const value = (tx as any)[field];
        if (!value || (typeof value === 'string' && value.trim() === '')) {
          missing[field]++;
        }
      }
    }
    
    return missing;
  }
  
  /**
   * Validate transaction dates
   */
  private validateTransactionDates(transactions: Transaction[]): Array<{id: string; date: string; issue: string}> {
    const issues: Array<{id: string; date: string; issue: string}> = [];
    const currentYear = new Date().getFullYear();
    
    for (const tx of transactions) {
      const dateStr = tx.date?.toString() || '';
      try {
        const parsedDate = new Date(dateStr);
        
        if (isNaN(parsedDate.getTime())) {
          issues.push({
            id: tx.id || 'unknown',
            date: dateStr,
            issue: 'Invalid date format'
          });
          continue;
        }
        
        // Check for impossible dates
        if (parsedDate.getFullYear() > currentYear + 1 || parsedDate.getFullYear() < 1900) {
          issues.push({
            id: tx.id || 'unknown',
            date: dateStr,
            issue: 'Impossible date (too far in past or future)'
          });
        }
      } catch (error) {
        issues.push({
          id: tx.id || 'unknown',
          date: dateStr,
          issue: 'Date parsing error'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Detect duplicate transactions using signature matching
   */
  private detectDuplicateTransactions(transactions: Transaction[]): {
    groups: Array<{ signature: string; transactions: Transaction[]; count: number; }>;
    totalDuplicates: number;
  } {
    const signatureMap = new Map<string, Transaction[]>();
    
    // Group transactions by signature: date + amount + description(truncated)
    for (const tx of transactions) {
      const dateStr = tx.date?.toString().substring(0, 10) || '';
      const amount = tx.amount || 0;
      const description = (tx.description || '').substring(0, 20);
      const signature = `${dateStr}|${amount}|${description}`;
      
      if (!signatureMap.has(signature)) {
        signatureMap.set(signature, []);
      }
      signatureMap.get(signature)!.push(tx);
    }
    
    // Find groups with more than one transaction
    const duplicateGroups: Array<{ signature: string; transactions: Transaction[]; count: number; }> = [];
    let totalDuplicates = 0;
    
    for (const [signature, txs] of signatureMap.entries()) {
      if (txs.length > 1) {
        duplicateGroups.push({
          signature,
          transactions: txs,
          count: txs.length
        });
        totalDuplicates += txs.length;
      }
    }
    
    return { groups: duplicateGroups, totalDuplicates };
  }
  
  /**
   * Find transactions with unusually large amounts
   */
  private findLargeAmountTransactions(transactions: Transaction[], threshold: number = 100000): Array<{ transaction: Transaction; reason: string; }> {
    const largeTransactions: Array<{ transaction: Transaction; reason: string; }> = [];
    
    for (const tx of transactions) {
      const amount = Math.abs(tx.amount || 0);
      if (amount > threshold) {
        largeTransactions.push({
          transaction: tx,
          reason: `Amount ${amount >= 1000000 ? '>$1M' : '>$100k'} (${amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })})`
        });
      }
    }
    
    return largeTransactions;
  }
  
  /**
   * Validate amount fields
   */
  private validateAmounts(transactions: Transaction[]): Array<{id: string; amount: any; issue: string}> {
    const issues: Array<{id: string; amount: any; issue: string}> = [];
    
    for (const tx of transactions) {
      const amount = tx.amount;
      
      if (amount === null || amount === undefined) {
        issues.push({
          id: tx.id || 'unknown',
          amount,
          issue: 'Missing amount'
        });
      } else if (typeof amount !== 'number') {
        issues.push({
          id: tx.id || 'unknown',
          amount,
          issue: 'Amount is not a number'
        });
      } else if (isNaN(amount)) {
        issues.push({
          id: tx.id || 'unknown',
          amount,
          issue: 'Amount is NaN'
        });
      } else if (!isFinite(amount)) {
        issues.push({
          id: tx.id || 'unknown',
          amount,
          issue: 'Amount is not finite'
        });
      }
    }
    
    return issues;
  }
  
  /**
   * Check overall data consistency
   */
  private checkDataConsistency(backupData: ExportData): BackupIntegrityIssue[] {
    const issues: BackupIntegrityIssue[] = [];
    
    // Check backup metadata
    if (!backupData.version) {
      issues.push({
        type: 'warning',
        category: 'data_consistency',
        message: 'Backup file missing version information'
      });
    }
    
    if (!backupData.exportDate) {
      issues.push({
        type: 'warning',
        category: 'data_consistency',
        message: 'Backup file missing export date'
      });
    }
    
    // Check for reasonable transaction date distribution
    const transactions = backupData.transactions || [];
    if (transactions.length > 0) {
      const dates = transactions
        .map(tx => new Date(tx.date))
        .filter(date => !isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
      
      if (dates.length > 0) {
        const oldestDate = dates[0];
        const newestDate = dates[dates.length - 1];
        const yearSpan = newestDate.getFullYear() - oldestDate.getFullYear();
        
        if (yearSpan > 20) {
          issues.push({
            type: 'info',
            category: 'data_consistency',
            message: `Transaction date span is ${yearSpan} years (${oldestDate.getFullYear()}-${newestDate.getFullYear()})`
          });
        }
      }
    }
    
    return issues;
  }
  
  /**
   * Get duplicate transactions using existing dataService logic
   */
  async findDuplicatesInBackup(backupData: ExportData, config?: DuplicateDetectionConfig): Promise<DuplicateTransaction[]> {
    const transactions = backupData.transactions || [];
    
    // Convert to the format expected by dataService
    const transactionPairs: Array<Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>> = transactions.map(tx => ({
      date: tx.date,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      subcategory: tx.subcategory,
      account: tx.account,
      type: tx.type,
      isRecurring: tx.isRecurring,
      tags: tx.tags,
      notes: tx.notes,
      originalText: tx.originalText,
      confidence: tx.confidence,
      reasoning: tx.reasoning,
      isVerified: tx.isVerified,
      vendor: tx.vendor,
      location: tx.location,
      reimbursed: tx.reimbursed,
      reimbursementId: tx.reimbursementId,
      originalCurrency: tx.originalCurrency,
      exchangeRate: tx.exchangeRate,
      attachedFileId: tx.attachedFileId,
      attachedFileName: tx.attachedFileName,
      attachedFileType: tx.attachedFileType,
      aiProxyMetadata: tx.aiProxyMetadata,
      isAnomaly: tx.isAnomaly,
      anomalyType: tx.anomalyType,
      anomalyScore: tx.anomalyScore,
      historicalAverage: tx.historicalAverage,
      splits: tx.splits,
      isSplit: tx.isSplit,
      transferId: tx.transferId,
      isTransferPrimary: tx.isTransferPrimary
    }));
    
    // Use existing duplicate detection logic
    const duplicateResult = await dataService.detectDuplicates(transactionPairs, config);
    return duplicateResult.duplicates;
  }
}

export const backupIntegrityService = new BackupIntegrityService();