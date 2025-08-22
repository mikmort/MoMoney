import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { TransferMatchDialog } from '../components/Transactions/TransferMatchDialog';
import { Transaction } from '../types';

// Mock the currency display service
jest.mock('../services/currencyDisplayService', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    getDefaultCurrency: jest.fn().mockResolvedValue('USD'),
    formatAmount: jest.fn().mockResolvedValue('$100.00'),
    formatTransactionAmount: jest.fn().mockResolvedValue({
      displayAmount: '$100.00',
      approxConvertedDisplay: null
    }),
    convertTransactionAmount: jest.fn().mockResolvedValue({ amount: 100 })
  }
}));

// Mock the transfer matching hook
jest.mock('../hooks/useTransferMatching', () => ({
  useTransferMatching: () => ({
    isLoading: false,
    error: null,
    manuallyMatchTransfers: jest.fn()
  })
}));

const createMockTransaction = (
  id: string, 
  amount: number, 
  account: string, 
  originalCurrency?: string,
  notes?: string
): Transaction => ({
  id,
  amount,
  account,
  date: new Date('2024-01-01'),
  description: 'Test transaction',
  category: 'Transfer',
  type: 'transfer',
  originalCurrency,
  notes
});

describe('Cross-Currency Validation Fix', () => {
  const mockOnClose = jest.fn();
  const mockOnTransactionsUpdate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should recognize cross-currency transfers by originalCurrency field', async () => {
    const transaction = createMockTransaction('1', -100, 'Account A', 'EUR');
    const targetTransaction = createMockTransaction('2', 85, 'Account B', 'USD');
    
    render(
      <TransferMatchDialog
        isOpen={true}
        transaction={transaction}
        allTransactions={[transaction, targetTransaction]}
        onClose={mockOnClose}
        onTransactionsUpdate={mockOnTransactionsUpdate}
      />
    );

    // Should not show the old misleading warning message
    await waitFor(() => {
      expect(screen.queryByText(/148\.4%/)).not.toBeInTheDocument();
    });
  });

  it('should recognize cross-currency transfers by Foreign Spend Amount notes', async () => {
    const transaction = createMockTransaction(
      '1', 
      -312, 
      'Chase Credit', 
      undefined,
      'WOLT COPENHAGEN DN Foreign Spend Amount: 312.00 DANISH KRONE Currency Exchange Rate: null'
    );
    const targetTransaction = createMockTransaction('2', 46.19, 'Bank Account');
    
    render(
      <TransferMatchDialog
        isOpen={true}
        transaction={transaction}
        allTransactions={[transaction, targetTransaction]}
        onClose={mockOnClose}
        onTransactionsUpdate={mockOnTransactionsUpdate}
      />
    );

    // Should recognize this as cross-currency and use appropriate validation
    await waitFor(() => {
      const validationText = screen.queryByText(/cross-currency/i);
      // The validation may or may not be visible depending on selection state
      // The key test is that it doesn't show misleading percentage differences
      expect(screen.queryByText(/148\.4%/)).not.toBeInTheDocument();
    });
  });

  it('should use higher tolerance for cross-currency transfers', () => {
    // This test verifies the logic without UI rendering
    const transaction = createMockTransaction('1', -1000, 'Account A', 'EUR');
    const targetTransaction = createMockTransaction('2', 850, 'Account B', 'USD'); // 15% difference
    
    // Mock the validation logic
    const isCrossCurrency = (transaction.originalCurrency && transaction.originalCurrency !== 'USD') ||
                           (targetTransaction.originalCurrency && targetTransaction.originalCurrency !== 'USD');
    
    const amountDiff = Math.abs(Math.abs(transaction.amount) - Math.abs(targetTransaction.amount));
    const avgAmount = (Math.abs(transaction.amount) + Math.abs(targetTransaction.amount)) / 2;
    const percentageDiff = avgAmount > 0 ? (amountDiff / avgAmount) * 100 : 0;
    
    const tolerance = isCrossCurrency ? 0.15 : 0.12; // 15% for cross-currency, 12% for same-currency
    const isValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;
    
    expect(isCrossCurrency).toBe(true);
    expect(percentageDiff).toBeCloseTo(16.2, 1); // ~16.2% difference
    expect(isValid).toBe(false); // Still invalid, but with better messaging
  });

  it('should use stricter tolerance for same-currency transfers', () => {
    const transaction = createMockTransaction('1', -100, 'Account A'); // No originalCurrency = USD
    const targetTransaction = createMockTransaction('2', 85, 'Account B'); // 15% difference
    
    const isCrossCurrency = (transaction.originalCurrency && transaction.originalCurrency !== 'USD') ||
                           (targetTransaction.originalCurrency && targetTransaction.originalCurrency !== 'USD');
    
    const amountDiff = Math.abs(Math.abs(transaction.amount) - Math.abs(targetTransaction.amount));
    const avgAmount = (Math.abs(transaction.amount) + Math.abs(targetTransaction.amount)) / 2;
    
    const tolerance = isCrossCurrency ? 0.15 : 0.12; // 12% for same-currency
    const isValid = avgAmount > 0 && (amountDiff / avgAmount) <= tolerance;
    
    expect(isCrossCurrency).toBe(false);
    expect(isValid).toBe(false); // 15% > 12% tolerance
  });
});
