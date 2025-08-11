import { currencyDisplayService } from '../services/currencyDisplayService';
import { currencyExchangeService } from '../services/currencyExchangeService';
import { userPreferencesService } from '../services/userPreferencesService';
import { accountManagementService } from '../services/accountManagementService';
import { Transaction } from '../types';

// Mock the external dependencies
jest.mock('../services/userPreferencesService');
jest.mock('../services/accountManagementService');
jest.mock('../services/currencyExchangeService');

describe('Currency Display Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock default currency as USD
    (userPreferencesService.getDefaultCurrency as jest.Mock).mockResolvedValue('USD');
    (userPreferencesService.getCurrencySymbol as jest.Mock).mockImplementation((currency: string) => {
      const symbols: { [key: string]: string } = {
        'USD': '$',
        'DKK': 'kr',
        'EUR': '€',
        'GBP': '£'
      };
      return symbols[currency] || currency;
    });
    (userPreferencesService.getCurrencyOptions as jest.Mock).mockReturnValue([
      { value: 'USD', label: 'US Dollar', symbol: '$' },
      { value: 'DKK', label: 'Danish Krone', symbol: 'kr' },
      { value: 'EUR', label: 'Euro', symbol: '€' }
    ]);
    
    // Mock account management service
    (accountManagementService.getAccounts as jest.Mock).mockReturnValue([
      { id: 'dkk-account', name: 'Danish Bank', currency: 'DKK' },
      { id: 'usd-account', name: 'US Bank', currency: 'USD' }
    ]);

    // Mock currency exchange service to simulate API calls
    (currencyExchangeService.convertAmount as jest.Mock).mockImplementation(async (amount: number, from: string, to: string) => {
      if (from === to) {
        return { convertedAmount: amount, rate: 1 };
      }
      if (from === 'DKK' && to === 'USD') {
        // Mock DKK to USD conversion (approximate rate)
        const rate = 0.145; // 1 DKK ≈ 0.145 USD
        return { convertedAmount: amount * rate, rate };
      }
      // For other currencies, return null to simulate no exchange rate found
      return null;
    });
  });

  describe('formatTransactionAmount', () => {
    it('should show DKK transaction in original currency (DKK) for transaction list', async () => {
      const transaction: Transaction = {
        id: '1',
        date: new Date('2025-08-03'),
        amount: -250.50,
        description: 'Københavns Kommune - Parkeringsgebyr',
        category: 'Transportation',
        account: 'Danish Bank',
        type: 'expense',
        originalCurrency: 'DKK'
      };

      const result = await currencyDisplayService.formatTransactionAmount(transaction);
      
      // Debug - log the actual result
      console.log('DEBUG - formatTransactionAmount result:', result);
      
      // Primary display should be in original DKK currency
      expect(result.displayAmount).toMatch(/kr/);
      expect(result.displayAmount).toMatch(/250[.,]50/);
      
      // Should indicate this was a foreign currency conversion
      expect(result.isConverted).toBe(true);
      
      // Should have approximation in USD (converted amount)
      expect(result.approxConvertedDisplay).toMatch(/USD/);
      expect(result.approxConvertedDisplay).toMatch(/≈/);
    });

    it('should show USD transaction without conversion when default currency is USD', async () => {
      const transaction: Transaction = {
        id: '2',
        date: new Date('2025-08-03'),
        amount: -100.00,
        description: 'Starbucks Coffee',
        category: 'Food & Dining',
        account: 'US Bank',
        type: 'expense',
        originalCurrency: 'USD'
      };

      const result = await currencyDisplayService.formatTransactionAmount(transaction);
      
      // Should show in USD without conversion
      expect(result.displayAmount).toMatch(/\$100[.,]00/);
      expect(result.isConverted).toBe(false);
      expect(result.approxConvertedDisplay).toBeUndefined();
    });

    it('should handle transaction without explicit originalCurrency by inferring from account', async () => {
      const transaction: Transaction = {
        id: '3',
        date: new Date('2025-08-03'),
        amount: -1500.00,
        description: 'Rent payment',
        category: 'Housing',
        account: 'Danish Bank', // This account has currency: 'DKK'
        type: 'expense'
        // No originalCurrency set - should infer from account
      };

      const result = await currencyDisplayService.formatTransactionAmount(transaction);
      
      // Should infer DKK from account and show in DKK
      expect(result.displayAmount).toMatch(/kr/);
      expect(result.displayAmount).toMatch(/1[.,]?500[.,]00/);
      expect(result.isConverted).toBe(true);
    });
  });

  describe('convertTransactionAmount', () => {
    it('should return conversion info for foreign currency transactions', async () => {
      const transaction: Transaction = {
        id: '4',
        date: new Date('2025-08-03'),
        amount: -250.50,
        description: 'Danish store purchase',
        category: 'Shopping',
        account: 'Danish Bank',
        type: 'expense',
        originalCurrency: 'DKK'
      };

      const result = await currencyDisplayService.convertTransactionAmount(transaction);
      
      // Should return conversion information
      expect(result.originalAmount).toBe(-250.50);
      expect(result.originalCurrency).toBe('DKK');
      expect(result.isConverted).toBe(true);
      
      // Should have converted amount (will be mocked)
      expect(result.amount).toBeDefined();
      expect(result.exchangeRate).toBeDefined();
    });
  });
});