import { Transaction, DuplicateDetectionResult, DuplicateTransaction, CategoryRule, DuplicateDetectionConfig } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { db, initializeDB, performPostInitHealthCheck, TransactionHistoryEntry, DBHealthCheck, INTERNAL_TRANSFER_MIGRATION_KEY, isMigrationCompleted, markMigrationCompleted } from './db';
import { rulesService } from './rulesService';
import { transferMatchingService } from './transferMatchingService';
import { notificationService } from './notificationService';

// Global flag to prevent multiple simultaneous initializations
let isInitializationInProgress = false;

class DataService {
  private transactions: Transaction[] = [];
  private history: { [transactionId: string]: Array<{ id: string; timestamp: string; data: Transaction; note?: string }> } = {};
  private isInitialized = false;
  private healthCheckResults: DBHealthCheck | null = null;
  private healthCheckFailures = 0; // Track consecutive health check failures
  private needsAnomalyDetection = false; // Track if anomaly detection needs to be re-run
  
  // In-memory undo/redo stacks for fast operations during active editing
  private undoStacks: { [transactionId: string]: Transaction[] } = {};
  private redoStacks: { [transactionId: string]: Transaction[] } = {};
  private readonly MAX_UNDO_STACK_SIZE = 10;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Prevent multiple simultaneous initializations
    if (isInitializationInProgress) {
      // Wait for the other initialization to complete
      const maxWait = 10000; // 10 seconds max wait
      const start = Date.now();
      while (isInitializationInProgress && (Date.now() - start) < maxWait) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      // If still not initialized after wait, proceed (might be a different instance)
      if (this.isInitialized) return;
    }
    
    isInitializationInProgress = true;
    
    try {
      const __IS_TEST__ = process.env.NODE_ENV === 'test';
  const txLog = (...args: any[]) => { if (!__IS_TEST__) console.log(...args); };
  const txError = (...args: any[]) => { if (!__IS_TEST__) console.error(...args); };

      txLog('[TX] DataService initializing...');
      
      // Initialize IndexedDB and handle migration
      await initializeDB();
      
      // Load data from IndexedDB
      await this.loadFromDB();
      
      // Perform data migrations after loading data - only if not already completed
      if (!isMigrationCompleted(INTERNAL_TRANSFER_MIGRATION_KEY)) {
        txLog('[TX] Running Internal Transfer migration...');
        const migrationResult = await this.migrateInternalTransferTypes();
        if (migrationResult.fixed > 0 || migrationResult.errors.length > 0) {
          txLog(`[TX] Internal Transfer migration completed: ${migrationResult.fixed} fixed, ${migrationResult.errors.length} errors`);
          if (migrationResult.errors.length > 0) {
            txError('[TX] Migration errors:', migrationResult.errors);
          }
        }
        // Mark migration as completed regardless of outcome to prevent infinite retries
        markMigrationCompleted(INTERNAL_TRANSFER_MIGRATION_KEY);
      } else {
        txLog('[TX] Internal Transfer migration already completed, skipping');
      }
      
      // Perform health check after loading data
      const { needsReset, healthCheck } = await performPostInitHealthCheck();
      this.healthCheckResults = healthCheck;
      
      if (needsReset) {
        this.healthCheckFailures++;
        txError(`[TX] Database health check failed (attempt ${this.healthCheckFailures}/2)`, healthCheck);
        
        if (this.healthCheckFailures >= 2) {
          // Show user prompt for reset
          await this.showCorruptionResetPrompt();
          return; // Don't continue initialization if we're prompting for reset
        }
      } else {
        this.healthCheckFailures = 0; // Reset failure count on successful check
        
        // Log health statistics  
        const stats = healthCheck.stats;
        const firstId = this.transactions.length > 0 ? this.transactions[0].id : 'none';
        const lastId = this.transactions.length > 0 ? this.transactions[this.transactions.length - 1].id : 'none';
        
        txLog(`[TX] DB Health: ${stats.totalTransactions} transactions in DB, ${this.transactions.length} in memory, first: ${firstId}, last: ${lastId}`);
      }
      
      // Sample data is now loaded manually via Settings instead of automatically
      // if (this.transactions.length === 0 && process.env.NODE_ENV !== 'test') {
      //   this.initializeSampleData();
      // }
      
      this.isInitialized = true;
      txLog(`[TX] DataService initialized with ${this.transactions.length} transactions`);
    } catch (error) {
      const txError = (...args: any[]) => { if (process.env.NODE_ENV !== 'test') console.error(...args); };
      txError('[TX] Failed to initialize DataService:', error);
      this.healthCheckFailures++;
      
      // Fallback to empty state
      this.transactions = [];
      this.history = {};
      this.isInitialized = true;
    } finally {
      // Always clear the initialization flag
      isInitializationInProgress = false;
    }
  }

  private async showCorruptionResetPrompt(): Promise<void> {
    const shouldReset = await notificationService.showConfirmation(
      "This will delete all your data and reset the application.", 
      {
        title: "Database Corruption Detected",
        confirmText: "Reset Database",
        cancelText: "Continue Anyway",
        danger: true
      }
    );
    
    if (shouldReset) {
      this.performEmergencyReset();
    } else {
      // User chose not to reset, continue with potentially corrupted data
      console.warn('[TX] User declined reset, continuing with potentially corrupted data');
      this.isInitialized = true;
    }
  }

  private async performEmergencyReset(): Promise<void> {
    try {
      console.log('[TX] Performing emergency reset due to corruption...');
      
      // Close database connection
      await db.close();
      
      // Delete the entire database
      await indexedDB.deleteDatabase('MoMoneyDB');
      
      // Clear localStorage
      const keysToRemove = [
        'mo-money-accounts',
        'mo-money-categories',
        'mo-money-templates', 
        'mo-money-category-rules',
        'transactionsPageSize',
        'APP_DATA_VERSION'
      ];
      
      keysToRemove.forEach(key => {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          console.warn(`[TX] Failed to clear localStorage key ${key}:`, error);
        }
      });
      
      notificationService.showAlert('success', 'Database has been reset due to corruption. The page will reload.', 'Database Reset');
      window.location.reload();
    } catch (error) {
      console.error('[TX] Emergency reset failed:', error);
      notificationService.showAlert('error', 'Failed to reset corrupted database. Please visit /reset-db.html for manual reset.', 'Reset Failed');
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  async loadSampleData(): Promise<void> {
    await this.ensureInitialized();
    
    // Load sample accounts first
    const { accountManagementService } = await import('./accountManagementService');
    accountManagementService.loadSampleAccounts();
    
    // Then load sample transactions
    this.initializeSampleData();
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
        account: 'Primary Savings',
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
      },
      // Multi-currency sample transactions
      {
        date: new Date('2025-07-27'),
        description: 'Hotel Booking - Paris France',
        category: 'Travel',
        subcategory: 'Accommodation',
        amount: -150.00, // Will be converted from EUR
        originalCurrency: 'EUR',
        exchangeRate: 1.08, // Example rate: 1 EUR = 1.08 USD
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.88,
        reasoning: 'Travel expense in foreign currency',
        isVerified: false,
        notes: 'Business trip to Paris'
      },
      {
        date: new Date('2025-07-25'),
        description: 'Lunch at Ramen Shop - Tokyo',
        category: 'Food & Dining',
        subcategory: 'Restaurants',
        amount: -2200.00, // In JPY, will show converted value
        originalCurrency: 'JPY',
        exchangeRate: 0.0067, // Example rate: 1 JPY = 0.0067 USD
        account: 'AmEx Platinum',
        type: 'expense',
        confidence: 0.92,
        reasoning: 'Restaurant expense in Japanese Yen',
        isVerified: false,
        vendor: 'Ramen Ichiro'
      },
      {
        date: new Date('2025-07-24'),
        description: 'Coffee Shop - London Bridge',
        category: 'Food & Dining',
        subcategory: 'Coffee Shops',
        amount: -4.50, // Will be converted from GBP
        originalCurrency: 'GBP',
        exchangeRate: 1.27, // Example rate: 1 GBP = 1.27 USD
        account: 'Chase Credit',
        type: 'expense',
        confidence: 0.89,
        reasoning: 'Coffee purchase in British Pounds',
        isVerified: false,
        vendor: 'Pret A Manger'
      },
      // Asset allocation sample transactions for testing the filter
      {
        date: new Date('2025-07-20'),
        description: 'Stock Purchase - AAPL',
        category: 'Asset Allocation',
        subcategory: 'Stocks',
        amount: -1500.00, // Investment purchase (negative)
        account: 'Investment Account',
        type: 'asset-allocation',
        confidence: 0.95,
        reasoning: 'Investment transaction identified',
        isVerified: false,
        vendor: 'Brokerage Firm'
      },
      {
        date: new Date('2025-07-19'),
        description: 'Dividend Payment - VOO',
        category: 'Asset Allocation',
        subcategory: 'Dividends',
        amount: 75.00, // Investment income (positive)
        account: 'Investment Account', 
        type: 'asset-allocation',
        confidence: 0.98,
        reasoning: 'Dividend payment identified',
        isVerified: true,
        vendor: 'Vanguard'
      }
    ];

    // Add sample transactions
    this.addTransactions(sampleTransactions);
  }

  // Core CRUD operations
  async getAllTransactions(): Promise<Transaction[]> {
    await this.ensureInitialized();
    console.log(`DataService: getAllTransactions called, returning ${this.transactions.length} transactions`);
    return [...this.transactions];
  }

  // Check if anomaly detection needs to be re-run
  getNeedsAnomalyDetection(): boolean {
    return this.needsAnomalyDetection;
  }

  async getTransactionsWithoutTransfers(): Promise<Transaction[]> {
    await this.ensureInitialized();
    const filteredTransactions = transferMatchingService.filterNonTransfers(this.transactions);
    console.log(`DataService: getTransactionsWithoutTransfers called, returning ${filteredTransactions.length} of ${this.transactions.length} transactions`);
    return filteredTransactions;
  }

  async getAllTransfers(): Promise<Transaction[]> {
    await this.ensureInitialized();
    const transfers = transferMatchingService.getAllTransfers(this.transactions);
    console.log(`DataService: getAllTransfers called, returning ${transfers.length} transfer transactions`);
    return transfers;
  }

  async getCollapsedTransfers() {
    await this.ensureInitialized();
    const collapsedTransfers = transferMatchingService.createCollapsedTransfers(this.transactions);
    console.log(`DataService: getCollapsedTransfers called, returning ${collapsedTransfers.length} collapsed transfers`);
    return collapsedTransfers;
  }

  async getTransactionById(id: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    return this.transactions.find(t => t.id === id) || null;
  }

  async addTransaction(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): Promise<Transaction> {
    await this.ensureInitialized();
    const now = new Date();
    const newTransaction: Transaction = {
      ...transaction,
      id: uuidv4(),
      addedDate: now,
      lastModifiedDate: now,
    };
    
    this.transactions.push(newTransaction);
    
    // Set flag to indicate anomaly detection needs to be re-run
    this.needsAnomalyDetection = true;
    
    // Attempt automatic transfer matching if the new transaction is a transfer
    if (newTransaction.type === 'transfer') {
      console.log(`DataService: Attempting automatic transfer matching for new transfer transaction`);
      try {
        // Run automatic matching on all transactions to find matches with the newly added one
        this.transactions = await transferMatchingService.autoMatchTransfers(this.transactions);
      } catch (error) {
        console.warn('DataService: Automatic transfer matching failed:', error);
      }
    }
    
    await this.saveToDB();
    return newTransaction;
  }

  async addTransactions(transactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[]): Promise<Transaction[]> {
    await this.ensureInitialized();
    console.log(`🔧 DataService.addTransactions START`);
    console.log(`📊 Input: ${transactions.length} transactions to add`);
    console.log(`📊 Current database size: ${this.transactions.length} transactions`);
    
    if (transactions.length > 0) {
      console.log('📋 Sample input transactions (first 3):');
      transactions.slice(0, 3).forEach((tx, idx) => {
        console.log(`  Input ${idx + 1}:`, {
          date: tx.date,
          amount: tx.amount,
          description: tx.description,
          account: tx.account,
          type: tx.type,
          category: tx.category
        });
      });
    }
    
    // Lightweight deduplication: skip any incoming transaction that exactly matches
    // an existing one by date, amount, description, account, and type.
    if (this.transactions.length > 0 && transactions.length > 0) {
      console.log('🔍 Running deduplication check...');
      
      const existingKeys = new Set(
        this.transactions.map(t => `${new Date(t.date).getTime()}|${t.amount}|${t.description}|${t.account}|${t.type}`)
      );
      
      console.log(`📊 Existing unique keys: ${existingKeys.size}`);
      console.log('📋 Sample existing keys (first 5):');
      Array.from(existingKeys).slice(0, 5).forEach((key, idx) => {
        console.log(`  Existing ${idx + 1}: ${key}`);
      });
      
      const before = transactions.length;
      
      // Log what we're checking against
      console.log('🔍 Checking incoming transactions for duplicates...');
      const incomingKeys = transactions.map(t => `${new Date(t.date).getTime()}|${t.amount}|${t.description}|${t.account}|${t.type}`);
      console.log('📋 Sample incoming keys (first 5):');
      incomingKeys.slice(0, 5).forEach((key, idx) => {
        console.log(`  Incoming ${idx + 1}: ${key}`);
      });
      
      transactions = transactions.filter(t => {
        const key = `${new Date(t.date).getTime()}|${t.amount}|${t.description}|${t.account}|${t.type}`;
        const isDuplicate = existingKeys.has(key);
        if (isDuplicate) {
          console.log(`❌ DUPLICATE FOUND: ${key}`);
        }
        return !isDuplicate;
      });
      const skipped = before - transactions.length;
      if (skipped > 0) {
        console.log(`📊 Skipped ${skipped} duplicate transaction(s) during bulk add`);
      }
      console.log(`📊 Deduplication results: ${before} -> ${transactions.length} (${skipped} duplicates filtered out)`);
    } else {
      console.log('⚡ Skipping deduplication (no existing transactions or no new transactions)');
    }
    
    const now = new Date();
    console.log(`📊 Creating ${transactions.length} new transaction objects with IDs...`);
    
    const newTransactions = transactions.map((transaction, idx) => {
      const newTx = {
        ...transaction,
        id: uuidv4(),
        addedDate: now,
        lastModifiedDate: now,
      };
      console.log(`  Created transaction ${idx + 1}: ID=${newTx.id}, Amount=${newTx.amount}, Desc="${newTx.description}"`);
      return newTx;
    });
    
    console.log(`✅ Created ${newTransactions.length} new transaction objects`);
    
    console.log('📊 Adding transactions to in-memory store...');
    this.transactions.push(...newTransactions);

    // Set flag to indicate anomaly detection needs to be re-run
    if (newTransactions.length > 0) {
      this.needsAnomalyDetection = true;
    }

    console.log(`📊 Total transactions now: ${this.transactions.length}`);
    
    console.log('💾 Saving to IndexedDB...');

    console.log(`DataService: Total transactions now: ${this.transactions.length}`);
    
    // Attempt automatic transfer matching for new transactions
    const hasNewTransfers = newTransactions.some(tx => tx.type === 'transfer');
    if (hasNewTransfers) {
      console.log(`DataService: Attempting automatic transfer matching for new transactions`);
      try {
        // Run automatic matching on all transactions to find matches with the newly added ones
        this.transactions = await transferMatchingService.autoMatchTransfers(this.transactions);
      } catch (error) {
        console.warn('DataService: Automatic transfer matching failed:', error);
      }
    }
    

    try {
      await this.saveToDB();
      console.log('✅ Saved to IndexedDB successfully');
    } catch (error) {
      console.error('❌ Failed to save transactions to IndexedDB:', error);
      // Database transaction rolled back, so reload from DB to restore consistent state
      await this.loadFromDB();
      throw new Error(`Failed to save transactions to database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
    
    console.log('🎉 DataService.addTransactions COMPLETE');
    console.log(`📊 Final result: ${newTransactions.length} transactions added`);
    
    return newTransactions;
  }

  // Public utility: scan and remove exact duplicates from existing data
  async cleanupExactDuplicates(): Promise<{ removed: number; totalBefore: number; totalAfter: number }> {
    await this.ensureInitialized();
    const totalBefore = this.transactions.length;
    const removed = await this.dedupeExistingTransactions();
    const totalAfter = this.transactions.length;
    return { removed, totalBefore, totalAfter };
  }

  // One-time cleanup: remove exact duplicates already persisted in IndexedDB
  // Uses the same strict key as bulk-add dedup to avoid false positives
  private async dedupeExistingTransactions(): Promise<number> {
    // Build a set of seen composite keys and collect duplicate IDs to remove
    const seen = new Set<string>();
    const dupIds: string[] = [];
    for (const t of this.transactions) {
      const key = `${new Date(t.date).getTime()}|${t.amount}|${t.description}|${t.account}|${t.type}`;
      if (seen.has(key)) {
        dupIds.push(t.id);
      } else {
        seen.add(key);
      }
    }
    if (dupIds.length === 0) return 0;

    // Remove duplicates via existing helper to keep memory and DB in sync
    const removedCount = await this.deleteTransactions(dupIds);
    return removedCount;
  }

  async updateTransaction(id: string, updates: Partial<Transaction>, note?: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return null;
    
    const current = this.transactions[index];
    
    // Add current state to undo stack before making changes
    this.addToUndoStack(id, { ...current });
    
    // Clear redo stack when making a new change
    this.clearRedoStack(id);
    
    // Record a snapshot of the current transaction before updating (persistent history)
    await this.addHistorySnapshot(current.id, current, note);

    // Check if category or subcategory is being changed - if so, remove AI confidence
    const isCategoryChange = ('category' in updates && updates.category !== current.category) ||
                            ('subcategory' in updates && updates.subcategory !== current.subcategory);
    
    let finalUpdates = { ...updates };
    if (isCategoryChange) {
      // Remove AI confidence fields when user manually changes category
      finalUpdates = {
        ...finalUpdates,
        confidence: undefined,
        reasoning: undefined,
        aiProxyMetadata: undefined
      };
    }

    // Handle transaction type changes when category changes to/from "Internal Transfer"
    if ('category' in updates && updates.category !== current.category) {
      const oldCategory = current.category;
      const newCategory = updates.category;
      
      // Case 1: Changing TO "Internal Transfer" - should become type "transfer"
      if (newCategory === 'Internal Transfer' && oldCategory !== 'Internal Transfer') {
        finalUpdates.type = 'transfer';
      }
      // Case 2: Changing FROM "Internal Transfer" to something else - determine appropriate type
      else if (oldCategory === 'Internal Transfer' && newCategory !== 'Internal Transfer') {
        // Determine the appropriate type based on the transaction amount
        // Negative amounts are typically expenses, positive amounts are typically income
        finalUpdates.type = current.amount < 0 ? 'expense' : 'income';
      }
    }

    this.transactions[index] = {
      ...current,
      ...finalUpdates,
      lastModifiedDate: new Date(),
    };
    
    await this.saveToDB();
    return this.transactions[index];
  }

  /**
   * Batch update multiple transactions efficiently with a single database save
   * @param updates Array of {id, updates, note} objects
   * @param options Optional configuration for batch operation
   * @returns Array of updated transactions
   */
  async batchUpdateTransactions(updates: Array<{
    id: string;
    updates: Partial<Transaction>;
    note?: string;
  }>, options?: {
    skipHistory?: boolean; // Skip individual history snapshots for performance
  }): Promise<Transaction[]> {
    await this.ensureInitialized();
    
    const updatedTransactions: Transaction[] = [];
    const skipHistory = options?.skipHistory || false;
    
    // Process all updates in memory first
    for (const update of updates) {
      const index = this.transactions.findIndex(t => t.id === update.id);
      if (index === -1) continue;
      
      const current = this.transactions[index];
      
      // Add current state to undo stack before making changes
      this.addToUndoStack(update.id, { ...current });
      
      // Clear redo stack when making a new change
      this.clearRedoStack(update.id);
      
      // Record a snapshot of the current transaction before updating (persistent history)
      // Skip for batch operations to improve performance
      if (!skipHistory) {
        await this.addHistorySnapshot(current.id, current, update.note);
      }

      // Check if category or subcategory is being changed - if so, remove AI confidence
      const isCategoryChange = ('category' in update.updates && update.updates.category !== current.category) ||
                              ('subcategory' in update.updates && update.updates.subcategory !== current.subcategory);
      
      let finalUpdates = { ...update.updates };
      if (isCategoryChange) {
        // Remove AI confidence fields when user manually changes category
        finalUpdates = {
          ...finalUpdates,
          confidence: undefined,
          reasoning: undefined,
          aiProxyMetadata: undefined
        };
      }

      // Handle transaction type changes when category changes to/from "Internal Transfer"
      if ('category' in update.updates && update.updates.category !== current.category) {
        const oldCategory = current.category;
        const newCategory = update.updates.category;
        
        // Case 1: Changing TO "Internal Transfer" - should become type "transfer"
        if (newCategory === 'Internal Transfer' && oldCategory !== 'Internal Transfer') {
          finalUpdates.type = 'transfer';
        }
        // Case 2: Changing FROM "Internal Transfer" to something else - determine appropriate type
        else if (oldCategory === 'Internal Transfer' && newCategory !== 'Internal Transfer') {
          // Determine the appropriate type based on the transaction amount
          // Negative amounts are typically expenses, positive amounts are typically income
          finalUpdates.type = current.amount < 0 ? 'expense' : 'income';
        }
      }

      this.transactions[index] = {
        ...current,
        ...finalUpdates,
        lastModifiedDate: new Date(),
      };
      
      updatedTransactions.push(this.transactions[index]);
    }
    
    // Save to database only once after all updates
    if (updatedTransactions.length > 0) {
      await this.saveToDB();
      
      // Add a single batch history entry if we skipped individual histories
      if (skipHistory && updates.length > 0) {
        const batchNote = `Batch update: ${updates.length} transactions - ${updates[0]?.note || 'Category rule applied'}`;
        // Create a batch history entry - just use the first transaction as reference
        const firstUpdate = updates[0];
        if (firstUpdate) {
          await this.addHistorySnapshot(firstUpdate.id, updatedTransactions[0], batchNote);
        }
      }
    }
    
    return updatedTransactions;
  }

  async deleteTransaction(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const index = this.transactions.findIndex(t => t.id === id);
    if (index === -1) return false;

    // Remove transaction from in-memory array
    this.transactions.splice(index, 1);
    
    // Clean up associated history records from memory
    if (this.history[id]) {
      delete this.history[id];
    }
    
    // Clean up undo/redo stacks from memory
    if (this.undoStacks[id]) {
      delete this.undoStacks[id];
    }
    if (this.redoStacks[id]) {
      delete this.redoStacks[id];
    }
    
    // Clean up history records from IndexedDB
    try {
      await db.transactionHistory.where('transactionId').equals(id).delete();
    } catch (error) {
      console.warn(`Failed to delete history records for transaction ${id}:`, error);
    }
    
    await this.saveToDB();
    return true;
  }

  async deleteTransactions(ids: string[]): Promise<number> {
    await this.ensureInitialized();
    const initialLength = this.transactions.length;
    this.transactions = this.transactions.filter(t => !ids.includes(t.id));
    const deletedCount = initialLength - this.transactions.length;
    
    if (deletedCount > 0) {
      // Clean up associated history records from memory for all deleted transactions
      for (const id of ids) {
        if (this.history[id]) {
          delete this.history[id];
        }
        
        // Clean up undo/redo stacks from memory
        if (this.undoStacks[id]) {
          delete this.undoStacks[id];
        }
        if (this.redoStacks[id]) {
          delete this.redoStacks[id];
        }
      }
      
      // Clean up history records from IndexedDB for all deleted transactions
      try {
        await db.transactionHistory.where('transactionId').anyOf(ids).delete();
      } catch (error) {
        console.warn(`Failed to delete history records for transactions ${ids.join(', ')}:`, error);
      }
      
      try {
        await this.saveToDB();
      } catch (error) {
        console.error('❌ Failed to save after deleting transactions:', error);
        // Transaction deletions are already applied in memory, but we should warn users
        // about potential inconsistency between in-memory and persistent storage
        console.warn('⚠️ Transactions deleted from memory but may still exist in database due to save failure');
        // Don't re-throw here because the delete operation was successful in memory
      }
    }
    
    return deletedCount;
  }

  // Query operations
  async getTransactionsByDateRange(startDate: Date, endDate: Date): Promise<Transaction[]> {
    await this.ensureInitialized();
    return this.transactions.filter(t => 
      t.date >= startDate && t.date <= endDate
    );
  }

  async getTransactionsByCategory(category: string, subcategory?: string): Promise<Transaction[]> {
    await this.ensureInitialized();
    return this.transactions.filter(t => 
      t.category === category && 
      (subcategory === undefined || t.subcategory === subcategory)
    );
  }

  async getUniqueCategories(): Promise<string[]> {
    await this.ensureInitialized();
    const uniqueCategories = Array.from(new Set(this.transactions.map(t => t.category)))
      .filter(category => category && category.trim() !== '')
      .sort();
    return uniqueCategories;
  }

  async getUniqueAccounts(): Promise<string[]> {
    await this.ensureInitialized();
    const uniqueAccounts = Array.from(new Set(this.transactions.map(t => t.account)))
      .filter(account => account && account.trim() !== '')
      .sort();
    return uniqueAccounts;
  }

  async searchTransactions(query: string): Promise<Transaction[]> {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      transactions: this.transactions,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  async exportToCSV(): Promise<string> {
    await this.ensureInitialized();
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
  private async loadFromDB(): Promise<void> {
    try {
      // Load transactions from IndexedDB
      this.transactions = await db.transactions.orderBy('date').toArray();
      
      // Load history from IndexedDB and convert to the expected format
      const historyEntries = await db.transactionHistory.toArray();
      this.history = {};
      
      historyEntries.forEach(entry => {
        if (!this.history[entry.transactionId]) {
          this.history[entry.transactionId] = [];
        }
        this.history[entry.transactionId].push({
          id: entry.id,
          timestamp: entry.timestamp,
          data: entry.data,
          note: entry.note
        });
      });
      
      // Defer transfer auto-matching until after first paint
      if (this.transactions.length > 0) {
        this.deferTransferAutoMatching();
      }
      
      if (process.env.NODE_ENV !== 'test') {
        console.log(`Loaded ${this.transactions.length} transactions and ${historyEntries.length} history entries from IndexedDB`);
      }
    } catch (error) {
      console.error('Failed to load transactions from IndexedDB:', error);
      this.transactions = [];
      this.history = {};
    }
  }

  /**
   * Data migration to fix transactions with 'Internal Transfer' category but incorrect type
   * This ensures all Internal Transfer transactions have type='transfer'
   */
  private async migrateInternalTransferTypes(): Promise<{ fixed: number; errors: string[] }> {
    const __IS_TEST__ = process.env.NODE_ENV === 'test';
    const txLog = (...args: any[]) => { if (!__IS_TEST__) console.log(...args); };
    
    let fixedCount = 0;
    const errors: string[] = [];
    
    try {
      txLog('[TX] Checking for Internal Transfer transactions with incorrect type...');
      
      // Find transactions with 'Internal Transfer' category but type != 'transfer'
      const transactionsToFix = this.transactions.filter(transaction => 
        transaction.category === 'Internal Transfer' && transaction.type !== 'transfer'
      );
      
      if (transactionsToFix.length === 0) {
        txLog('[TX] No Internal Transfer type mismatches found');
        return { fixed: 0, errors: [] };
      }
      
      txLog(`[TX] Found ${transactionsToFix.length} Internal Transfer transactions with incorrect type`);
      
      // Fix each transaction
      for (const transaction of transactionsToFix) {
        try {
          const oldType = transaction.type;
          transaction.type = 'transfer';
          transaction.lastModifiedDate = new Date();
          
          // Add a history entry for this automatic fix
          await this.addHistorySnapshot(
            transaction.id, 
            { ...transaction, type: oldType }, // Record the old state
            `Automatic fix: Changed type from '${oldType}' to 'transfer' for Internal Transfer category`
          );
          
          fixedCount++;
          txLog(`[TX] Fixed transaction ${transaction.id}: ${oldType} -> transfer`);
        } catch (error) {
          const errorMsg = `Failed to fix transaction ${transaction.id}: ${error}`;
          errors.push(errorMsg);
          txLog(`[TX] ${errorMsg}`);
        }
      }
      
      // Save the fixed transactions
      if (fixedCount > 0) {
        await this.saveToDB();
        txLog(`[TX] Successfully fixed ${fixedCount} Internal Transfer transactions`);
      }
      
    } catch (error) {
      const errorMsg = `Internal Transfer type migration failed: ${error}`;
      errors.push(errorMsg);
      txLog(`[TX] ${errorMsg}`);
    }
    
    return { fixed: fixedCount, errors };
  }

  private async saveToDB(): Promise<void> {
    try {
      // Use atomic database transaction to prevent data loss
      // This ensures either both clear and repopulate succeed, or neither happens
      await db.transaction('rw', [db.transactions], async () => {
        // Clear all existing transactions
        await db.transactions.clear();
        
        if (this.transactions.length > 0) {
          // Use robust bulk operation with fallback to add current transactions
          const results = await db.robustBulkPut(db.transactions, this.transactions);
          
          if (results.failed > 0) {
            console.warn(`[TX] Save operation had issues: ${results.successful} successful, ${results.failed} failed`);
            results.errors.forEach(error => console.warn(`[TX] ${error}`));
            
            // If we have significant failures, throw to rollback the transaction
            if (results.failed > results.successful) {
              throw new Error(`Too many save failures: ${results.failed}/${this.transactions.length} failed`);
            }
          } else {
            console.log(`[TX] Successfully saved ${results.successful} transactions to IndexedDB`);
          }
        } else {
          console.log(`[TX] Successfully cleared all transactions from IndexedDB`);
        }
      });

      // Notify backup service about data changes (but don't await to avoid blocking saves)
      this.notifyBackupService();

    } catch (error) {
      console.error('[TX] Failed to save transactions to IndexedDB:', error);
      // The transaction will automatically rollback, preserving existing data
      throw error; // Re-throw to let callers know save failed
    }
  }

  private notifyBackupService(): void {
    // Use dynamic import and handle potential errors gracefully
    import('./backupService')
      .then(({ backupService }) => {
        backupService.notifyDataChange();
      })
      .catch(error => {
        // Don't log in tests to avoid noise
        if (process.env.NODE_ENV !== 'test') {
          console.warn('[TX] Failed to notify backup service:', error);
        }
      });
  }

  private async addHistorySnapshot(transactionId: string, snapshot: Transaction, note?: string): Promise<void> {
    const entry: TransactionHistoryEntry = {
      id: uuidv4(),
      transactionId,
      timestamp: new Date().toISOString(),
      data: { ...snapshot },
      note,
    };
    
    // Add to IndexedDB
    await db.addHistoryEntry(entry);
    
    // Also update local cache
    if (!this.history[transactionId]) {
      this.history[transactionId] = [];
    }
    this.history[transactionId].push({
      id: entry.id,
      timestamp: entry.timestamp,
      data: entry.data,
      note: entry.note
    });
  }

  async getTransactionHistory(transactionId: string): Promise<Array<{ id: string; timestamp: string; data: Transaction; note?: string }>> {
    await this.ensureInitialized();
    // Get fresh data from IndexedDB to ensure consistency
    const historyEntries = await db.getTransactionHistory(transactionId);
    return historyEntries.map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      data: entry.data,
      note: entry.note
    }));
  }

  async restoreTransactionVersion(transactionId: string, versionId: string, note?: string): Promise<Transaction | null> {
    await this.ensureInitialized();
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    
    const versions = await this.getTransactionHistory(transactionId);
    const version = versions.find(v => v.id === versionId);
    if (!version) return null;

    // Snapshot current before restoring
    const current = this.transactions[index];
    await this.addHistorySnapshot(transactionId, current, note ? `Before restore: ${note}` : 'Auto-snapshot before restore');

    // Restore
    const restored: Transaction = {
      ...version.data,
      id: transactionId, // ensure id remains the same
      lastModifiedDate: new Date(),
    };
    this.transactions[index] = restored;
    await this.saveToDB();
    return restored;
  }

  // Utility methods
  async getStats(): Promise<{
    total: number;
    totalIncome: number;
    totalExpenses: number;
    categories: { [category: string]: number };
  }> {
    await this.ensureInitialized();
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
    await this.ensureInitialized();
    this.transactions = [];
    this.history = {};
    this.undoStacks = {};
    this.redoStacks = {};
    if (!db.isOpen()) {
      try { await db.open(); } catch {}
    }
    await db.clearAll();
  }

  // Anomaly detection methods
  async detectAnomalies(): Promise<void> {
    await this.ensureInitialized();
    for (const transaction of this.transactions) {
      const anomalyInfo = this.calculateAnomalyScore(transaction);
      
      if (anomalyInfo.isAnomaly) {
        transaction.isAnomaly = true;
        transaction.anomalyType = anomalyInfo.type;
        transaction.anomalyScore = anomalyInfo.score;
        transaction.historicalAverage = anomalyInfo.historicalAverage;
      }
    }
    await this.saveToDB();
    
    // Clear flag after anomaly detection is complete
    this.needsAnomalyDetection = false;
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
    await this.ensureInitialized();
    return this.transactions.filter(t => t.isAnomaly === true);
  }

  // Duplicate detection
  async detectDuplicates(newTransactions: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>[], config?: DuplicateDetectionConfig): Promise<DuplicateDetectionResult> {
    await this.ensureInitialized();
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

  async findExistingDuplicates(config?: DuplicateDetectionConfig): Promise<DuplicateTransaction[]> {
    await this.ensureInitialized();

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
    const processedIds = new Set<string>(); // Track processed transactions to avoid duplicate pairs

    for (let i = 0; i < this.transactions.length; i++) {
      const transaction = this.transactions[i];
      if (processedIds.has(transaction.id)) continue;

      for (let j = i + 1; j < this.transactions.length; j++) {
        const otherTransaction = this.transactions[j];
        if (processedIds.has(otherTransaction.id)) continue;

        const matchInfo = this.calculateTransactionSimilarity(transaction, otherTransaction, finalConfig);
        if (matchInfo.similarity >= 0.8) { // 80% similarity threshold for duplicates
          duplicates.push({
            existingTransaction: transaction,
            newTransaction: otherTransaction,
            matchFields: matchInfo.matchFields,
            similarity: matchInfo.similarity,
            amountDifference: matchInfo.amountDifference,
            daysDifference: matchInfo.daysDifference,
            matchType: matchInfo.matchType
          });

          // Mark the "newer" transaction (otherTransaction) as processed so it's not compared again
          processedIds.add(otherTransaction.id);
        }
      }
    }

    return duplicates;
  }

  async removeDuplicateTransactions(duplicateIds: string[]): Promise<{ removed: number; errors: string[] }> {
    await this.ensureInitialized();
    const errors: string[] = [];
    let removed = 0;

    for (const id of duplicateIds) {
      try {
        const deleted = await this.deleteTransaction(id);
        if (deleted) {
          removed++;
        } else {
          errors.push(`Transaction with ID ${id} not found`);
        }
      } catch (error) {
        console.error(`Error deleting transaction ${id}:`, error);
        errors.push(`Failed to delete transaction ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return { removed, errors };
  }

  // Category rules management - delegated to rulesService
  async getAllCategoryRules(): Promise<CategoryRule[]> {
    return await rulesService.getAllRules();
  }

  async addCategoryRule(rule: Omit<CategoryRule, 'id' | 'createdDate' | 'lastModifiedDate'>): Promise<CategoryRule> {
    return await rulesService.addRule(rule);
  }

  async updateCategoryRule(id: string, updates: Partial<CategoryRule>): Promise<CategoryRule | null> {
    return await rulesService.updateRule(id, updates);
  }

  async deleteCategoryRule(id: string): Promise<boolean> {
    return await rulesService.deleteRule(id);
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

  private calculateTransactionSimilarity(existing: Transaction, newTransaction: Transaction | Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>, config: DuplicateDetectionConfig): {
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

  // In-memory undo/redo functionality for fast operations during active editing
  private addToUndoStack(transactionId: string, transactionState: Transaction): void {
    if (!this.undoStacks[transactionId]) {
      this.undoStacks[transactionId] = [];
    }
    
    this.undoStacks[transactionId].push({ ...transactionState });
    
    // Limit stack size to prevent memory issues
    if (this.undoStacks[transactionId].length > this.MAX_UNDO_STACK_SIZE) {
      this.undoStacks[transactionId].shift(); // Remove oldest entry
    }
  }
  
  private addToRedoStack(transactionId: string, transactionState: Transaction): void {
    if (!this.redoStacks[transactionId]) {
      this.redoStacks[transactionId] = [];
    }
    
    this.redoStacks[transactionId].push({ ...transactionState });
    
    // Limit stack size to prevent memory issues
    if (this.redoStacks[transactionId].length > this.MAX_UNDO_STACK_SIZE) {
      this.redoStacks[transactionId].shift(); // Remove oldest entry
    }
  }
  
  private clearRedoStack(transactionId: string): void {
    this.redoStacks[transactionId] = [];
  }
  
  async canUndoTransaction(transactionId: string): Promise<boolean> {
    const undoStack = this.undoStacks[transactionId] || [];
    const historyItems = this.history[transactionId] || [];
    return undoStack.length > 0 || historyItems.length > 0;
  }
  
  async canRedoTransaction(transactionId: string): Promise<boolean> {
    const redoStack = this.redoStacks[transactionId] || [];
    return redoStack.length > 0;
  }
  
  async undoTransactionEdit(transactionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    
    const current = this.transactions[index];
    const undoStack = this.undoStacks[transactionId] || [];
    
    let previousState: Transaction | null = null;
    
    // First try to get from in-memory undo stack
    if (undoStack.length > 0) {
      previousState = undoStack.pop()!;
    } else {
      // Fall back to persistent history if no in-memory undo available
      const historyItems = this.history[transactionId] || [];
      if (historyItems.length > 0) {
        // Get the most recent history item
        const sortedHistory = [...historyItems].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        previousState = sortedHistory[0].data;
      }
    }
    
    if (!previousState) return null;
    
    // Add current state to redo stack
    this.addToRedoStack(transactionId, current);
    
    // Restore previous state
    const restoredTransaction: Transaction = {
      ...previousState,
      id: transactionId, // Ensure ID remains the same
      lastModifiedDate: new Date()
    };
    
    this.transactions[index] = restoredTransaction;
    
    // Add a history snapshot for the undo operation
    await this.addHistorySnapshot(transactionId, current, note ? `Undo: ${note}` : 'Undo edit operation');
    
    await this.saveToDB();
    return restoredTransaction;
  }
  
  async redoTransactionEdit(transactionId: string, note?: string): Promise<Transaction | null> {
    const index = this.transactions.findIndex(t => t.id === transactionId);
    if (index === -1) return null;
    
    const redoStack = this.redoStacks[transactionId] || [];
    if (redoStack.length === 0) return null;
    
    const current = this.transactions[index];
    const nextState = redoStack.pop()!;
    
    // Add current state to undo stack
    this.addToUndoStack(transactionId, current);
    
    // Restore next state
    const restoredTransaction: Transaction = {
      ...nextState,
      id: transactionId, // Ensure ID remains the same
      lastModifiedDate: new Date()
    };
    
    this.transactions[index] = restoredTransaction;
    
    // Add a history snapshot for the redo operation
    await this.addHistorySnapshot(transactionId, current, note ? `Redo: ${note}` : 'Redo edit operation');
    
    await this.saveToDB();
    return restoredTransaction;
  }
  
  private deferTransferAutoMatching(): void {
    // Run transfer matching much later to avoid blocking initial UI load
    // Use setTimeout instead of requestAnimationFrame for better control
    setTimeout(async () => {
      try {
        console.log('[TX] Starting deferred transfer auto-matching...');
        const startTime = Date.now();
        
        // Set a timeout for the operation
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Transfer matching timeout')), 15000); // 15 second timeout
        });
        
        const matchingPromise = transferMatchingService.autoMatchTransfers(this.transactions);
        
        const matchedTransactions = await Promise.race([matchingPromise, timeoutPromise]) as Transaction[];
        
        const duration = Date.now() - startTime;
        console.log(`[TX] Transfer auto-matching completed in ${duration}ms`);
        
        if (matchedTransactions !== this.transactions) {
          this.transactions = matchedTransactions;
          // Only save if we finished in reasonable time and found meaningful changes
          if (duration < 10000) {
            try {
              await this.saveToDB();
              console.log('[TX] ✅ Auto-matched transfers and saved to DB');
            } catch (error) {
              console.error('[TX] ❌ Failed to save auto-matched transfers:', error);
              console.warn('[TX] ⚠️ Transfer matches applied in memory but not persisted to database');
            }
          } else {
            console.warn('[TX] Transfer matching took too long, not saving results');
          }
        }
      } catch (error) {
        console.error('[TX] Deferred transfer auto-matching failed:', error);
        // Continue with original transactions if matching fails
      }
    }, 2000); // 2 second delay to ensure UI is fully loaded first
  }

  // Get current health status
  async getHealthStatus(): Promise<DBHealthCheck | null> {
    return this.healthCheckResults;
  }

  // Create support bundle for diagnostics
  async createSupportBundle(): Promise<string> {
    await this.ensureInitialized();
    
    try {
      const supportBundle = await db.createSupportBundle();
      return supportBundle;
    } catch (error) {
      console.error('[TX] Failed to create support bundle:', error);
      throw error;
    }
  }

  // Get database statistics for logging
  async getDBStats(): Promise<{ dbCount: number; memoryCount: number; firstId?: string; lastId?: string }> {
    await this.ensureInitialized();
    
    try {
      const dbCount = await db.transactions.count();
      const memoryCount = this.transactions.length;
      const firstId = this.transactions.length > 0 ? this.transactions[0].id : undefined;
      const lastId = this.transactions.length > 0 ? this.transactions[this.transactions.length - 1].id : undefined;
      
      return { dbCount, memoryCount, firstId, lastId };
    } catch (error) {
      console.error('[TX] Failed to get DB stats:', error);
      return { dbCount: -1, memoryCount: this.transactions.length };
    }
  }

  async getUndoRedoStatus(transactionId: string): Promise<{
    canUndo: boolean;
    canRedo: boolean;
    undoStackSize: number;
    redoStackSize: number;
  }> {
    const undoStack = this.undoStacks[transactionId] || [];
    const redoStack = this.redoStacks[transactionId] || [];
    const historyItems = this.history[transactionId] || [];
    
    return {
      canUndo: undoStack.length > 0 || historyItems.length > 0,
      canRedo: redoStack.length > 0,
      undoStackSize: undoStack.length,
      redoStackSize: redoStack.length
    };
  }
}

// Create singleton instance
export const dataService = new DataService();
export default dataService;
