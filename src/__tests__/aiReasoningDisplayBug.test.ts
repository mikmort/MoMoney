/**
 * Test for AI reasoning display bug - Issue #304
 * 
 * Problem: AI reasoning popup shows data from wrong transaction record
 * When clicking the info icon (ℹ️) next to AI confidence, the popup can show
 * reasoning from a different transaction than the one clicked.
 */

import { Transaction } from '../types';

describe('AI Reasoning Display Bug - Issue #304', () => {
  // Sample transactions that could cause the bug
  const mockTransactions: Transaction[] = [
    {
      id: 'trans-1',
      date: '2024-01-15',
      description: 'SAS 1172533450425',
      amount: -67.33,
      account: 'Chase Credit',
      category: 'Uncategorized',
      confidence: 0.95,
      reasoning: 'The transaction appears to be from SAS Airlines, likely a flight booking or travel expense.',
      currency: 'USD',
      exchangeRate: 1,
      originalAmount: -67.33,
      originalCurrency: 'USD'
    },
    {
      id: 'trans-2', 
      date: '2024-01-16',
      description: 'Hotel Tylosand Front Offi',
      amount: -245.67,
      account: 'Chase Credit',
      category: 'Travel',
      confidence: 0.88,
      reasoning: 'The description \'Hotel Tylosand Front Offi\' and the amount suggest a hotel stay.',
      currency: 'USD',
      exchangeRate: 1,
      originalAmount: -245.67,
      originalCurrency: 'USD'
    }
  ];

  it('should return the correct transaction when looking up by ID', () => {
    // Simulate the transaction lookup logic from ConfidenceCellRenderer
    const gridTransaction = mockTransactions[0]; // SAS transaction
    const transactions = mockTransactions;
    
    // This is the current logic in the code
    const currentTransaction = transactions.find(t => t.id === gridTransaction.id) || gridTransaction;
    
    // The correct transaction should be returned
    expect(currentTransaction.id).toBe('trans-1');
    expect(currentTransaction.description).toBe('SAS 1172533450425');
    expect(currentTransaction.reasoning).toBe('The transaction appears to be from SAS Airlines, likely a flight booking or travel expense.');
    
    // Should NOT have the Hotel Tylosand reasoning
    expect(currentTransaction.reasoning).not.toContain('Hotel Tylosand Front Offi');
  });

  it('should handle the case where transaction ID lookup fails', () => {
    const gridTransaction = mockTransactions[0]; // SAS transaction
    const transactions = mockTransactions;
    
    // Simulate a scenario where the ID doesn't match (potential cause of the bug)
    const modifiedGridTransaction = { ...gridTransaction, id: 'wrong-id' };
    
    // Current logic would fall back to gridTransaction
    const currentTransaction = transactions.find(t => t.id === modifiedGridTransaction.id) || modifiedGridTransaction;
    
    // This could be the source of the bug - if gridTransaction has stale data
    expect(currentTransaction.id).toBe('wrong-id');
  });

  it('should validate transaction data integrity before displaying popup', () => {
    const gridTransaction = mockTransactions[0]; // SAS transaction
    const transactions = mockTransactions;
    
    // Simulate improved logic that validates the data
    const foundTransaction = transactions.find(t => t.id === gridTransaction.id);
    
    if (!foundTransaction) {
      // Should not proceed with stale data
      expect(foundTransaction).toBeUndefined();
    } else {
      // Should have matching description and reasoning
      expect(foundTransaction.description).toBe(gridTransaction.description);
      expect(foundTransaction.reasoning).toBeDefined();
      
      // Reasoning should match the description
      if (foundTransaction.description.includes('SAS')) {
        expect(foundTransaction.reasoning).not.toContain('Hotel Tylosand');
      }
      if (foundTransaction.description.includes('Hotel Tylosand')) {
        expect(foundTransaction.reasoning).toContain('Hotel Tylosand');
      }
    }
  });

  it('should not show popup with mismatched transaction data', () => {
    // Simulate the exact bug scenario from the issue
    const displayedTransaction = {
      id: 'trans-1',
      description: 'SAS 1172533450425',
      amount: -67.33,
      category: 'Uncategorized',
      // This is the bug - wrong reasoning for this transaction
      reasoning: 'The description \'Hotel Tylosand Front Offi\' and the amount suggest a hotel stay.'
    };
    
    // This should be detected as invalid data
    const isValidData = displayedTransaction.reasoning.includes(displayedTransaction.description.split(' ')[0]);
    
    // The bug is that this validation doesn't happen
    expect(isValidData).toBe(false); // This demonstrates the bug exists
  });

  it('should ensure reasoning matches the transaction description', () => {
    const transactions = mockTransactions;
    
    // Validate each transaction has matching reasoning
    transactions.forEach(transaction => {
      const keyDescriptionWord = transaction.description.split(' ')[0].toLowerCase();
      const reasoningLower = transaction.reasoning?.toLowerCase() || '';
      
      // For SAS transaction, reasoning should not mention Hotel
      if (keyDescriptionWord === 'sas') {
        expect(reasoningLower).not.toContain('hotel');
        expect(reasoningLower).not.toContain('tylosand');
      }
      
      // For Hotel transaction, reasoning should not mention SAS
      if (keyDescriptionWord === 'hotel') {
        expect(reasoningLower).not.toContain('sas');
        expect(reasoningLower).toContain('hotel');
      }
    });
  });
});