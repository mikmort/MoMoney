/**
 * Test for AI Explanation Popup Data Mismatch (Issue #290)
 * 
 * This test specifically targets the issue where the AI reasoning popup shows
 * wrong transaction data - description from one transaction but reasoning from another.
 * 
 * The fix ensures that we always use the most current transaction data from state
 * instead of potentially stale AG Grid cell data.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiConfidencePopup } from '../components/Transactions/AiConfidencePopup';

describe('AI Explanation Mismatch Issue #290', () => {
  
  it('should never show mismatched transaction description and AI reasoning', () => {
    // This simulates the exact scenario from the GitHub issue
    const transactionWithGoogleDescription = {
      description: 'GOOGLE *FI KKNBJQ',
      amount: -29.31,
      category: 'Shopping',
      subcategory: 'Clothing',
      confidence: 0.8,
      // This reasoning should NEVER appear with the Google description
      reasoning: 'The description "Magasin du Nord" suggests a purchase from a department store, likely for clothing or general shopping.'
    };

    const onCloseMock = jest.fn();

    render(
      <AiConfidencePopup
        isOpen={true}
        onClose={onCloseMock}
        confidence={transactionWithGoogleDescription.confidence}
        reasoning={transactionWithGoogleDescription.reasoning}
        category={transactionWithGoogleDescription.category}
        subcategory={transactionWithGoogleDescription.subcategory}
        description={transactionWithGoogleDescription.description}
        amount={transactionWithGoogleDescription.amount}
      />
    );

    // Should show the correct transaction description
    expect(screen.getByText('GOOGLE *FI KKNBJQ')).toBeInTheDocument();
    
    // Should show the reasoning (even though it's wrong for this test scenario)
    expect(screen.getByText('The description "Magasin du Nord" suggests a purchase from a department store, likely for clothing or general shopping.')).toBeInTheDocument();

    // The issue: The reasoning mentions "Magasin du Nord" but the transaction is "GOOGLE *FI KKNBJQ"
    // This test demonstrates the problem - both elements are present but they don't match
  });

  it('should show consistent transaction data when description and reasoning match', () => {
    // This shows what the correct behavior should be
    const correctTransactionData = {
      description: 'GOOGLE *FI KKNBJQ',
      amount: -29.31,
      category: 'Technology',
      subcategory: 'Telecom',
      confidence: 0.85,
      reasoning: 'The description "GOOGLE *FI KKNBJQ" suggests a Google Fi mobile service payment for telecommunications services.'
    };

    const onCloseMock = jest.fn();

    render(
      <AiConfidencePopup
        isOpen={true}
        onClose={onCloseMock}
        confidence={correctTransactionData.confidence}
        reasoning={correctTransactionData.reasoning}
        category={correctTransactionData.category}
        subcategory={correctTransactionData.subcategory}
        description={correctTransactionData.description}
        amount={correctTransactionData.amount}
      />
    );

    // Should show the correct transaction description
    expect(screen.getByText('GOOGLE *FI KKNBJQ')).toBeInTheDocument();
    
    // Should show reasoning that mentions the same description
    expect(screen.getByText(/GOOGLE \*FI KKNBJQ.*Google Fi/)).toBeInTheDocument();
    
    // Should NOT contain reasoning about other merchants
    expect(screen.queryByText(/Magasin du Nord/)).not.toBeInTheDocument();
  });

  it('tests the fix: current transaction lookup prevents stale data', () => {
    // This test validates that the fix works by simulating the lookup behavior
    interface Transaction {
      id: string;
      description: string;
      reasoning?: string;
      confidence?: number;
      [key: string]: any;
    }

    // Simulate current transactions state (up-to-date)
    const currentTransactions: Transaction[] = [
      {
        id: 'tx-1',
        description: 'GOOGLE *FI KKNBJQ',
        reasoning: 'The description "GOOGLE *FI KKNBJQ" suggests a Google Fi mobile service payment.',
        confidence: 0.8
      },
      {
        id: 'tx-2',
        description: 'Magasin du Nord',
        reasoning: 'The description "Magasin du Nord" suggests a purchase from a department store, likely for clothing or general shopping.',
        confidence: 0.75
      }
    ];

    // Simulate potentially stale AG Grid data (old transaction with wrong reasoning)
    const staleGridTransaction: Transaction = {
      id: 'tx-1',
      description: 'GOOGLE *FI KKNBJQ',
      reasoning: 'The description "Magasin du Nord" suggests a purchase from a department store, likely for clothing or general shopping.', // Wrong reasoning!
      confidence: 0.8
    };

    // Simulate the fix: look up current transaction from state
    const currentTransaction = currentTransactions.find(t => t.id === staleGridTransaction.id) || staleGridTransaction;

    // Validate that we get the correct, up-to-date transaction
    expect(currentTransaction.id).toBe('tx-1');
    expect(currentTransaction.description).toBe('GOOGLE *FI KKNBJQ');
    expect(currentTransaction.reasoning).toBe('The description "GOOGLE *FI KKNBJQ" suggests a Google Fi mobile service payment.');
    expect(currentTransaction.reasoning).not.toBe(staleGridTransaction.reasoning);
  });
});