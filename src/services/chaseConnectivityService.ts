import { Transaction, Account } from '../types';
import { v4 as uuidv4 } from 'uuid';
import Papa from 'papaparse';

export interface ChaseAccountInfo {
  accountId: string;
  accountType: 'checking' | 'savings' | 'credit';
  institution: 'Chase';
  maskedAccountNumber: string;
  accountName: string;
  balance?: number;
  balanceDate?: Date;
}

export interface ChaseTransactionRow {
  Date?: string;
  'Transaction Date'?: string;
  Description?: string;
  Amount?: string;
  Balance?: string;
  'Running Bal.'?: string;
  Type?: string;
  'Check or Slip #'?: string;
  Details?: string;
  'Post Date'?: string;
  'Posting Date'?: string;
  Category?: string;
}

export interface ChaseConnectionGuide {
  steps: Array<{
    step: number;
    title: string;
    description: string;
    url?: string;
    imageUrl?: string;
  }>;
  supportedFormats: string[];
  downloadInstructions: string;
}

class ChaseConnectivityService {
  private readonly CHASE_INSTITUTION = 'Chase';

  /**
   * Get step-by-step guide for users to download Chase statements
   */
  getDownloadGuide(): ChaseConnectionGuide {
    return {
      steps: [
        {
          step: 1,
          title: 'Log into Chase Online Banking',
          description: 'Visit chase.com and log into your online banking account with your username and password.',
          url: 'https://secure01b.chase.com/web/auth/dashboard'
        },
        {
          step: 2,
          title: 'Navigate to Account Activity',
          description: 'Click on the account you want to download transactions for, then select "Account Activity" or "Activity & Documents".'
        },
        {
          step: 3,
          title: 'Choose Date Range',
          description: 'Select the date range for transactions you want to download. For comprehensive history, choose "Custom range" and select up to 24 months.'
        },
        {
          step: 4,
          title: 'Download Transactions',
          description: 'Click "Download" and choose "Comma Delimited" (CSV) format. This will download a file you can upload to Mo Money.'
        },
        {
          step: 5,
          title: 'Upload to Mo Money',
          description: 'Return to Mo Money and use the file upload feature to import your Chase transactions. The app will automatically detect it\'s a Chase account.'
        }
      ],
      supportedFormats: ['CSV (Comma Delimited)', 'OFX', 'QIF'],
      downloadInstructions: 'Chase allows downloads of up to 24 months of transaction history in CSV format.'
    };
  }

  /**
   * Detect if a CSV file is from Chase based on headers and content
   */
  detectChaseFormat(csvContent: string): { isChase: boolean; accountType?: 'checking' | 'savings' | 'credit'; confidence: number } {
    const lines = csvContent.split('\n');
    if (lines.length < 2) return { isChase: false, confidence: 0 };

    const headerLine = lines[0].toLowerCase();

    // Chase checking/savings account headers (order matters for confidence)
    const checkingHeaders = [
      'details', 'posting date', 'description', 'amount', 'type', 'balance', 'check or slip'
    ];
    
    // Chase credit card headers (order matters for confidence)
    const creditHeaders = [
      'transaction date', 'post date', 'description', 'category', 'type', 'amount'
    ];

    let checkingScore = 0;
    let creditScore = 0;

    // Check for checking/savings indicators with exact matches
    checkingHeaders.forEach(header => {
      if (headerLine.includes(header)) checkingScore++;
    });

    // Check for credit card indicators with exact matches
    creditHeaders.forEach(header => {
      if (headerLine.includes(header)) creditScore++;
    });

    // Look for Chase-specific patterns in the data
    const chasePatterns = [
      /chase/i,
      /debit card purchase/i,
      /ach credit/i,
      /ach debit/i,
      /check card \d+/i,
      /online transfer/i,
      /payroll deposit/i
    ];

    let patternScore = 0;
    chasePatterns.forEach(pattern => {
      if (pattern.test(csvContent)) patternScore++;
    });

    // Determine if this is a Chase file
    const minRequiredScore = 4; // Need at least 4 header matches
    const isChaseChecking = checkingScore >= minRequiredScore;
    const isChaseCredit = creditScore >= minRequiredScore;
    const isChase = (isChaseChecking || isChaseCredit) || 
                    ((Math.max(checkingScore, creditScore) >= 3) && (patternScore >= 2));

    // Calculate confidence
    let confidence = 0;
    if (isChase) {
      const headerScore = Math.max(checkingScore, creditScore) / 
                         Math.max(checkingHeaders.length, creditHeaders.length);
      const patternBonus = Math.min(patternScore / chasePatterns.length, 0.3);
      confidence = Math.min((headerScore + patternBonus) * 100, 95);
    }

    let accountType: 'checking' | 'savings' | 'credit' | undefined;
    if (isChase) {
      if (isChaseCredit && creditScore > checkingScore) {
        accountType = 'credit';
      } else if (isChaseChecking && checkingScore >= creditScore) {
        accountType = 'checking';
      } else {
        // Fallback: analyze content for clues
        if (csvContent.toLowerCase().includes('transaction date') && 
            csvContent.toLowerCase().includes('post date')) {
          accountType = 'credit';
        } else {
          accountType = 'checking';
        }
      }
    }

    return { isChase, accountType, confidence };
  }

  /**
   * Parse Chase CSV format and convert to standardized transactions
   */
  parseChaseCSV(csvContent: string, accountId: string): { transactions: Transaction[]; accountInfo: ChaseAccountInfo | null } {
    const parseResult = Papa.parse<ChaseTransactionRow>(csvContent, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim()
    });

    if (parseResult.errors.length > 0) {
      console.warn('Chase CSV parsing errors:', parseResult.errors);
    }

    const rows = parseResult.data;
    const transactions: Transaction[] = [];
    let accountInfo: ChaseAccountInfo | null = null;

    // Extract account info from first transaction if available
    if (rows.length > 0) {
      const firstRow = rows[0];
      
      // Try to determine account number from patterns in description
      const accountPattern = /\d{4}$/; // Last 4 digits pattern
      let maskedNumber = 'Ending in XXXX';
      
      // Look for account number patterns in any field
      Object.values(firstRow).forEach(value => {
        if (typeof value === 'string') {
          const match = value.match(accountPattern);
          if (match) {
            maskedNumber = `Ending in ${match[0]}`;
          }
        }
      });

      accountInfo = {
        accountId,
        accountType: this.detectChaseFormat(csvContent).accountType || 'checking',
        institution: 'Chase',
        maskedAccountNumber: maskedNumber,
        accountName: `Chase ${this.detectChaseFormat(csvContent).accountType || 'Account'}`,
        balance: this.parseAmount(firstRow.Balance || firstRow['Running Bal.']) || undefined,
        balanceDate: this.parseDate(firstRow.Date || firstRow['Transaction Date']) || undefined
      };
    }

    // Convert each row to a transaction
    rows.forEach((row, index) => {
      try {
        const transaction = this.convertChaseRowToTransaction(row, accountId, index);
        if (transaction) {
          transactions.push(transaction);
        }
      } catch (error) {
        console.warn(`Failed to parse Chase transaction row ${index}:`, row, error);
      }
    });

    // Sort transactions by date (most recent first)
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { transactions, accountInfo };
  }

  /**
   * Convert a single Chase CSV row to a Transaction object
   */
  private convertChaseRowToTransaction(row: ChaseTransactionRow, accountId: string, index: number): Transaction | null {
    const date = this.parseDate(row.Date || row['Transaction Date'] || row['Post Date'] || row['Posting Date']);
    const amount = this.parseAmount(row.Amount);
    const description = row.Description || row.Details || '';

    if (!date || amount === null || !description.trim()) {
      return null; // Skip incomplete rows
    }

    // Determine transaction type based on amount and description
    const type = this.determineTransactionType(amount, description);
    
    // Categorize the transaction based on Chase-specific patterns
    const category = this.categorizeChaseTransaction(description, type);

    const transaction: Transaction = {
      id: uuidv4(),
      date,
      amount: Math.abs(amount), // Store as positive, type indicates direction
      description: description.trim(),
      category,
      account: accountId,
      type,
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      originalText: JSON.stringify(row),
      confidence: 0.8, // High confidence for bank data
      vendor: this.extractVendor(description),
      notes: row['Check or Slip #'] ? `Check/Slip: ${row['Check or Slip #']}` : undefined
    };

    return transaction;
  }

  /**
   * Parse date from various Chase date formats
   */
  private parseDate(dateStr?: string): Date | null {
    if (!dateStr || typeof dateStr !== 'string') return null;

    const trimmed = dateStr.trim();
    if (!trimmed) return null;

    // Common Chase date formats: MM/DD/YYYY, MM/DD/YY, YYYY-MM-DD
    const formats = [
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
      /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, // MM/DD/YY
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/ // YYYY-MM-DD
    ];

    for (let i = 0; i < formats.length; i++) {
      const format = formats[i];
      const match = trimmed.match(format);
      if (match) {
        let year: number, month: number, day: number;
        
        if (i === 2) { // YYYY-MM-DD format
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1; // JavaScript months are 0-indexed
          day = parseInt(match[3]);
        } else { // MM/DD/YYYY or MM/DD/YY format
          month = parseInt(match[1]) - 1; // JavaScript months are 0-indexed
          day = parseInt(match[2]);
          year = match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3]);
        }
        
        const date = new Date(year, month, day);
        
        // Validate the date
        if (date.getFullYear() === year && date.getMonth() === month && date.getDate() === day) {
          return date;
        }
      }
    }

    // Try standard Date parsing as fallback
    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Parse amount from Chase format (handles negatives and currency symbols)
   */
  private parseAmount(amountStr?: string): number | null {
    if (!amountStr) return null;

    // Remove currency symbols and spaces
    const cleaned = amountStr.replace(/[$,\s]/g, '');
    
    // Handle negative amounts (could be in parentheses or with minus sign)
    const isNegative = (cleaned.includes('(') && cleaned.includes(')')) || cleaned.startsWith('-');
    const numericStr = cleaned.replace(/[()+-]/g, '');
    
    const amount = parseFloat(numericStr);
    return isNaN(amount) ? null : (isNegative ? -amount : amount);
  }

  /**
   * Determine if transaction is income, expense, or transfer based on amount and description
   */
  private determineTransactionType(amount: number, description: string): 'income' | 'expense' | 'transfer' {
    const lowerDesc = description.toLowerCase();
    
    // Transfer patterns (check these first)
    const transferPatterns = [
      /^transfer/i, /^ach transfer/i, /^wire/i, /^online transfer/i, /^mobile transfer/i,
      /^zelle/i, /^autopay/i, /^automatic payment/i, /^withdrawal/i, /payment.*thank you/i,
      /^payment\s*-/i
    ];
    
    if (transferPatterns.some(pattern => pattern.test(lowerDesc.trim()))) {
      return 'transfer';
    }
    
    // Income indicators
    if (amount > 0 && (lowerDesc.includes('payroll') || lowerDesc.includes('salary') || 
                      lowerDesc.includes('direct dep') || lowerDesc.includes('interest') || 
                      lowerDesc.includes('dividend') || lowerDesc.includes('refund'))) {
      return 'income';
    }
    
    // For deposits, check if they're likely income vs transfers
    if (amount > 0 && lowerDesc.includes('deposit')) {
      // Payroll deposits are income
      if (lowerDesc.includes('payroll') || lowerDesc.includes('salary') || lowerDesc.includes('wages')) {
        return 'income';
      }
      // Other deposits might be transfers, but default to income
      return 'income';
    }
    
    // Default logic: positive amounts are income, negative are expenses
    return amount > 0 ? 'income' : 'expense';
  }

  /**
   * Categorize Chase transactions based on common patterns
   */
  private categorizeChaseTransaction(description: string, type: 'income' | 'expense' | 'transfer'): string {
    const lowerDesc = description.toLowerCase();
    
    if (type === 'transfer') {
      return 'Transfer';
    }
    
    if (type === 'income') {
      if (lowerDesc.includes('payroll') || lowerDesc.includes('salary') || lowerDesc.includes('direct dep')) {
        return 'Income';
      }
      return 'Other Income';
    }
    
    // Expense categorization
    const categories: { [key: string]: string[] } = {
      'Groceries': ['grocery', 'supermarket', 'food store', 'walmart', 'target', 'costco'],
      'Gas & Fuel': ['gas', 'fuel', 'exxon', 'shell', 'bp', 'chevron', 'mobil'],
      'Restaurants': ['restaurant', 'mcdonald', 'burger', 'pizza', 'starbucks', 'coffee'],
      'Shopping': ['amazon', 'ebay', 'store', 'retail', 'shop'],
      'Utilities': ['electric', 'water', 'gas bill', 'utility', 'phone', 'internet'],
      'Healthcare': ['hospital', 'doctor', 'medical', 'pharmacy', 'cvs', 'walgreens'],
      'Transportation': ['uber', 'lyft', 'taxi', 'parking', 'toll', 'metro', 'bus'],
      'Entertainment': ['movie', 'theater', 'netflix', 'spotify', 'gaming', 'entertainment']
    };
    
    for (const [category, keywords] of Object.entries(categories)) {
      if (keywords.some(keyword => lowerDesc.includes(keyword))) {
        return category;
      }
    }
    
    return 'Other';
  }

  /**
   * Extract vendor name from transaction description
   */
  private extractVendor(description: string): string {
    // Clean up common Chase formatting
    let vendor = description
      .replace(/^(DEBIT CARD PURCHASE|CHECK CARD \d+|ACH)/i, '')
      .replace(/\d{2}\/\d{2}$/, '') // Remove trailing dates
      .replace(/\s+/g, ' ')
      .trim();
    
    // Extract the main vendor name (usually the first meaningful part)
    const parts = vendor.split(/\s+/);
    const meaningfulParts = parts.filter(part => 
      part.length > 2 && 
      !part.match(/^\d+$/) && 
      !['THE', 'AND', 'OF', 'FOR'].includes(part.toUpperCase())
    );
    
    return meaningfulParts.slice(0, 3).join(' ') || description;
  }

  /**
   * Create a Chase account from detected account info
   */
  createChaseAccount(accountInfo: ChaseAccountInfo): Account {
    return {
      id: accountInfo.accountId,
      name: accountInfo.accountName,
      type: accountInfo.accountType,
      institution: 'Chase',
      currency: 'USD', // Chase is US-based
      balance: accountInfo.balance,
      lastSyncDate: accountInfo.balanceDate,
      isActive: true,
      maskedAccountNumber: accountInfo.maskedAccountNumber,
      historicalBalance: accountInfo.balance,
      historicalBalanceDate: accountInfo.balanceDate
    };
  }

  /**
   * Check if a file is likely a Chase statement based on filename
   */
  isChaseFile(filename: string): boolean {
    const lowerName = filename.toLowerCase();
    return lowerName.includes('chase') || 
           lowerName.includes('chase_') || 
           lowerName.match(/^\d+_activity_\d+\.csv$/i) !== null;
  }
}

export const chaseConnectivityService = new ChaseConnectivityService();