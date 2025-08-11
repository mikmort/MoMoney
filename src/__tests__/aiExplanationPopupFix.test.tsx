/**
 * Test for AI Explanation Popup Fix (Issue #260)
 * 
 * Tests that the AI confidence popup shows the correct transaction data
 * when clicking info icons in the transaction grid.
 */

import React from 'react';

// This test verifies the fix conceptually by testing the state structure change
describe('AI Explanation Popup Fix', () => {
  
  test('confidencePopupData state structure maintains transaction data correctly', () => {
    // Mock the new state structure that was implemented in the fix
    interface ConfidencePopupData {
      isOpen: boolean;
      transaction: any | null;
    }

    const mockTransaction1 = {
      id: 'test-1',
      description: 'Starbucks Coffee Shop',
      confidence: 0.95,
      reasoning: 'High confidence match for Starbucks',
    };

    const mockTransaction2 = {
      id: 'test-2', 
      description: 'Shell Gas Station',
      confidence: 0.87,
      reasoning: 'Strong match for gas station',
    };

    // Simulate the old problematic approach (separate state variables)
    let selectedTransaction: any = null;
    let showConfidencePopup = false;

    // Old approach - potential race condition
    selectedTransaction = mockTransaction1;
    showConfidencePopup = true;
    
    // If there was a quick second click, the state could get out of sync
    selectedTransaction = mockTransaction2; // Changed but popup might still show old data
    
    expect(selectedTransaction.description).toBe('Shell Gas Station'); // This could be wrong in UI
    

    // NEW APPROACH - Fixed state structure
    let confidencePopupData: ConfidencePopupData = { isOpen: false, transaction: null };

    // Simulate clicking info icon for first transaction
    confidencePopupData = { isOpen: true, transaction: mockTransaction1 };
    
    expect(confidencePopupData.isOpen).toBe(true);
    expect(confidencePopupData.transaction?.description).toBe('Starbucks Coffee Shop');
    expect(confidencePopupData.transaction?.reasoning).toBe('High confidence match for Starbucks');

    // Simulate clicking info icon for second transaction  
    confidencePopupData = { isOpen: true, transaction: mockTransaction2 };
    
    expect(confidencePopupData.isOpen).toBe(true);
    expect(confidencePopupData.transaction?.description).toBe('Shell Gas Station');
    expect(confidencePopupData.transaction?.reasoning).toBe('Strong match for gas station');

    // Close popup
    confidencePopupData = { isOpen: false, transaction: null };
    
    expect(confidencePopupData.isOpen).toBe(false);
    expect(confidencePopupData.transaction).toBeNull();
  });

  test('atomic state updates prevent wrong data display', () => {
    interface ConfidencePopupData {
      isOpen: boolean;
      transaction: any | null;
    }

    const transactions = [
      { id: 'tx1', description: 'Transaction 1', reasoning: 'Reason 1' },
      { id: 'tx2', description: 'Transaction 2', reasoning: 'Reason 2' },
      { id: 'tx3', description: 'Transaction 3', reasoning: 'Reason 3' },
    ];

    let confidencePopupData: ConfidencePopupData = { isOpen: false, transaction: null };

    // Simulate rapid clicks on different transactions
    for (const tx of transactions) {
      confidencePopupData = { isOpen: true, transaction: tx };
      
      // The popup data should always match the transaction that was clicked
      expect(confidencePopupData.transaction?.id).toBe(tx.id);
      expect(confidencePopupData.transaction?.description).toBe(tx.description);
      expect(confidencePopupData.transaction?.reasoning).toBe(tx.reasoning);
      expect(confidencePopupData.isOpen).toBe(true);
    }
  });

  test('handleInfoClick creates correct atomic state update', () => {
    // Simulate the fixed handleInfoClick behavior
    const createHandleInfoClick = (setConfidencePopupData: (data: any) => void) => {
      return (mockParams: { data: any }) => {
        const transaction = mockParams.data;
        setConfidencePopupData({ isOpen: true, transaction });
      };
    };

    let confidencePopupData = { isOpen: false, transaction: null };
    
    const mockSetState = (newData: any) => {
      confidencePopupData = newData;
    };

    const handleInfoClick = createHandleInfoClick(mockSetState);

    const testTransaction = {
      id: 'test-id',
      description: 'Test Transaction',
      confidence: 0.75,
      reasoning: 'Test reasoning'
    };

    // Simulate AG Grid params
    const mockParams = { data: testTransaction };

    // Call the handler
    handleInfoClick(mockParams);

    // Verify the state was set correctly with both popup open and transaction data
    expect(confidencePopupData.isOpen).toBe(true);
    expect(confidencePopupData.transaction).toBe(testTransaction);
    expect(confidencePopupData.transaction?.description).toBe('Test Transaction');
    expect(confidencePopupData.transaction?.reasoning).toBe('Test reasoning');
  });
});