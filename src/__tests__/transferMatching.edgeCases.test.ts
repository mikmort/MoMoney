import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transfer Matching - Edge Cases and Scenarios', () => {
  
  it('should handle the exact scenario from the issue (Chase transactions)', async () => {
    const transactions: Transaction[] = [
      {
        id: 'ach-debit-chase',
        date: new Date('2025-06-16'),
        amount: -316.72,
        description: 'ACH Debit CHASE CREDIT',
        category: 'Transfer',
        account: 'Bank of America',
        type: 'transfer'
      } as Transaction,
      {
        id: 'auto-payment-chase',
        date: new Date('2025-06-13'),
        amount: 316.72,
        description: 'AUTOMATIC PAYMENT - Chase Checking',
        category: 'Transfer',
        account: 'Chase Checking',
        type: 'transfer'
      } as Transaction
    ];

    const result = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].sourceTransactionId).toBe('ach-debit-chase');
    expect(result.matches[0].targetTransactionId).toBe('auto-payment-chase');
    expect(result.matches[0].amountDifference).toBe(0);
    expect(result.matches[0].dateDifference).toBe(3);
    expect(result.unmatched).toHaveLength(0);
  });

  it('should handle exact amount matches with different date ranges', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        date: new Date('2025-01-01'),
        amount: -100.00,
        description: 'Transfer Out',
        category: 'Transfer',
        account: 'Checking',
        type: 'transfer'
      } as Transaction,
      {
        id: 'tx2', 
        date: new Date('2025-01-03'),
        amount: 100.00,
        description: 'Transfer In',
        category: 'Transfer',
        account: 'Savings',
        type: 'transfer'
      } as Transaction
    ];

    // Should match with 7 day window
    const result1 = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });
    expect(result1.matches).toHaveLength(1);

    // Should not match with 1 day window  
    const result2 = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 1,
      tolerancePercentage: 0.01
    });
    expect(result2.matches).toHaveLength(0);
  });

  it('should not match transactions from the same account', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        date: new Date('2025-01-01'),
        amount: -100.00,
        description: 'Transfer Out',
        category: 'Transfer',
        account: 'Checking',
        type: 'transfer'
      } as Transaction,
      {
        id: 'tx2',
        date: new Date('2025-01-01'),
        amount: 100.00,
        description: 'Transfer In', 
        category: 'Transfer',
        account: 'Checking', // Same account
        type: 'transfer'
      } as Transaction
    ];

    const result = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(0);
    expect(result.unmatched).toHaveLength(2);
  });

  it('should handle amount tolerance correctly', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        date: new Date('2025-01-01'),
        amount: -100.00,
        description: 'Transfer Out',
        category: 'Transfer',
        account: 'Checking',
        type: 'transfer'
      } as Transaction,
      {
        id: 'tx2',
        date: new Date('2025-01-01'),
        amount: 100.50, // 0.5% difference
        description: 'Transfer In',
        category: 'Transfer',
        account: 'Savings',
        type: 'transfer'
      } as Transaction
    ];

    // Should match with 1% tolerance
    const result1 = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });
    expect(result1.matches).toHaveLength(1);

    // Should not match with 0.1% tolerance
    const result2 = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.001
    });
    expect(result2.matches).toHaveLength(0);
  });

  it('should not match already matched transactions', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx1',
        date: new Date('2025-01-01'),
        amount: -100.00,
        description: 'Transfer Out',
        category: 'Transfer',
        account: 'Checking',
        type: 'transfer',
        reimbursementId: 'tx2' // Already matched
      } as Transaction,
      {
        id: 'tx2',
        date: new Date('2025-01-01'),
        amount: 100.00,
        description: 'Transfer In',
        category: 'Transfer',
        account: 'Savings',
        type: 'transfer',
        reimbursementId: 'tx1' // Already matched
      } as Transaction
    ];

    const result = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(0);
    expect(result.unmatched).toHaveLength(0); // Should not include already matched
  });

  it('should match multiple transfer pairs correctly', async () => {
    const transactions: Transaction[] = [
      // First pair
      {
        id: 'tx1',
        date: new Date('2025-01-01'),
        amount: -100.00,
        description: 'Transfer Out 1',
        category: 'Transfer',
        account: 'Checking',
        type: 'transfer'
      } as Transaction,
      {
        id: 'tx2',
        date: new Date('2025-01-01'),
        amount: 100.00,
        description: 'Transfer In 1',
        category: 'Transfer',
        account: 'Savings',
        type: 'transfer'
      } as Transaction,
      // Second pair  
      {
        id: 'tx3',
        date: new Date('2025-01-02'),
        amount: -200.00,
        description: 'Transfer Out 2',
        category: 'Transfer',
        account: 'Credit Card',
        type: 'transfer'
      } as Transaction,
      {
        id: 'tx4',
        date: new Date('2025-01-02'),
        amount: 200.00,
        description: 'Transfer In 2',
        category: 'Transfer',
        account: 'Investment',
        type: 'transfer'
      } as Transaction
    ];

    const result = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(2);
    expect(result.unmatched).toHaveLength(0);
  });
});