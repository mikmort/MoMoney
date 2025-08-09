import { Transaction } from '../types';
import { userPreferencesService } from './userPreferencesService';
import { currencyExchangeService } from './currencyExchangeService';

class CurrencyDisplayService {
  private defaultCurrency: string = 'USD';
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.defaultCurrency = await userPreferencesService.getDefaultCurrency();
      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize currency display service:', error);
      this.defaultCurrency = 'USD';
      this.isInitialized = true;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Convert a transaction amount to the user's default currency for display
   */
  async convertTransactionAmount(transaction: Transaction): Promise<{
    amount: number;
    originalAmount?: number;
    originalCurrency?: string;
    exchangeRate?: number;
    isConverted: boolean;
  }> {
    await this.ensureInitialized();

    const transactionCurrency = transaction.originalCurrency || 'USD';
    
    // If already in the default currency, no conversion needed
    if (transactionCurrency === this.defaultCurrency) {
      return {
        amount: transaction.amount,
        isConverted: false
      };
    }

    // Check if we already have a cached exchange rate and converted amount
    if (transaction.exchangeRate && transaction.originalCurrency) {
      // Transaction was previously converted, display in default currency
      const convertedAmount = transaction.amount; // This is already converted
      return {
        amount: convertedAmount,
        originalAmount: transaction.amount / transaction.exchangeRate, // Back-calculate original
        originalCurrency: transaction.originalCurrency,
        exchangeRate: transaction.exchangeRate,
        isConverted: true
      };
    }

    // Need to convert from foreign currency to default currency
    try {
      const conversionResult = await currencyExchangeService.convertAmount(
        Math.abs(transaction.amount), // Work with absolute value
        transactionCurrency,
        this.defaultCurrency
      );

      if (conversionResult) {
        const convertedAmount = transaction.amount < 0 
          ? -conversionResult.convertedAmount 
          : conversionResult.convertedAmount;

        return {
          amount: convertedAmount,
          originalAmount: transaction.amount,
          originalCurrency: transactionCurrency,
          exchangeRate: conversionResult.rate,
          isConverted: true
        };
      }
    } catch (error) {
      console.error(`Failed to convert ${transactionCurrency} to ${this.defaultCurrency}:`, error);
    }

    // Fallback: return original amount if conversion fails
    return {
      amount: transaction.amount,
      originalAmount: transaction.amount,
      originalCurrency: transactionCurrency,
      isConverted: false
    };
  }

  /**
   * Format an amount for display with the appropriate currency symbol
   */
  async formatAmount(amount: number, currencyCode?: string): Promise<string> {
    await this.ensureInitialized();
    
    const currency = currencyCode || this.defaultCurrency;
    const symbol = userPreferencesService.getCurrencySymbol(currency);
    
    // Format with 2 decimal places and add commas for thousands
    const formattedNumber = Math.abs(amount).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const sign = amount < 0 ? '-' : '';
    
    // For some currencies, put symbol after the number
    if (['EUR', 'SEK', 'NOK', 'DKK'].includes(currency)) {
      return `${sign}${formattedNumber} ${symbol}`;
    }
    
    return `${sign}${symbol}${formattedNumber}`;
  }

  /**
   * Format a transaction amount with conversion info tooltip
   */
  async formatTransactionAmount(transaction: Transaction): Promise<{
    displayAmount: string;
    tooltip?: string;
    isConverted: boolean;
  }> {
    const conversionResult = await this.convertTransactionAmount(transaction);
    const displayAmount = await this.formatAmount(conversionResult.amount);
    
    if (!conversionResult.isConverted) {
      return { displayAmount, isConverted: false };
    }

    // Create tooltip showing original amount and exchange rate
    const originalFormatted = await this.formatAmount(
      conversionResult.originalAmount!,
      conversionResult.originalCurrency
    );
    
    const tooltip = `Original: ${originalFormatted} (Rate: ${conversionResult.exchangeRate?.toFixed(4) || 'N/A'})`;

    return {
      displayAmount,
      tooltip,
      isConverted: true
    };
  }

  /**
   * Get the user's default currency code
   */
  async getDefaultCurrency(): Promise<string> {
    await this.ensureInitialized();
    return this.defaultCurrency;
  }

  /**
   * Detect currency from transaction description or amount patterns
   */
  detectCurrencyFromTransaction(transaction: Partial<Transaction>): string | null {
    const description = transaction.description?.toLowerCase() || '';
    
    // Look for currency codes in description
    const currencyPatterns = [
      { pattern: /\beur\b|€/, currency: 'EUR' },
      { pattern: /\bgbp\b|£/, currency: 'GBP' },
      { pattern: /\bjpy\b|¥|yen\b/, currency: 'JPY' },
      { pattern: /\bcad\b|cad\$/, currency: 'CAD' },
      { pattern: /\baud\b|aud\$/, currency: 'AUD' },
      { pattern: /\bchf\b/, currency: 'CHF' },
      { pattern: /\bcny\b|yuan\b/, currency: 'CNY' },
      { pattern: /\binr\b|rupee/, currency: 'INR' },
      { pattern: /\bkrw\b|won\b/, currency: 'KRW' }
    ];

    for (const { pattern, currency } of currencyPatterns) {
      if (pattern.test(description)) {
        return currency;
      }
    }

    // Check if originalCurrency is already set
    if (transaction.originalCurrency && transaction.originalCurrency !== 'USD') {
      return transaction.originalCurrency;
    }

    return null; // Default to USD if no foreign currency detected
  }

  /**
   * Batch convert multiple transactions for efficient display
   */
  async convertTransactionsBatch(transactions: Transaction[]): Promise<Transaction[]> {
    await this.ensureInitialized();
    
    // Group transactions by currency to minimize API calls
    const byCurrency = new Map<string, Transaction[]>();
    
    for (const transaction of transactions) {
      const currency = transaction.originalCurrency || 'USD';
      if (!byCurrency.has(currency)) {
        byCurrency.set(currency, []);
      }
      byCurrency.get(currency)!.push(transaction);
    }

    const convertedTransactions: Transaction[] = [];

    for (const [currency, currencyTransactions] of byCurrency) {
      if (currency === this.defaultCurrency) {
        // No conversion needed
        convertedTransactions.push(...currencyTransactions);
        continue;
      }

      // Get exchange rate once for this currency
      const exchangeRate = await currencyExchangeService.getExchangeRate(currency, this.defaultCurrency);
      
      for (const transaction of currencyTransactions) {
        const convertedTransaction = { ...transaction };
        
        if (exchangeRate) {
          // Convert amount
          const convertedAmount = transaction.amount * exchangeRate.rate;
          convertedTransaction.amount = convertedAmount;
          convertedTransaction.exchangeRate = exchangeRate.rate;
          convertedTransaction.originalCurrency = currency;
        }
        
        convertedTransactions.push(convertedTransaction);
      }
    }

    return convertedTransactions;
  }
}

// Export singleton instance
export const currencyDisplayService = new CurrencyDisplayService();