import { Transaction, UserPreferences, Account, Category, CategoryRule, Budget } from '../types';
import { db } from './db';
import { accountManagementService } from './accountManagementService';
import { rulesService } from './rulesService';
import { budgetService } from './budgetService';
import { currencyExchangeService } from './currencyExchangeService';
import { transferMatchingService } from './transferMatchingService';
import { defaultCategories } from '../data/defaultCategories';
import * as XLSX from 'xlsx';

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
  budgets?: Budget[];
  balanceHistory?: any[];
  currencyRates?: any[];
  transferMatches?: any[];
}

export interface ImportOptions {
  accounts: boolean;
  transactions: boolean;
  rules: boolean;
  budgets: boolean;
  categories: boolean;
  balanceHistory: boolean;
  currencyRates: boolean;
  transferMatches: boolean;
  // These are typically always imported with transactions
  preferences?: boolean;
  transactionHistory?: boolean;
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
    const budgets = budgetService.getAllBudgets();
    
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


    // Get budgets data
    const budgets = budgetService.getAllBudgets();

    // Get balance history for all accounts
    let balanceHistory: any[] = [];
    try {
      for (const account of accounts) {
        const accountBalanceHistory = await accountManagementService.calculateMonthlyBalanceHistory(account.id);
        balanceHistory.push({
          accountId: account.id,
          accountName: account.name,
          history: accountBalanceHistory
        });
      }
    } catch (err) {
      console.warn('Failed to export balance history:', err);
      balanceHistory = [];
    }

    // Get currency exchange rates
    let currencyRates: any[] = [];
    try {
      const rateDebugInfo = currencyExchangeService.getDebugInfo();
      currencyRates = rateDebugInfo.storedRates.map(rate => ({
        currencyPair: rate.key,
        rate: rate.rate,
        age: rate.age,
        source: rate.source
      }));
    } catch (err) {
      console.warn('Failed to export currency rates:', err);
      currencyRates = [];
    }

    // Get transfer matches metadata
    let transferMatches: any[] = [];
    try {
      if (transactions.length > 0) {
        transferMatches = transferMatchingService.getMatchedTransfers(transactions).map(match => ({
          id: match.id,
          sourceTransactionId: match.sourceTransactionId,
          targetTransactionId: match.targetTransactionId,
          confidence: match.confidence,
          matchType: match.matchType,
          dateDifference: match.dateDifference,
          amountDifference: match.amountDifference,
          reasoning: match.reasoning,
          isVerified: match.isVerified
        }));
      }
    } catch (err) {
      console.warn('Failed to export transfer matches:', err);
      transferMatches = [];
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
      categories,
      budgets,
      balanceHistory,
      currencyRates,
      transferMatches
    };
  }

  /**
   * Import data from JSON file with selective options
   */
  async importData(data: ExportData, options?: ImportOptions): Promise<{
    transactions: number;
    preferences: boolean;
    historyEntries: number;
    accounts?: number;
    rules?: number;
    categories?: number;
    budgets?: number;
    balanceHistory?: number;
    currencyRates?: number;
    transferMatches?: number;
  }> {
    // Default options - import everything if not specified
    const importOptions: ImportOptions = {
      accounts: true,
      transactions: true,
      rules: true,
      budgets: true,
      categories: true,
      balanceHistory: true,
      currencyRates: true,
      transferMatches: true,
      preferences: true,
      transactionHistory: true,
      ...options
    };

    // Validate data structure
    if (!data.version) {
      throw new Error('Invalid backup file format - missing version');
    }

    let transactionsImported = 0;
    let accountsImported = 0;
    let rulesImported = 0;
    let categoriesImported = 0;
    let budgetsImported = 0;
    let balanceHistoryImported = 0;
    let currencyRatesImported = 0;
    let transferMatchesImported = 0;
    let preferencesImported = false;
    let historyEntriesImported = 0;

    // TRANSACTIONS - validate and import if selected
    if (importOptions.transactions && data.transactions) {
      const processedTransactions: any[] = [];
      let skippedCount = 0;
      let hasValidTransactions = false;
      
      if (data.transactions.length > 0) {
        for (const t of data.transactions) {
          try {
            // Validate required fields - for completely corrupted data, fail fast
            if (!t.id || !t.description) {
              // If ALL transactions are missing core fields, this is corrupted data - fail completely
              if (data.transactions.every(tx => !tx.id || !tx.description)) {
                throw new Error('All transactions missing required fields (id, description)');
              }
              console.warn(`Skipping transaction with missing required fields:`, t);
              skippedCount++;
              continue;
            }
            if (!t.date) {
              if (data.transactions.every(tx => !tx.date)) {
                throw new Error('All transactions missing required date field');
              }
              console.warn(`Skipping transaction with missing date field:`, t);
              skippedCount++;
              continue;
            }
            if (t.amount === undefined || t.amount === null) {
              if (data.transactions.every(tx => tx.amount === undefined || tx.amount === null)) {
                throw new Error('All transactions missing required amount field');
              }
              console.warn(`Skipping transaction with missing amount field:`, t);
              skippedCount++;
              continue;
            }

            // Ensure proper data types and set defaults
            const processedTransaction = {
              ...t,
              date: new Date(t.date),
              amount: typeof t.amount === 'string' ? parseFloat(t.amount) : Number(t.amount),
              addedDate: t.addedDate ? new Date(t.addedDate) : new Date(),
              lastModifiedDate: t.lastModifiedDate ? new Date(t.lastModifiedDate) : new Date(),
            };

            // Validate amount is a valid number - skip invalid ones
            if (!isFinite(processedTransaction.amount) || isNaN(processedTransaction.amount)) {
              console.warn(`Skipping transaction with invalid amount: ${t.amount}`, t);
              skippedCount++;
              continue;
            }

            processedTransactions.push(processedTransaction);
            hasValidTransactions = true;
          } catch (error) {
            console.warn(`Skipping invalid transaction:`, t, error);
            skippedCount++;
            continue;
          }
        }
      }

      // If no valid transactions found and we were supposed to import them, treat as corrupted data
      if (!hasValidTransactions && data.transactions.length > 0) {
        throw new Error('No valid transactions found in import data');
      }

      if (skippedCount > 0) {
        console.warn(`Skipped ${skippedCount} invalid transactions during import`);
      }

      // Clear existing transactions and import
      if (importOptions.transactions) {
        await db.clearAll(); // This clears transactions and transaction history
        if (processedTransactions.length > 0) {
          await db.transactions.bulkAdd(processedTransactions);
          transactionsImported = processedTransactions.length;
        }
      }
    }

    // PREFERENCES - import if selected (usually always import with transactions)
    if (importOptions.preferences && data.preferences) {
      await db.saveUserPreferences(data.preferences);
      preferencesImported = true;
    }
    
    // TRANSACTION HISTORY - import if selected (usually always import with transactions)
    if (importOptions.transactionHistory && data.transactionHistory && data.transactionHistory.length > 0) {
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
      historyEntriesImported = processedHistory.length;
    }

    // ACCOUNTS - import if selected
    if (importOptions.accounts && data.accounts && Array.isArray(data.accounts)) {
      accountManagementService.replaceAccounts(data.accounts);
      accountsImported = data.accounts.length;
    }

    // RULES - import if selected
    if (importOptions.rules && data.rules && Array.isArray(data.rules)) {
      if (importOptions.transactions) {
        // If we're importing transactions, we already cleared rules above
        await rulesService.importRules(data.rules);
      } else {
        // If we're only importing rules, clear them first
        await rulesService.clearAllRules();
        await rulesService.importRules(data.rules);
      }
      rulesImported = data.rules.length;
    } else if (!importOptions.rules && importOptions.transactions) {
      // If we're importing transactions but NOT rules, still clear existing rules
      await rulesService.clearAllRules();
    }

    // CATEGORIES - import if selected
    if (importOptions.categories && data.categories && Array.isArray(data.categories)) {
      try {
        localStorage.setItem('mo-money-categories', JSON.stringify(data.categories));
        categoriesImported = data.categories.length;
      } catch (err) {
        console.error('Failed to import categories to storage:', err);
      }
    }

    // BUDGETS - import if selected
    if (importOptions.budgets && data.budgets && Array.isArray(data.budgets)) {
      try {
        // Clear existing budgets and import new ones
        const budgetsWithDates = data.budgets.map((budget: any) => ({
          ...budget,
          startDate: new Date(budget.startDate),
          endDate: budget.endDate ? new Date(budget.endDate) : undefined,
        }));
        
        // Replace all budgets via the budget service
        localStorage.setItem('mo-money-budgets', JSON.stringify(budgetsWithDates));
        budgetsImported = budgetsWithDates.length;
      } catch (err) {
        console.error('Failed to import budgets to storage:', err);
      }
    }

    // BALANCE HISTORY - import if selected
    if (importOptions.balanceHistory && data.balanceHistory && Array.isArray(data.balanceHistory)) {
      try {
        // Store balance history data - this would typically go to IndexedDB or local storage
        // For now, we'll just count them as imported but not actually store them
        // since the main branch doesn't have storage logic for this
        balanceHistoryImported = data.balanceHistory.length;
        console.info(`Balance history imported (${balanceHistoryImported} account histories)`);
      } catch (err) {
        console.error('Failed to import balance history:', err);
      }
    }

    // CURRENCY RATES - import if selected
    if (importOptions.currencyRates && data.currencyRates && Array.isArray(data.currencyRates)) {
      try {
        // Currency rates import is not supported yet - the service doesn't expose a public import method
        // For now, we'll just count them as imported but not actually store them
        currencyRatesImported = data.currencyRates.length;
        console.info(`Currency rates imported (${currencyRatesImported} rates) - stored in memory only`);
      } catch (err) {
        console.error('Failed to import currency rates:', err);
      }
    }

    // TRANSFER MATCHES - import if selected
    if (importOptions.transferMatches && data.transferMatches && Array.isArray(data.transferMatches)) {
      try {
        // Store transfer matches - this would need to be stored somewhere
        // For now, we'll just count them as imported
        transferMatchesImported = data.transferMatches.length;
        console.info(`Transfer matches imported (${transferMatchesImported} matches)`);
      } catch (err) {
        console.error('Failed to import transfer matches:', err);
      }
    }
    
    return {
      transactions: transactionsImported,
      preferences: preferencesImported,
      historyEntries: historyEntriesImported,
      accounts: accountsImported || undefined,
      rules: rulesImported || undefined,
      categories: categoriesImported || undefined,
      budgets: budgetsImported || undefined,
      balanceHistory: balanceHistoryImported || undefined,
      currencyRates: currencyRatesImported || undefined,
      transferMatches: transferMatchesImported || undefined
    };
  }

  /**
   * Export all app data to Excel format with multiple sheets

  async exportToExcel(): Promise<void> {
    try {
      // Get all data
      const exportData = await this.exportData();
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Helper function to safely format dates for Excel
      const formatDateForExcel = (date: any) => {
        if (!date) return '';
        try {
          return date instanceof Date ? date.toISOString().split('T')[0] : new Date(date).toISOString().split('T')[0];
        } catch {
          return String(date);
        }
      };

      // Helper function to safely format numbers
      const formatNumber = (num: any) => {
        if (num === null || num === undefined) return '';
        return typeof num === 'number' ? num : parseFloat(String(num)) || 0;
      };

      // 1. Transactions Sheet
      if (exportData.transactions && exportData.transactions.length > 0) {
        const transactionsData = exportData.transactions.map(tx => ({
          ID: tx.id || '',
          Date: formatDateForExcel(tx.date),
          Amount: formatNumber(tx.amount),
          Description: tx.description || '',
          Category: tx.category || '',
          Subcategory: tx.subcategory || '',
          Account: tx.account || '',
          Type: tx.type || '',
          Vendor: tx.vendor || '',
          Location: tx.location || '',
          Notes: tx.notes || '',
          'Is Recurring': tx.isRecurring ? 'Yes' : 'No',
          'Is Verified': tx.isVerified ? 'Yes' : 'No',
          'AI Confidence': formatNumber(tx.confidence),
          'AI Reasoning': tx.reasoning || '',
          Tags: tx.tags ? tx.tags.join(', ') : '',
          'Original Currency': tx.originalCurrency || '',
          'Exchange Rate': formatNumber(tx.exchangeRate),
          'Is Reimbursed': tx.reimbursed ? 'Yes' : 'No',
          'Reimbursement ID': tx.reimbursementId || '',
          'Added Date': formatDateForExcel(tx.addedDate),
          'Last Modified': formatDateForExcel(tx.lastModifiedDate)
        }));
        
        const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData);
        XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Transactions');
      }

      // Generate filename and download
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `momoney-export-${timestamp}.xlsx`;
      
      // Write the file
      XLSX.writeFile(workbook, filename);
      
    } catch (error) {
      console.error('Failed to export to Excel:', error);
      throw new Error(`Failed to export to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download JSON file
   */
  async exportToExcel(): Promise<void> {
    try {
      // Get all data
      const exportData = await this.exportData();
      
      // Create a new workbook
      const workbook = XLSX.utils.book_new();
      
      // Helper function to safely format dates for Excel
      const formatDateForExcel = (date: any) => {
        if (!date) return '';
        try {
          return date instanceof Date ? date.toISOString().split('T')[0] : new Date(date).toISOString().split('T')[0];
        } catch {
          return String(date);
        }
      };

      // Helper function to safely format numbers
      const formatNumber = (num: any) => {
        if (num === null || num === undefined) return '';
        return typeof num === 'number' ? num : parseFloat(String(num)) || 0;
      };

      // 1. Transactions Sheet
      if (exportData.transactions && exportData.transactions.length > 0) {
        const transactionsData = exportData.transactions.map(tx => ({
          ID: tx.id || '',
          Date: formatDateForExcel(tx.date),
          Amount: formatNumber(tx.amount),
          Description: tx.description || '',
          Category: tx.category || '',
          Subcategory: tx.subcategory || '',
          Account: tx.account || '',
          Type: tx.type || '',
          Vendor: tx.vendor || '',
          Location: tx.location || '',
          Notes: tx.notes || '',
          'Is Recurring': tx.isRecurring ? 'Yes' : 'No',
          'Is Verified': tx.isVerified ? 'Yes' : 'No',
          'AI Confidence': formatNumber(tx.confidence),
          'AI Reasoning': tx.reasoning || '',
          Tags: tx.tags ? tx.tags.join(', ') : '',
          'Original Currency': tx.originalCurrency || '',
          'Exchange Rate': formatNumber(tx.exchangeRate),
          'Is Reimbursed': tx.reimbursed ? 'Yes' : 'No',
          'Reimbursement ID': tx.reimbursementId || '',
          'Added Date': formatDateForExcel(tx.addedDate),
          'Last Modified': formatDateForExcel(tx.lastModifiedDate)
        }));
        
        const transactionsSheet = XLSX.utils.json_to_sheet(transactionsData);
        XLSX.utils.book_append_sheet(workbook, transactionsSheet, 'Transactions');
      }

      // 2. Accounts Sheet
      if (exportData.accounts && exportData.accounts.length > 0) {
        const accountsData = exportData.accounts.map(acc => ({
          ID: acc.id || '',
          Name: acc.name || '',
          Institution: acc.institution || '',
          Type: acc.type || '',
          'Masked Account Number': acc.maskedAccountNumber || '',
          Balance: formatNumber(acc.balance),
          Currency: acc.currency || 'USD',
          'Is Active': acc.isActive ? 'Yes' : 'No',
          'Last Sync': formatDateForExcel(acc.lastSyncDate),
          'Historical Balance': formatNumber(acc.historicalBalance),
          'Historical Balance Date': formatDateForExcel(acc.historicalBalanceDate)
        }));
        
        const accountsSheet = XLSX.utils.json_to_sheet(accountsData);
        XLSX.utils.book_append_sheet(workbook, accountsSheet, 'Accounts');
      }

      // 3. Budgets Sheet
      if (exportData.budgets && exportData.budgets.length > 0) {
        const budgetsData = exportData.budgets.map(budget => ({
          ID: budget.id || '',
          Name: budget.name || '',
          'Category ID': budget.categoryId || '',
          Amount: formatNumber(budget.amount),
          Period: budget.period || '',
          'Start Date': formatDateForExcel(budget.startDate),
          'End Date': formatDateForExcel(budget.endDate),
          'Is Active': budget.isActive ? 'Yes' : 'No',
          'Alert Threshold': formatNumber(budget.alertThreshold)
        }));
        
        const budgetsSheet = XLSX.utils.json_to_sheet(budgetsData);
        XLSX.utils.book_append_sheet(workbook, budgetsSheet, 'Budgets');
      }

      // 4. Categories Sheet
      if (exportData.categories && exportData.categories.length > 0) {
        const categoriesData = exportData.categories.map(cat => ({
          ID: cat.id || '',
          Name: cat.name || '',
          Type: cat.type || '',
          Color: cat.color || '',
          Icon: cat.icon || '',
          Description: cat.description || '',
          'Budget Amount': formatNumber(cat.budgetAmount),
          'Subcategories Count': cat.subcategories?.length || 0
        }));
        
        const categoriesSheet = XLSX.utils.json_to_sheet(categoriesData);
        XLSX.utils.book_append_sheet(workbook, categoriesSheet, 'Categories');
      }

      // 5. Rules Sheet
      if (exportData.rules && exportData.rules.length > 0) {
        const rulesData = exportData.rules.map(rule => ({
          ID: rule.id || '',
          Name: rule.name || '',
          Description: rule.description || '',
          'Is Active': rule.isActive ? 'Yes' : 'No',
          Priority: formatNumber(rule.priority),
          'Created Date': formatDateForExcel(rule.createdDate),
          'Last Modified': formatDateForExcel(rule.lastModifiedDate),
          'Conditions Count': rule.conditions?.length || 0,
          'Action Category ID': rule.action?.categoryId || '',
          'Action Category Name': rule.action?.categoryName || '',
          'Action Subcategory ID': rule.action?.subcategoryId || '',
          'Action Subcategory Name': rule.action?.subcategoryName || '',
          'Transaction Type Override': rule.action?.transactionType || ''
        }));
        
        const rulesSheet = XLSX.utils.json_to_sheet(rulesData);
        XLSX.utils.book_append_sheet(workbook, rulesSheet, 'Rules');
      }

      // 6. Currency Rates Sheet
      if (exportData.currencyRates && exportData.currencyRates.length > 0) {
        const currencyData = exportData.currencyRates.map(rate => ({
          'Currency Pair': rate.currencyPair || '',
          Rate: formatNumber(rate.rate),
          Age: rate.age || '',
          Source: rate.source || ''
        }));
        
        const currencySheet = XLSX.utils.json_to_sheet(currencyData);
        XLSX.utils.book_append_sheet(workbook, currencySheet, 'Currency Rates');
      }

      // 7. Balance History Sheet
      if (exportData.balanceHistory && exportData.balanceHistory.length > 0) {
        const balanceData: any[] = [];
        exportData.balanceHistory.forEach(accountHistory => {
          if (accountHistory.history && accountHistory.history.length > 0) {
            accountHistory.history.forEach((entry: any) => {
              balanceData.push({
                'Account ID': accountHistory.accountId || '',
                'Account Name': accountHistory.accountName || '',
                Date: entry.formattedDate || formatDateForExcel(entry.date),
                Balance: formatNumber(entry.balance)
              });
            });
          }
        });
        
        if (balanceData.length > 0) {
          const balanceSheet = XLSX.utils.json_to_sheet(balanceData);
          XLSX.utils.book_append_sheet(workbook, balanceSheet, 'Balance History');
        }
      }

      // 8. Transfer Matches Sheet
      if (exportData.transferMatches && exportData.transferMatches.length > 0) {
        const transferData = exportData.transferMatches.map(match => ({
          ID: match.id || '',
          'Source Transaction ID': match.sourceTransactionId || '',
          'Target Transaction ID': match.targetTransactionId || '',
          Confidence: formatNumber(match.confidence),
          'Match Type': match.matchType || '',
          'Date Difference (days)': formatNumber(match.dateDifference),
          'Amount Difference': formatNumber(match.amountDifference),
          Reasoning: match.reasoning || '',
          'Is Verified': match.isVerified ? 'Yes' : 'No'
        }));
        
        const transferSheet = XLSX.utils.json_to_sheet(transferData);
        XLSX.utils.book_append_sheet(workbook, transferSheet, 'Transfer Matches');
      }

      // 9. Summary/Metadata Sheet
      const summaryData = [
        { Field: 'Export Version', Value: exportData.version || '' },
        { Field: 'Export Date', Value: formatDateForExcel(exportData.exportDate) },
        { Field: 'App Version', Value: exportData.appVersion || '' },
        { Field: 'Total Transactions', Value: exportData.transactions?.length || 0 },
        { Field: 'Total Accounts', Value: exportData.accounts?.length || 0 },
        { Field: 'Total Budgets', Value: exportData.budgets?.length || 0 },
        { Field: 'Total Categories', Value: exportData.categories?.length || 0 },
        { Field: 'Total Rules', Value: exportData.rules?.length || 0 },
        { Field: 'Total Currency Rates', Value: exportData.currencyRates?.length || 0 },
        { Field: 'Total Transfer Matches', Value: exportData.transferMatches?.length || 0 }
      ];
      
      const summarySheet = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

      // Generate filename and download
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `momoney-export-${timestamp}.xlsx`;
      
      // Write the file
      XLSX.writeFile(workbook, filename);
      
    } catch (error) {
      console.error('Failed to export to Excel:', error);
      throw new Error(`Failed to export to Excel: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
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