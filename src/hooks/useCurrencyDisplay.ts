import { useState, useEffect, useCallback } from 'react';
import { currencyDisplayService } from '../services/currencyDisplayService';
import { Transaction } from '../types';

/**
 * Custom hook for currency display operations
 * Reduces repetitive currencyDisplayService initialization and formatting patterns
 */
export const useCurrencyDisplay = () => {
  const [defaultCurrency, setDefaultCurrency] = useState<string>('USD');
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Initialize currency service on hook mount
  useEffect(() => {
    const initializeCurrency = async () => {
      try {
        await currencyDisplayService.initialize();
        const currency = await currencyDisplayService.getDefaultCurrency();
        setDefaultCurrency(currency);
        setIsInitialized(true);
      } catch (error) {
        console.error('Failed to initialize currency display service:', error);
        setDefaultCurrency('USD'); // fallback
        setIsInitialized(true);
      }
    };

    initializeCurrency();
  }, []);

  // Format a single amount with the default currency
  const formatAmount = useCallback(async (amount: number, currency?: string): Promise<string> => {
    if (!isInitialized) return '$0.00';
    try {
      return await currencyDisplayService.formatAmount(amount, currency || defaultCurrency);
    } catch (error) {
      console.error('Error formatting amount:', error);
      return '$0.00';
    }
  }, [defaultCurrency, isInitialized]);

  // Format a transaction amount
  const formatTransactionAmount = useCallback(async (transaction: Transaction) => {
    if (!isInitialized) {
      return { displayAmount: '$0.00', currency: 'USD' };
    }
    try {
      return await currencyDisplayService.formatTransactionAmount(transaction);
    } catch (error) {
      console.error('Error formatting transaction amount:', error);
      const fallbackCurrency = defaultCurrency;
      return { 
        displayAmount: '$0.00', 
        currency: fallbackCurrency 
      };
    }
  }, [defaultCurrency, isInitialized]);

  // Convert transaction amounts in batch
  const convertTransactionsBatch = useCallback(async (transactions: Transaction[]) => {
    if (!isInitialized) return transactions;
    try {
      return await currencyDisplayService.convertTransactionsBatch(transactions);
    } catch (error) {
      console.error('Error converting transactions batch:', error);
      return transactions;
    }
  }, [isInitialized]);

  return {
    defaultCurrency,
    isInitialized,
    formatAmount,
    formatTransactionAmount,
    convertTransactionsBatch
  };
};

export default useCurrencyDisplay;