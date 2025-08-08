import { Transaction, DuplicateDetectionResult, DuplicateTransaction, DuplicateDetectionConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';

class DataService {
  private transactions: Transaction[] = [];
  private storageKey = 'mo-money-transactions';
  private historyStorageKey = 'mo-money-transaction-history';
  private history: { [transactionId: string]: Array<{ id: string; timestamp: string; data: Transaction; note?: string }> } = {};

  constructor() {
    this.loadFromStorage();
  this.loadHistoryFromStorage();
    // Initialize with sample data if empty
    if (this.transactions.length === 0) {
      this.initializeSampleData();
    }
  }

  private initializeSampleData(): void {
    const sampleTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [
      {
        date: new Date('2025-08-01'),
        description: 'Whole Foods Market #123',
        notes: 'Weekly grocery shopping',
        category: 'Food & Dining',
        subcategory: 'Groceries',
        amount: -125.50,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.95,
        reasoning: 'High confidence grocery store categorization',
        isVerified: false,
        vendor: 'Whole Foods'
      },
      {
        date: new Date('2025-08-01'),
        description: 'Starbucks Coffee',
        category: 'Food & Dining',
        subcategory: 'Coffee Shops',
        amount: -4.50,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.89,
        reasoning: 'Coffee shop transaction identified',
        isVerified: true
      },
      {
        date: new Date('2025-07-31'),
        description: 'Payroll Deposit - ABC Corp',
        category: 'Income',
        subcategory: 'Salary',
        amount: 2500.00,
        account: 'Chase Checking',
        type: 'income',
        confidence: 0.98,
        reasoning: 'Payroll deposit clearly identified',
        isVerified: true
      },
      {
        date: new Date('2025-07-30'),
        description: 'Shell Gas Station',
        category: 'Transportation',
        subcategory: 'Gas & Fuel',
        amount: -75.00,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.92,
        reasoning: 'Gas station transaction',
        isVerified: false
      },
      {
        date: new Date('2025-07-30'),
        description: 'Rent Payment - Apartment Complex',
        notes: 'Monthly rent payment',
        category: 'Housing',
        subcategory: 'Rent',
        amount: -1200.00,
        account: 'Chase Checking',
        type: 'expense',
        confidence: 0.99,
        reasoning: 'Rent payment clearly identified',
        isVerified: true
      },
      // Sample transfer transactions for testing
      {
        date: new Date('2025-08-01'),
        description: 'Transfer to Savings - Chase Online',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        amount: -500.00,
        account: 'Chase Checking',
        type: 'transfer',
        confidence: 0.95,
        reasoning: 'Internal transfer identified',
        isVerified: false
      },
      {
        date: new Date('2025-08-01'),
        description: 'Transfer from Checking - Chase Online',
        category: 'Internal Transfer',
        subcategory: 'Between Accounts',
        amount: 500.00,
        account: 'Chase Savings',
        type: 'transfer',
        confidence: 0.95,
        reasoning: 'Internal transfer identified',
        isVerified: false
      },
      {
        date: new Date('2025-07-28'),
        description: 'ATM Withdrawal - Chase ATM #1234',
        category: 'Internal Transfer',
        subcategory: 'Withdrawal',
        amount: -100.00,
        account: 'Chase Checking',
        type: 'transfer',
        confidence: 0.90,
        reasoning: 'ATM withdrawal identified',
        isVerified: false
      }
    ];

    // Add sample transactions
    this.addTransactions(sampleTransactions);
  }

  // Core CRUD operations
  async getAllTransactions(): Promise<Transaction[]> {
    console.log(`DataService: getAllTransactions called, returning ${this.transactions.length} transactions`);
    return [...this.transactions];
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    return this.transactions.find(t => t.id === id) || null;
  }

  async addTransaction(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<Transaction> {
    const now = new Date();
    const newTransaction: Transaction = {
      ...transaction,
      id: uuidv4(),
      addedDate: now,
      lastModifiedDate: now,
    };
    
    this.transactions.push(newTransaction);
    this.saveToStorage();
    return newTransaction;
  }

  async addTransactions(transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<Transaction[]> {
    console.log(`DataService: Adding ${transactions.length} transactions`);
    const now = new Date();
    const newTransactions = transactions.map(transaction => ({
      ...transaction,
      id: uuidv4(),
      addedDate: now,
      lastModifiedDate: now,
    }));
    
    console.log(`DataService: Created ${newTransactions.length} new transaction objects`);
    this.transactions.push(...newTransactions);
    console.log(`DataService: Total transactions now: ${this.transactions.length}`);
    this.saveToStorage();
    console.log(`DataService: Saved to localStorage`);
    return newTransactions;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;
    // Record a snapshot of the current transaction before updating
    const current = this.transactions[index];
    this.addHistorySnapshot(current.id, current, note);

    this.transactions[index] = {
      ...current,
      ...updates,
      lastModifiedDate: new Date(),
    };
    
    this.saveToStorage();
    this.saveHistoryToStorage();
    return this.transactions[index];
  }

  async deleteTransaction(id: string): Promise<boolean> {
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return false;

    this.transactions.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  async deleteTransactions(ids: string[]): Promise<number> {
    const initialLength = this.transactions.length;
    this.transactions = this.transactions.filter(t => !ids.includes(t.id));
    const deletedCount = initialLength - this.transactions.length;
    
    if (deletedCount > 0) {
      this.saveToStorage();
    }
    
    return deletedCount;
  }

  // Query operations
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    return this.transactions.filter(t => 
      t.date >= startDate && t.date <= endDate
    );
  }

  async getTransactionsByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    return this.transactions.filter(t => 
      t.category === category && 
      (subcategory === undefined || t.subcategory === subcategory)
    );
  }

  async searchTransactions(query: string): Promise<Transaction[]> {
    const lowerQuery = query.toLowerCase();
    return this.transactions.filter(t => 
      t.description.toLowerCase().includes(lowerQuery) ||
      t.category.toLowerCase().includes(lowerQuery) ||
      t.subcategory?.toLowerCase().includes(lowerQuery) ||
      t.notes?.toLowerCase().includes(lowerQuery) ||
      t.vendor?.toLowerCase().includes(lowerQuery)
    );
  }

  // Export/Import operations
  async exportToJSON(): Promise<string> {
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      transactions: this.transactions,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async exportToCSV(): Promise<string> {
    const headers = [
      'ID', 'Date', 'Description', 'Additional Notes', 'Category', 
      'Subcategory', 'Amount', 'Account', 'Type', 'Confidence', 
      'Reasoning', 'Added Date', 'Last Modified Date'
    ];
    
    const csvRows = [headers.join(',')];
    
    this.transactions.forEach(transaction => {
      const row = [
        transaction.id,
        transaction.date.toISOString().split('T')[0],
        `"${transaction.description.replace(/"/g, '""')}"`,
        `"${(transaction.notes || '').replace(/"/g, '""')}"`,
        transaction.category,
        transaction.subcategory || '',
        transaction.amount,
        transaction.account || '',
        transaction.type || '',
        transaction.confidence || '',
        `"${(transaction.reasoning || '').replace(/"/g, '""')}"`,
        transaction.addedDate?.toISOString() || '',
        transaction.lastModifiedDate?.toISOString() || '',
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  }

  async importFromJSON(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const data = JSON.parse(jsonData);
      const errors: string[] = [];
      let imported = 0;

      if (!data.transactions || !Array.isArray(data.transactions)) {
        throw new Error('Invalid JSON format: transactions array not found');
      }

      const validTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

      data.transactions.forEach((transaction: any, index: number) => {
        try {
          // Validate required fields
          if (!transaction.date || !transaction.description || !transaction.category || transaction.amount === undefined) {
            errors.push(`Row ${index + 1}: Missing required fields`);
            return;
          }

          const validTransaction = {
            date: new Date(transaction.date),
            description: transaction.description,
            notes: transaction.additionalNotes || transaction.notes,
            category: transaction.category,
            subcategory: transaction.subcategory,
            amount: Number(transaction.amount),
            account: transaction.account,
            type: transaction.type,
            isRecurring: transaction.isRecurring,
            tags: transaction.tags,
            originalText: transaction.originalText,
            confidence: transaction.confidence,
            reasoning: transaction.reasoning,
            isVerified: transaction.isVerified,
            vendor: transaction.vendor,
            location: transaction.location,
          };

          validTransactions.push(validTransaction);
          imported++;
        } catch (error) {
          errors.push(`Row ${index + 1}: ${error instanceof Error ? error.message : 'Invalid data'}`);
        }
      });

      if (validTransactions.length > 0) {
        await this.addTransactions(validTransactions);
      }

      return { success: true, imported, errors };
    } catch (error) {
      return { 
        success: false, 
        imported: 0, 
        errors: [error instanceof Error ? error.message : 'Unknown error occurred'] 
      };
    }
  }

  // Storage operations
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        this.transactions = data.map((t: any) => ({
          ...t,
          date: new Date(t.date),
          addedDate: new Date(t.addedDate),
          lastModifiedDate: new Date(t.lastModifiedDate),
        }));
      }
    } catch (error) {
      console.error('Failed to load transactions from storage:', error);
      this.transactions = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.transactions));
    } catch (error) {
      console.error('Failed to save transactions to storage:', error);
    }
  }

  private loadHistoryFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.historyStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Rehydrate dates inside snapshots
        Object.keys(parsed).forEach((txId: string) => {
          parsed[txId] = parsed[txId].map((entry: any) => ({
            ...entry,
            data: {
              ...entry.data,
              date: new Date(entry.data.date),
              addedDate: entry.data.addedDate ? new Date(entry.data.addedDate) : undefined,
              lastModifiedDate: entry.data.lastModifiedDate ? new Date(entry.data.lastModifiedDate) : undefined,
            }
          }));
        });
        this.history = parsed;
      }
    } catch (error) {
      console.error('Failed to load transaction history from storage:', error);
      this.history = {};
    }
  }

  private saveHistoryToStorage(): void {
    try {
      localStorage.setItem(this.historyStorageKey, JSON.stringify(this.history));
    } catch (error) {
      console.error('Failed to save transaction history to storage:', error);
    }
  }

  private addHistorySnapshot(transactionId: string, snapshot: Transaction, note?: string): void {
    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      data: { ...snapshot },
      note,
    };
    if (!this.history[transactionId]) {
      this.history[transactionId] = [];
    }
    this.history[transactionId].push(entry);
  }

  async getTransactionHistory(transactionId: string): Promise<Array<{ id: string; timestamp: string; data: Transaction; note?: string }>> {
    return [...(this.history[transactionId] || [])].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  async restoreTransactionVersion(transactionId: string, versionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    const versions = this.history[transactionId] || [];
    const version = versions.find(v => v.id === versionId);
    if (!version) return null;

    // Snapshot current before restoring
    const current = this.transactions[index];
    this.addHistorySnapshot(transactionId, current, note ? `Before restore: ${note}` : 'Auto-snapshot before restore');

    // Restore
    const restored: Transaction = {
      ...version.data,
      id: transactionId, // ensure id remains the same
      lastModifiedDate: new Date(),
    };
    this.transactions[index] = restored;
    this.saveToStorage();
    this.saveHistoryToStorage();
    return restored;
  }

  // Utility methods
  async getStats(): Promise<{
    total: number;
    totalIncome: number;
    totalExpenses: number;
    categories: { [category: string]: number };
  }> {
    const stats = {
      total: this.transactions.length,
      totalIncome: 0,
      totalExpenses: 0,
      categories: {} as { [category: string]: number },
    };

    this.transactions.forEach(transaction => {
      if (transaction.type === 'income' || transaction.amount > 0) {
        stats.totalIncome += Math.abs(transaction.amount);
      } else {
        stats.totalExpenses += Math.abs(transaction.amount);
      }

      const category = transaction.category;
      stats.categories[category] = (stats.categories[category] || 0) + Math.abs(transaction.amount);
    });

    return stats;
  }

  async clearAllData(): Promise<void> {
    this.transactions = [];
  this.history = {};
    this.saveToStorage();
  this.saveHistoryToStorage();
  }

  // Anomaly detection methods
  async detectAnomalies(): Promise<void> {
    for (const transaction of this.transactions) {
      const anomalyInfo = this.calculateAnomalyScore(transaction);
      
      if (anomalyInfo.isAnomaly) {
        transaction.isAnomaly = true;
        transaction.anomalyType = anomalyInfo.type;
        transaction.anomalyScore = anomalyInfo.score;
        transaction.historicalAverage = anomalyInfo.historicalAverage;
      }
    }
    this.saveToStorage();
  }

  private calculateAnomalyScore(transaction: Transaction): {
    isAnomaly: boolean;
    type?: 'high' | 'low';
    score: number;
    historicalAverage: number;
  } {
    // Get historical transactions for the same category and/or vendor
    const historicalTransactions = this.getHistoricalTransactions(transaction);
    
    if (historicalTransactions.length < 3) {
      // Not enough historical data to determine anomalies
      return { isAnomaly: false, score: 0, historicalAverage: 0 };
    }

    const amounts = historicalTransactions.map(t => Math.abs(t.amount));
    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const variance = amounts.reduce((sum, amount) => sum + Math.pow(amount - average, 2), 0) / amounts.length;
    const standardDeviation = Math.sqrt(variance);
    
    const currentAmount = Math.abs(transaction.amount);
    const deviationFromMean = Math.abs(currentAmount - average);
    const standardDeviations = standardDeviation > 0 ? deviationFromMean / standardDeviation : 0;
    
    // Consider it an anomaly if it's more than 2 standard deviations from the mean
    // and the amount is significantly different (at least 50% different from average)
    const isSignificantlyDifferent = Math.abs(currentAmount - average) / average > 0.5;
    const isStatisticalAnomaly = standardDeviations > 2;
    
    if (isStatisticalAnomaly && isSignificantlyDifferent) {
      return {
        isAnomaly: true,
        type: currentAmount > average ? 'high' : 'low',
        score: Math.min(10, Math.round(standardDeviations)), // Cap at 10
        historicalAverage: average
      };
    }

    return { 
      isAnomaly: false, 
      score: Math.round(standardDeviations), 
      historicalAverage: average 
    };
  }

  private getHistoricalTransactions(transaction: Transaction): Transaction[] {
    // Get transactions from the same category and/or vendor, excluding the current transaction
    return this.transactions.filter(t => 
      t.id !== transaction.id && 
      t.type === transaction.type && 
      (
        // Same category
        t.category === transaction.category ||
        // Same vendor (if available)
        (transaction.vendor && t.vendor && t.vendor === transaction.vendor) ||
        // Similar description (for vendors not explicitly tagged)
        this.calculateStringSimilarity(t.description, transaction.description) > 0.6
      )
    );
  }

  // Method to get anomalous transactions
  async getAnomalousTransactions(): Promise<Transaction[]> {
    return this.transactions.filter(t => t.isAnomaly === true);
  }

  // Duplicate detection
  async detectDuplicates(newTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[], config?: DuplicateDetectionConfig): Promise<DuplicateDetectionResult> {
    // Default configuration for duplicate detection
    const defaultConfig: DuplicateDetectionConfig = {
      amountTolerance: 0.02, // 2% tolerance
      fixedAmountTolerance: 1.00, // $1.00 fixed tolerance
      dateTolerance: 3, // 3 days tolerance
      requireExactDescription: false, // Allow similar descriptions
      requireSameAccount: true, // Account must match
    };

    const finalConfig = { ...defaultConfig, ...config };
    const duplicates: DuplicateTransaction[] = [];
    const uniqueTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[] = [];

    for (const newTransaction of newTransactions) {
      const duplicateInfo = this.findDuplicate(newTransaction, finalConfig);
      
      if (duplicateInfo) {
        duplicates.push(duplicateInfo);
      } else {
        uniqueTransactions.push(newTransaction);
      }
    }

    return {
      duplicates,
      uniqueTransactions,
      config: finalConfig
    };
  }

  private findDuplicate(newTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>, config: DuplicateDetectionConfig): DuplicateTransaction | null {
    for (const existing of this.transactions) {
      const matchInfo = this.calculateTransactionSimilarity(existing, newTransaction, config);
      
      if (matchInfo.similarity >= 0.8) { // 80% similarity threshold for duplicates
        return {
          existingTransaction: existing,
          newTransaction,
          matchFields: matchInfo.matchFields,
          similarity: matchInfo.similarity,
          amountDifference: matchInfo.amountDifference,
          daysDifference: matchInfo.daysDifference,
          matchType: matchInfo.matchType
        };
      }
    }
    return null;
  }

  private calculateTransactionSimilarity(existing: Transaction, newTransaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>, config: DuplicateDetectionConfig): {
    similarity: number;
    matchFields: string[];
    amountDifference?: number;
    daysDifference?: number;
    matchType: 'exact' | 'tolerance';
  } {
    let score = 0;
    let maxScore = 0;
    const matchFields: string[] = [];
    let amountDifference: number | undefined;
    let daysDifference: number | undefined;
    let isExactMatch = true;

    // Date comparison (weight: 25%)
    const existingDate = new Date(existing.date);
    const newDate = new Date(newTransaction.date);
    const daysDiff = Math.abs((existingDate.getTime() - newDate.getTime()) / (1000 * 60 * 60 * 24));
    
    maxScore += 25;
    if (daysDiff === 0) {
      score += 25; // Exact date match
      matchFields.push('date');
    } else if (daysDiff <= (config.dateTolerance || 0)) {
      score += Math.max(10, 25 - (daysDiff * 3)); // Reduced score based on days difference
      matchFields.push('date');
      daysDifference = daysDiff;
      isExactMatch = false;
    }

    // Amount comparison (weight: 30%)
    const amountDiff = Math.abs(existing.amount - newTransaction.amount);
    const percentageDiff = Math.abs(amountDiff / Math.abs(existing.amount));
    
    maxScore += 30;
    if (amountDiff === 0) {
      score += 30; // Exact amount match
      matchFields.push('amount');
    } else if (
      (config.amountTolerance && percentageDiff <= config.amountTolerance) ||
      (config.fixedAmountTolerance && amountDiff <= config.fixedAmountTolerance)
    ) {
      score += Math.max(15, 30 - (percentageDiff * 100)); // Reduced score based on difference
      matchFields.push('amount');
      amountDifference = amountDiff;
      isExactMatch = false;
    }

    // Description comparison (weight: 30%)
    maxScore += 30;
    if (existing.description === newTransaction.description) {
      score += 30; // Exact description match
      matchFields.push('description');
    } else if (!config.requireExactDescription) {
      const similarity = this.calculateStringSimilarity(existing.description, newTransaction.description);
      if (similarity > 0.7) { // 70% string similarity
        score += similarity * 30;
        matchFields.push('description');
        if (similarity < 1) isExactMatch = false;
      }
    }

    // Account comparison (weight: 15%)
    maxScore += 15;
    if (existing.account === newTransaction.account) {
      score += 15;
      matchFields.push('account');
    } else if (!config.requireSameAccount) {
      // If account matching is not required, still give some points for same account
      // but don't penalize for different accounts
      score += 5;
    }

    return {
      similarity: maxScore > 0 ? score / maxScore : 0,
      matchFields,
      amountDifference,
      daysDifference,
      matchType: isExactMatch ? 'exact' : 'tolerance'
    };
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1.toLowerCase() : str2.toLowerCase();
    const shorter = str1.length > str2.length ? str2.toLowerCase() : str1.toLowerCase();
    
    if (longer.length === 0) return 1.0;
    
    // Simple character-based similarity
    let matches = 0;
    const shorterChars = shorter.split('');
    const longerChars = longer.split('');
    
    for (let i = 0; i < shorterChars.length; i++) {
      const char = shorterChars[i];
      const index = longerChars.indexOf(char);
      if (index !== -1) {
        matches++;
        longerChars.splice(index, 1); // Remove matched character to avoid double counting
      }
    }
    
    return matches / longer.length;
  }
}

// Create singleton instance
export const dataService = new DataService();
export default dataService;
