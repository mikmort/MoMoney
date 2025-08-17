import { Transaction } from '../types';
import { transferMatchingService } from '../services/transferMatchingService';

describe('Duplicate Transfer Matches Issue #485', () => {
  it('should not show duplicate matches for the same transaction pair', async () => {
    // Create test data that reproduces the issue from the screenshot
    const transactions: Transaction[] = [
      {
        id: 'schwab-tx-1',
        date: new Date('2025-06-09'),
        description: 'FID BKG SVC LLC MONEYLINE 250609',
        amount: 46110.64, // Positive amount (incoming transfer)
        category: 'Internal Transfer',
        account: 'Schwab Checking 691',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'fidelity-tx-1', 
        date: new Date('2025-06-09'),
        description: 'Electronic Funds Transfer Paid (Cash)',
        amount: -46110.64, // Negative amount (outgoing transfer)
        category: 'Internal Transfer',
        account: 'Fidelity Individual',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    // Find manual transfer matches (this should reproduce the bug)
    const result = await transferMatchingService.findManualTransferMatches({
      transactions,
      maxDaysDifference: 8,
      tolerancePercentage: 0.12
    });

    console.log(`Found ${result.matches.length} matches:`);
    result.matches.forEach((match, index) => {
      const sourceTx = transactions.find(t => t.id === match.sourceTransactionId);
      const targetTx = transactions.find(t => t.id === match.targetTransactionId);
      console.log(`  Match ${index + 1}: ${sourceTx?.account} (${sourceTx?.amount}) ↔ ${targetTx?.account} (${targetTx?.amount}) - Confidence: ${Math.round(match.confidence * 100)}%`);
    });

    // BUG: Before fix, this would find 2 matches (same pair, both directions)
    // EXPECTED: After fix, should find only 1 match
    expect(result.matches.length).toBe(1);

    // Verify the single match includes both transactions
    const match = result.matches[0];
    const matchedTransactionIds = new Set([match.sourceTransactionId, match.targetTransactionId]);
    expect(matchedTransactionIds.has('schwab-tx-1')).toBe(true);
    expect(matchedTransactionIds.has('fidelity-tx-1')).toBe(true);

    // Verify match details are correct
    expect(match.confidence).toBeGreaterThan(0.8); // Should be high confidence
    expect(match.matchType).toBe('approximate');
    expect(match.dateDifference).toBe(0); // Same day
    expect(match.amountDifference).toBe(0); // Exact amount match
  });

  it('should allow one transaction to match with multiple different transactions', async () => {
    // Test that the fix doesn't break legitimate multiple possibilities
    const transactions: Transaction[] = [
      {
        id: 'source-tx',
        date: new Date('2025-06-09'),
        description: 'Transfer out',
        amount: -1000,
        category: 'Internal Transfer', 
        account: 'Account A',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'target-tx-1',
        date: new Date('2025-06-09'),
        description: 'Transfer in option 1',
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Account B',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'target-tx-2',
        date: new Date('2025-06-09'),
        description: 'Transfer in option 2', 
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Account C',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    const result = await transferMatchingService.findManualTransferMatches({
      transactions,
      maxDaysDifference: 8,
      tolerancePercentage: 0.12
    });

    console.log(`Multiple possibilities test - found ${result.matches.length} matches:`);
    result.matches.forEach((match, index) => {
      const sourceTx = transactions.find(t => t.id === match.sourceTransactionId);
      const targetTx = transactions.find(t => t.id === match.targetTransactionId);
      console.log(`  Match ${index + 1}: ${sourceTx?.account} ↔ ${targetTx?.account}`);
    });

    // Should find 2 matches: source-tx can match with both target-tx-1 and target-tx-2
    expect(result.matches.length).toBe(2);

    // Both matches should involve the source transaction
    const sourceMatches = result.matches.filter(
      m => m.sourceTransactionId === 'source-tx' || m.targetTransactionId === 'source-tx'
    );
    expect(sourceMatches.length).toBe(2);
  });
});