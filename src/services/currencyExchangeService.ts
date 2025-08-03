import { CurrencyExchangeRate } from '../types';

// Free currency exchange API (exchangerate-api.com)
const EXCHANGE_API_URL = 'https://api.exchangerate-api.com/v4/latest';

export class CurrencyExchangeService {
  private cache: Map<string, { rate: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

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
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return {
        fromCurrency,
        toCurrency,
        rate: cached.rate,
        date: new Date(cached.timestamp),
        source: 'cache'
      };
    }

    try {
      const response = await fetch(`${EXCHANGE_API_URL}/${fromCurrency}`);
      const data = await response.json();
      
      if (data.rates && data.rates[toCurrency]) {
        const rate = data.rates[toCurrency];
        
        // Cache the result
        this.cache.set(cacheKey, {
          rate,
          timestamp: Date.now()
        });

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
      console.error('Error fetching exchange rate:', error);
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
}

// Export singleton instance
export const currencyExchangeService = new CurrencyExchangeService();
