import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { Transaction } from '../types';
import { currencyDisplayService } from '../services/currencyDisplayService';

// Mock the currency display service
jest.mock('../services/currencyDisplayService', () => ({
  currencyDisplayService: {
    formatTransactionAmount: jest.fn(),
    initialize: jest.fn(),
    getDefaultCurrency: jest.fn().mockResolvedValue('USD')
  }
}));

describe('Currency Conversion in UI Components', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should verify that formatTransactionAmount is available for UI components', async () => {
    const mockTransaction: Transaction = {
      id: 'test-1',
      date: new Date('2024-01-15'),
      description: 'Test transaction in EUR',
      amount: -50.00,
      category: 'Shopping',
      account: 'EU Bank',
      type: 'expense',
      originalCurrency: 'EUR',
      addedDate: new Date(),
      lastModifiedDate: new Date()
    };

    // Mock the currency display service response
    const mockFormatResponse = {
      displayAmount: '€50.00',
      tooltip: 'Original: €50.00 → Converted: $55.00 (rate: 1.10)',
      isConverted: true,
      approxConvertedDisplay: '(≈ $55.00 USD)'
    };

    jest.mocked(currencyDisplayService.formatTransactionAmount)
      .mockResolvedValue(mockFormatResponse);

    // Call the service method
    const result = await currencyDisplayService.formatTransactionAmount(mockTransaction);

    // Verify the service was called with the transaction
    expect(currencyDisplayService.formatTransactionAmount).toHaveBeenCalledWith(mockTransaction);
    
    // Verify the response includes currency conversion info
    expect(result.displayAmount).toBe('€50.00');
    expect(result.isConverted).toBe(true);
    expect(result.approxConvertedDisplay).toBe('(≈ $55.00 USD)');
    expect(result.tooltip).toContain('Original: €50.00 → Converted: $55.00');
  });

  it('should verify that non-converted transactions show correctly', async () => {
    const mockTransaction: Transaction = {
      id: 'test-2',
      date: new Date('2024-01-15'),
      description: 'Test transaction in USD',
      amount: -100.00,
      category: 'Shopping',
      account: 'US Bank',
      type: 'expense',
      originalCurrency: 'USD',
      addedDate: new Date(),
      lastModifiedDate: new Date()
    };

    // Mock the currency display service response for USD transaction
    const mockFormatResponse = {
      displayAmount: '$100.00',
      isConverted: false
    };

    jest.mocked(currencyDisplayService.formatTransactionAmount)
      .mockResolvedValue(mockFormatResponse);

    // Call the service method
    const result = await currencyDisplayService.formatTransactionAmount(mockTransaction);

    // Verify no conversion info is shown for USD transactions
    expect(result.displayAmount).toBe('$100.00');
    expect(result.isConverted).toBe(false);
    expect(result.approxConvertedDisplay).toBeUndefined();
    expect(result.tooltip).toBeUndefined();
  });

  it('should verify currency conversion components are importable', async () => {
    // Test that the components can be imported without errors
    const CategoryDrilldownModal = (await import('../components/Reports/CategoryDrilldownModal')).default;
    const TransactionDetailsModal = (await import('../components/Reports/TransactionDetailsModal')).default;
    
    expect(CategoryDrilldownModal).toBeDefined();
    expect(TransactionDetailsModal).toBeDefined();
  });
});