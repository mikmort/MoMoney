import { Transaction } from '../types';
import { userPreferencesService } from './userPreferencesService';
import { currencyExchangeService } from './currencyExchangeService';
import { accountManagementService } from './accountManagementService';

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

  // Resolve the most likely currency for a transaction when originalCurrency is missing
  private resolveTransactionCurrency(transaction: Transaction): string {
    // Priority: explicit originalCurrency -> account currency -> default currency
    if (transaction.originalCurrency) return transaction.originalCurrency;

    // Try to infer from the linked account (by id or name)
    try {
      const accounts = accountManagementService.getAccounts();
      const acc = accounts.find(a => a.id === transaction.account || a.name === transaction.account);
      if (acc?.currency) return acc.currency;
    } catch {
      // ignore
    }

    return this.defaultCurrency;
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

  // Use the original currency if present, otherwise infer from account, otherwise default currency
  const transactionCurrency = this.resolveTransactionCurrency(transaction);
    
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

      let rateToUse: number | null = null;
      let convertedAmount: number = 0;

      if (conversionResult) {
        rateToUse = conversionResult.rate;
        convertedAmount = transaction.amount < 0 
          ? -conversionResult.convertedAmount 
          : conversionResult.convertedAmount;
      } else {
        // API failed, use fallback rate
        rateToUse = this.getFallbackExchangeRate(transactionCurrency, this.defaultCurrency);
        if (rateToUse) {
          convertedAmount = transaction.amount * rateToUse;
          console.warn(`Using fallback exchange rate for ${transactionCurrency} to ${this.defaultCurrency}: ${rateToUse}`);
        }
      }

      if (rateToUse) {
        return {
          amount: convertedAmount,
          originalAmount: transaction.amount,
          originalCurrency: transactionCurrency,
          exchangeRate: rateToUse,
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
    approxConvertedDisplay?: string; // e.g., (≈ -$217.80 USD)
  }> {
    const defaultCurrencyCode = await this.getDefaultCurrency();
    const conversionResult = await this.convertTransactionAmount(transaction);

    // Always show the ORIGINAL amount/currency as the primary display
    const originalAmount = conversionResult.originalAmount ?? transaction.amount;
    const originalCurrency = conversionResult.originalCurrency 
      ?? transaction.originalCurrency 
      ?? this.resolveTransactionCurrency(transaction);
    const displayAmount = await this.formatAmount(originalAmount, originalCurrency);

    // If no conversion happened (either already in default currency or conversion failed), return primary only
    if (!conversionResult.isConverted) {
      // If the original currency differs from default but we couldn't convert, still show original without approx
      if (originalCurrency !== defaultCurrencyCode) {
        return { displayAmount, isConverted: false };
      }
      // Original equals default
      return { displayAmount, isConverted: false };
    }

    // We did convert for display purposes — build tooltip and approx text
    const originalFormatted = await this.formatAmount(originalAmount, originalCurrency);
    const tooltip = `Original: ${originalFormatted} (Rate: ${conversionResult.exchangeRate?.toFixed(4) || 'N/A'})`;

    const approx = await this.formatAmount(conversionResult.amount, defaultCurrencyCode);
    const approxConvertedDisplay = `≈ ${approx} ${defaultCurrencyCode}`;

    return {
      displayAmount,
      tooltip,
      isConverted: true,
      approxConvertedDisplay
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
   * Get fallback exchange rate for common currencies when API fails
   */
  private getFallbackExchangeRate(fromCurrency: string, toCurrency: string): number | null {
    if (fromCurrency === toCurrency) return 1;
    
    // Fallback rates to USD (approximate, updated periodically)
    const fallbackRatesToUSD: { [key: string]: number } = {
      'DKK': 0.145,  // Danish Krone to USD
      'EUR': 1.08,   // Euro to USD
      'GBP': 1.27,   // British Pound to USD
      'CAD': 0.73,   // Canadian Dollar to USD
      'AUD': 0.66,   // Australian Dollar to USD
      'JPY': 0.0067, // Japanese Yen to USD
      'CHF': 1.12,   // Swiss Franc to USD
      'CNY': 0.14,   // Chinese Yuan to USD
      'INR': 0.012,  // Indian Rupee to USD
      'KRW': 0.00074,// South Korean Won to USD
      'SEK': 0.092,  // Swedish Krona to USD
      'NOK': 0.089   // Norwegian Krone to USD
    };
    
    // Direct conversion to USD
    if (toCurrency === 'USD' && fallbackRatesToUSD[fromCurrency]) {
      return fallbackRatesToUSD[fromCurrency];
    }
    
    // Conversion from USD
    if (fromCurrency === 'USD' && fallbackRatesToUSD[toCurrency]) {
      return 1 / fallbackRatesToUSD[toCurrency];
    }
    
    // Cross-currency conversion through USD
    if (fallbackRatesToUSD[fromCurrency] && fallbackRatesToUSD[toCurrency]) {
      return fallbackRatesToUSD[fromCurrency] / fallbackRatesToUSD[toCurrency];
    }
    
    return null;
  }

  /**
   * Batch convert multiple transactions for efficient display
   */
  async convertTransactionsBatch(transactions: Transaction[]): Promise<Transaction[]> {
    await this.ensureInitialized();
    
    // Group transactions by currency to minimize API calls
    const byCurrency = new Map<string, Transaction[]>();
    
    for (const transaction of transactions) {
  const currency = this.resolveTransactionCurrency(transaction);
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
      
      // Determine the rate to use (API or fallback)
      let rateToUse: number | null = null;
      let rateSource = 'unknown';
      
      if (exchangeRate && exchangeRate.rate) {
        rateToUse = exchangeRate.rate;
        rateSource = 'api';
      } else {
        // API failed, use fallback rate
        rateToUse = this.getFallbackExchangeRate(currency, this.defaultCurrency);
        rateSource = 'fallback';
        if (rateToUse) {
          console.warn(`Using fallback exchange rate for ${currency} to ${this.defaultCurrency}: ${rateToUse}`);
        }
      }
      
      for (const transaction of currencyTransactions) {
        const convertedTransaction = { ...transaction };
        
        if (rateToUse) {
          // Convert amount using API rate or fallback rate
          const convertedAmount = transaction.amount * rateToUse;
          convertedTransaction.amount = convertedAmount;
          convertedTransaction.exchangeRate = rateToUse;
          convertedTransaction.originalCurrency = currency;
        } else {
          // No rate available - log warning but still convert to prevent wrong totals
          console.warn(`No exchange rate available for ${currency} to ${this.defaultCurrency}, transaction will be excluded from totals calculation`);
          // Skip this transaction entirely rather than include it with wrong currency
          continue;
        }
        
        convertedTransactions.push(convertedTransaction);
      }
    }

    return convertedTransactions;
  }
}

// Export singleton instance
export const currencyDisplayService = new CurrencyDisplayService();