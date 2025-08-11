import { CurrencyExchangeRate } from '../types';

// Free currency exchange API (exchangerate-api.com)
const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

export interface StoredExchangeRate {
  rate: number;
  timestamp: number;
  source: string;
}

export interface ExchangeRateStatus {
  isStale: boolean;
  lastSuccessfulFetch: Date | null;
  staleDurationHours: number;
  hasStoredRates: boolean;
  totalStoredRates: number;
}

export class CurrencyExchangeService {
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour fresh cache
  private readonly STALE_WARNING_DURATION = 1000 * 60 * 60 * 24; // 24 hours until stale warning
  private readonly STORAGE_KEY_PREFIX = 'mo_money_exchange_rates_';
  private readonly STATUS_KEY = 'mo_money_exchange_status';
  private lastApiCallAttempt: Date | null = null;
  private consecutiveFailures: number = 0;

  /**
   * Store exchange rate in localStorage with metadata
   */
  private storeExchangeRate(cacheKey: string, rate: number, source: string): void {
    try {
      const storedRate: StoredExchangeRate = {
        rate,
        timestamp: Date.now(),
        source
      };
      localStorage.setItem(`${this.STORAGE_KEY_PREFIX}${cacheKey}`, JSON.stringify(storedRate));
      
      // Update status
      this.updateExchangeRateStatus(true);
    } catch (error) {
      console.warn('Failed to store exchange rate:', error);
    }
  }

  /**
   * Retrieve stored exchange rate from localStorage
   */
  private getStoredExchangeRate(cacheKey: string): StoredExchangeRate | null {
    try {
      const stored = localStorage.getItem(`${this.STORAGE_KEY_PREFIX}${cacheKey}`);
      if (!stored) return null;
      
      return JSON.parse(stored) as StoredExchangeRate;
    } catch (error) {
      console.warn('Failed to retrieve stored exchange rate:', error);
      return null;
    }
  }

  /**
   * Update the overall status of exchange rate freshness
   */
  private updateExchangeRateStatus(isSuccessfulFetch: boolean): void {
    try {
      const currentStatus = this.getExchangeRateStatus();
      const newStatus: ExchangeRateStatus = {
        ...currentStatus,
        lastSuccessfulFetch: isSuccessfulFetch ? new Date() : currentStatus.lastSuccessfulFetch,
        hasStoredRates: this.getStoredRatesCount() > 0,
        totalStoredRates: this.getStoredRatesCount(),
        isStale: false, // Will be calculated in getExchangeRateStatus
        staleDurationHours: 0 // Will be calculated in getExchangeRateStatus
      };
      
      localStorage.setItem(this.STATUS_KEY, JSON.stringify(newStatus));
    } catch (error) {
      console.warn('Failed to update exchange rate status:', error);
    }
  }

  /**
   * Get count of stored exchange rates
   */
  private getStoredRatesCount(): number {
    let count = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          count++;
        }
      }
    } catch (error) {
      console.warn('Failed to count stored rates:', error);
    }
    return count;
  }
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<CurrencyExchangeRate | null> {
    if (fromCurrency === toCurrency) {
      return {
        fromCurrency,
        toCurrency,
        rate: 1,
        date: new Date(),
        source: 'local'
      };
    }

    const cacheKey = `${fromCurrency}-${toCurrency}`;
    const stored = this.getStoredExchangeRate(cacheKey);
    
    // Use fresh cached rate if available
    if (stored && Date.now() - stored.timestamp < this.CACHE_DURATION) {
      return {
        fromCurrency,
        toCurrency,
        rate: stored.rate,
        date: new Date(stored.timestamp),
        source: stored.source === 'api' ? 'cached' : stored.source
      };
    }

    // Try to fetch from API
    this.lastApiCallAttempt = new Date();
    try {
      console.log(`Attempting to fetch exchange rate: ${fromCurrency} to ${toCurrency}`);
      const response = await fetch(`${EXCHANGE_API_URL}/${fromCurrency}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.rates && data.rates[toCurrency]) {
        const rate = data.rates[toCurrency];
        
        // Store the successful result
        this.storeExchangeRate(cacheKey, rate, 'api');
        this.consecutiveFailures = 0;
        
        console.log(`Successfully fetched exchange rate: 1 ${fromCurrency} = ${rate} ${toCurrency}`);

        return {
          fromCurrency,
          toCurrency,
          rate,
          date: new Date(),
          source: 'exchangerate-api.com'
        };
      }
      
      throw new Error(`Exchange rate not found for ${fromCurrency} to ${toCurrency}`);
    } catch (error) {
      this.consecutiveFailures++;
      console.warn(`Exchange rate API call failed (attempt ${this.consecutiveFailures}):`, error);
      
      // Use stored rate as fallback, regardless of age
      if (stored) {
        const ageHours = (Date.now() - stored.timestamp) / (1000 * 60 * 60);
        console.log(`Using stored exchange rate (${ageHours.toFixed(1)}h old): 1 ${fromCurrency} = ${stored.rate} ${toCurrency}`);
        
        return {
          fromCurrency,
          toCurrency,
          rate: stored.rate,
          date: new Date(stored.timestamp),
          source: `stored-${stored.source}`
        };
      }
      
      // Update status to reflect API failure
      this.updateExchangeRateStatus(false);
      
      console.error(`No exchange rate available for ${fromCurrency} to ${toCurrency} - no stored fallback`);
      return null;
    }
  }

  async convertAmount(amount: number, fromCurrency: string, toCurrency: string): Promise<{ convertedAmount: number; rate: number } | null> {
    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
    
    if (!exchangeRate) {
      return null;
    }

    return {
      convertedAmount: amount * exchangeRate.rate,
      rate: exchangeRate.rate
    };
  }

  // Get multiple exchange rates for common currencies
  async getMultipleRates(baseCurrency: string, targetCurrencies: string[]): Promise<CurrencyExchangeRate[]> {
    const rates: CurrencyExchangeRate[] = [];
    
    for (const targetCurrency of targetCurrencies) {
      const rate = await this.getExchangeRate(baseCurrency, targetCurrency);
      if (rate) {
        rates.push(rate);
      }
    }
    
    return rates;
  }

  // Common currencies that might be used for international reimbursements
  getCommonCurrencies(): string[] {
    return ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY', 'INR', 'KRW'];
  }

  /**
   * Get current status of exchange rates (freshness, API health, etc.)
   */
  getExchangeRateStatus(): ExchangeRateStatus {
    try {
      const storedStatus = localStorage.getItem(this.STATUS_KEY);
      let status: ExchangeRateStatus;
      
      if (storedStatus) {
        status = JSON.parse(storedStatus);
        // Ensure lastSuccessfulFetch is a Date object
        if (status.lastSuccessfulFetch) {
          status.lastSuccessfulFetch = new Date(status.lastSuccessfulFetch);
        }
      } else {
        status = {
          isStale: true,
          lastSuccessfulFetch: null,
          staleDurationHours: 0,
          hasStoredRates: false,
          totalStoredRates: 0
        };
      }
      
      // Update calculated fields
      status.hasStoredRates = this.getStoredRatesCount() > 0;
      status.totalStoredRates = this.getStoredRatesCount();
      
      if (status.lastSuccessfulFetch) {
        const hoursSinceSuccess = (Date.now() - status.lastSuccessfulFetch.getTime()) / (1000 * 60 * 60);
        status.staleDurationHours = hoursSinceSuccess;
        status.isStale = hoursSinceSuccess > (this.STALE_WARNING_DURATION / (1000 * 60 * 60));
      } else {
        status.isStale = true;
        status.staleDurationHours = 0;
      }
      
      return status;
    } catch (error) {
      console.warn('Failed to get exchange rate status:', error);
      return {
        isStale: true,
        lastSuccessfulFetch: null,
        staleDurationHours: 0,
        hasStoredRates: false,
        totalStoredRates: 0
      };
    }
  }

  /**
   * Clear all stored exchange rates (for debugging/testing)
   */
  clearStoredRates(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => localStorage.removeItem(key));
      localStorage.removeItem(this.STATUS_KEY);
      
      console.log(`Cleared ${keysToRemove.length} stored exchange rates`);
    } catch (error) {
      console.warn('Failed to clear stored rates:', error);
    }
  }

  /**
   * Get debug info about stored exchange rates
   */
  getDebugInfo(): {
    storedRates: Array<{key: string; rate: number; age: string; source: string}>;
    status: ExchangeRateStatus;
    consecutiveFailures: number;
    lastApiCallAttempt: Date | null;
  } {
    const storedRates: Array<{key: string; rate: number; age: string; source: string}> = [];
    
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.STORAGE_KEY_PREFIX)) {
          const stored = this.getStoredExchangeRate(key.replace(this.STORAGE_KEY_PREFIX, ''));
          if (stored) {
            const ageHours = (Date.now() - stored.timestamp) / (1000 * 60 * 60);
            storedRates.push({
              key: key.replace(this.STORAGE_KEY_PREFIX, ''),
              rate: stored.rate,
              age: `${ageHours.toFixed(1)}h`,
              source: stored.source
            });
          }
        }
      }
    } catch (error) {
      console.warn('Failed to get debug info:', error);
    }
    
    return {
      storedRates,
      status: this.getExchangeRateStatus(),
      consecutiveFailures: this.consecutiveFailures,
      lastApiCallAttempt: this.lastApiCallAttempt
    };
  }
}

// Export singleton instance
export const currencyExchangeService = new CurrencyExchangeService();
