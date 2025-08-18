import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransferMatchesPage } from '../components/Transactions/TransferMatchesPage';
import { currencyDisplayService } from '../services/currencyDisplayService';
import { currencyExchangeService } from '../services/currencyExchangeService';
import { userPreferencesService } from '../services/userPreferencesService';
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

// Mock services
jest.mock('../services/currencyDisplayService');
jest.mock('../services/currencyExchangeService');
jest.mock('../services/userPreferencesService');
jest.mock('../services/dataService');
jest.mock('../hooks/useTransferMatching');

// Mock the useTransferMatching hook
import { useTransferMatching } from '../hooks/useTransferMatching';
const mockUseTransferMatching = useTransferMatching as jest.MockedFunction<typeof useTransferMatching>;

describe('TransferMatchesPage Currency Validation', () => {
  const mockDkkTransaction: Transaction = {
    id: 'dkk-tx-1',
    date: new Date('2024-08-26'),
    description: 'Via ofx to 1stTech',
    amount: -250050.00,
    category: 'Internal Transfer',
    account: 'Danske Individual', 
    type: 'transfer',
    originalCurrency: 'DKK',
    addedDate: new Date(),
    lastModifiedDate: new Date(),
    isVerified: false
  };

  const mockUsdTransaction: Transaction = {
    id: 'usd-tx-1',
    date: new Date('2024-08-26'),
    description: 'ACH Deposit MICHAEL JOSEPH M',
    amount: 39257.85,
    category: 'Internal Transfer',
    account: 'First Tech Checking',
    type: 'transfer',
    addedDate: new Date(),
    lastModifiedDate: new Date(),
    isVerified: false
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock user preferences
    (userPreferencesService.getDefaultCurrency as jest.Mock).mockResolvedValue('USD');
    (userPreferencesService.getCurrencySymbol as jest.Mock).mockImplementation((currency: string) => {
      const symbols: { [key: string]: string } = { 'USD': '$', 'DKK': 'kr', 'EUR': '€', 'GBP': '£' };
      return symbols[currency] || '$';
    });

    // Mock currency exchange service
    (currencyExchangeService.convertAmount as jest.Mock).mockImplementation(async (amount: number, from: string, to: string) => {
      if (from === to) return { convertedAmount: amount, rate: 1 };
      if (from === 'DKK' && to === 'USD') return { convertedAmount: amount / 6.37, rate: 1/6.37 };
      return null;
    });

    // Mock currency display service methods
    (currencyDisplayService.initialize as jest.Mock).mockResolvedValue(undefined);
    (currencyDisplayService.convertTransactionAmount as jest.Mock).mockImplementation(async (transaction: Transaction) => {
      if (transaction.originalCurrency === 'DKK') {
        return {
          amount: transaction.amount / 6.37, // Convert DKK to USD
          originalAmount: transaction.amount,
          originalCurrency: 'DKK',
          exchangeRate: 1/6.37,
          isConverted: true
        };
      } else {
        return {
          amount: transaction.amount,
          isConverted: false
        };
      }
    });
    (currencyDisplayService.formatAmount as jest.Mock).mockImplementation(async (amount: number) => `$${Math.abs(amount).toFixed(2)}`);
    (currencyDisplayService.formatTransactionAmount as jest.Mock).mockImplementation(async (transaction: Transaction) => ({
      displayAmount: transaction.originalCurrency === 'DKK' 
        ? `${Math.abs(transaction.amount).toLocaleString()} kr` 
        : `$${Math.abs(transaction.amount).toFixed(2)}`,
      isConverted: !!transaction.originalCurrency
    }));

    // Mock data service
    (dataService.getAllTransactions as jest.Mock).mockResolvedValue([mockDkkTransaction, mockUsdTransaction]);
    (dataService.updateTransaction as jest.Mock).mockResolvedValue(undefined);

    // Mock useTransferMatching hook
    mockUseTransferMatching.mockReturnValue({
      isLoading: false,
      error: null,
      findTransferMatches: jest.fn(),
      applyTransferMatches: jest.fn(),
      unmatchTransfers: jest.fn(),
      getMatchedTransfers: jest.fn().mockReturnValue([]),
      manuallyMatchTransfers: jest.fn(),
      getUnmatchedTransfers: jest.fn().mockImplementation((transactions) => 
        transactions.filter((t: Transaction) => !t.reimbursementId)
      )
    });
  });

  it('should show proper validation after currency conversion for manual match', async () => {
    render(<TransferMatchesPage />);
    
    // Wait for component to load
    await waitFor(() => {
      expect(screen.getByText('Transfer Matches')).toBeInTheDocument();
    });

    // Click to show manual match section
    fireEvent.click(screen.getByText('Show Manual Match'));
    
    await waitFor(() => {
      expect(screen.getByText('Source Transaction')).toBeInTheDocument();
    });

    // Find and select the dropdowns
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThanOrEqual(2);

    // Select DKK transaction as source
    fireEvent.change(selects[0], { target: { value: 'dkk-tx-1' } });

    // Select USD transaction as target
    fireEvent.change(selects[1], { target: { value: 'usd-tx-1' } });

    // Wait for validation to complete
    await waitFor(() => {
      // Should show valid transfer match message, not the currency error
      const validationMessage = screen.getByText(/Transfer match:/);
      expect(validationMessage).toBeInTheDocument();
      expect(validationMessage.textContent).not.toContain('213016.25'); // Should not show the raw currency difference
      expect(validationMessage.textContent).not.toContain('148.4%'); // Should not show huge percentage difference
    }, { timeout: 3000 });

    // The Match button should be enabled
    const matchButton = screen.getByText('Match');
    expect(matchButton).not.toBeDisabled();
  });

  it('should handle currency conversion errors gracefully', async () => {
    // Mock currency conversion to fail
    (currencyDisplayService.convertTransactionAmount as jest.Mock).mockRejectedValue(new Error('Conversion failed'));
    
    render(<TransferMatchesPage />);
    
    await waitFor(() => {
      expect(screen.getByText('Transfer Matches')).toBeInTheDocument();
    });

    // Click to show manual match section  
    fireEvent.click(screen.getByText('Show Manual Match'));
    
    await waitFor(() => {
      expect(screen.getByText('Source Transaction')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'dkk-tx-1' } });
    fireEvent.change(selects[1], { target: { value: 'usd-tx-1' } });

    // Should show fallback message indicating currency conversion failed
    await waitFor(() => {
      const errorMessage = screen.getByText(/Currency conversion failed/);
      expect(errorMessage).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});