import { Transaction } from '../types';
import { currencyDisplayService } from '../services/currencyDisplayService';
import { currencyExchangeService } from '../services/currencyExchangeService';
import { userPreferencesService } from '../services/userPreferencesService';

// Mock services
jest.mock('../services/currencyExchangeService');
jest.mock('../services/userPreferencesService');

/**
 * Test suite to validate currency conversion in transfer match validation
 * Reproduces the issue where DKK/USD amounts are compared directly without conversion
 */
describe('Transfer Match Currency Validation', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Mock user preferences
    (userPreferencesService.getDefaultCurrency as jest.Mock).mockResolvedValue('USD');
    (userPreferencesService.getCurrencySymbol as jest.Mock).mockImplementation((currency: string) => {
      const symbols: { [key: string]: string } = {
        'USD': '$',
        'DKK': 'kr',
        'EUR': '€',
        'GBP': '£'
      };
      return symbols[currency] || '$';
    });

    // Mock currency exchange service
    (currencyExchangeService.convertAmount as jest.Mock).mockImplementation(async (amount: number, from: string, to: string) => {
      if (from === to) {
        return { convertedAmount: amount, rate: 1 };
      }
      if (from === 'DKK' && to === 'USD') {
        // Mock DKK to USD conversion (rate ~6.37)
        return { convertedAmount: amount / 6.37, rate: 1/6.37 };
      }
      if (from === 'USD' && to === 'DKK') {
        return { convertedAmount: amount * 6.37, rate: 6.37 };
      }
      // For other currencies, assume no conversion available
      return null;
    });

    await currencyDisplayService.initialize();
  });

  it('should convert both transactions to default currency before comparison', async () => {
    // Simulate the issue from the screenshot:
    // DKK transaction: -250,050.00 kr ≈ -$39,257.85 USD
    // USD transaction: $39,257.85 USD (equivalent amount)
    
    const dkkTransaction: Transaction = {
      id: 'dkk-tx-1',
      date: new Date('2024-08-26'),
      description: 'Via ofx to 1stTech',
      amount: -250050.00, // DKK amount (will be converted to USD)
      category: 'Internal Transfer',
      account: 'Danske Individual',
      type: 'transfer',
      originalCurrency: 'DKK',
      // Note: No exchangeRate - let the service convert it
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const usdTransaction: Transaction = {
      id: 'usd-tx-1', 
      date: new Date('2024-08-26'),
      description: 'ACH Deposit MICHAEL JOSEPH M - TRANSFER V RMR*IK*TRANSFER VIA OFX* - First Tech Checking',
      amount: 39257.85, // USD equivalent amount (positive for deposit)
      category: 'Internal Transfer',
      account: 'First Tech Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    // Convert both to USD for comparison
    const dkkConverted = await currencyDisplayService.convertTransactionAmount(dkkTransaction);
    const usdConverted = await currencyDisplayService.convertTransactionAmount(usdTransaction);

    console.log('DKK transaction original amount:', dkkTransaction.amount);
    console.log('DKK converted to USD:', dkkConverted.amount);
    console.log('USD transaction amount:', usdTransaction.amount);
    console.log('USD converted (should be same):', usdConverted.amount);

    // The converted amounts should be very similar (opposite signs for transfer)
    const dkkAbsConverted = Math.abs(dkkConverted.amount);
    const usdAbsConverted = Math.abs(usdConverted.amount);
    const difference = Math.abs(dkkAbsConverted - usdAbsConverted);
    const avgAmount = (dkkAbsConverted + usdAbsConverted) / 2;
    const percentageDiff = avgAmount > 0 ? (difference / avgAmount) : 1;

    console.log('Absolute difference:', difference);
    console.log('Average amount:', avgAmount);
    console.log('Percentage difference:', percentageDiff);

    // With proper currency conversion, the difference should be minimal (< 1%)
    expect(percentageDiff).toBeLessThan(0.01);
    
    // Verify the converted amounts have opposite signs (one positive, one negative)
    expect((dkkConverted.amount > 0) !== (usdConverted.amount > 0)).toBe(true);
  });

  it('should handle currency conversion errors gracefully', async () => {
    const invalidCurrencyTransaction: Transaction = {
      id: 'invalid-tx-1',
      date: new Date('2024-08-26'),
      description: 'Test transaction',
      amount: -1000.00,
      category: 'Internal Transfer',
      account: 'Test Account',
      type: 'transfer',
      originalCurrency: 'INVALID', // Invalid currency code
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    // Should not throw, should fallback gracefully
    const converted = await currencyDisplayService.convertTransactionAmount(invalidCurrencyTransaction);
    expect(converted).toBeDefined();
    expect(typeof converted.amount).toBe('number');
  });

  it('should identify same currency transactions correctly', async () => {
    const usdTransaction1: Transaction = {
      id: 'usd-tx-1',
      date: new Date('2024-08-26'),
      description: 'USD Transfer Out',
      amount: -1000.00,
      category: 'Internal Transfer',
      account: 'USD Account 1',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const usdTransaction2: Transaction = {
      id: 'usd-tx-2',
      date: new Date('2024-08-26'),
      description: 'USD Transfer In',
      amount: 1000.00,
      category: 'Internal Transfer',
      account: 'USD Account 2', 
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: false
    };

    const converted1 = await currencyDisplayService.convertTransactionAmount(usdTransaction1);
    const converted2 = await currencyDisplayService.convertTransactionAmount(usdTransaction2);

    // Both should be in USD (no conversion needed)
    expect(converted1.isConverted).toBe(false);
    expect(converted2.isConverted).toBe(false);
    
    // Amounts should match exactly (opposite signs)
    expect(Math.abs(converted1.amount)).toBe(Math.abs(converted2.amount));
    expect((converted1.amount > 0) !== (converted2.amount > 0)).toBe(true);
  });
});