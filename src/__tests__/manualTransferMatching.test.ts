import { Transaction } from '../types';
import { transferMatchingService } from '../services/transferMatchingService';

describe('Manual Transfer Matching', () => {
  it('should find matches with extended date range (8 days)', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-23'), // 8 days later
        description: 'Deposit from Checking',
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Savings Account',
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

    // Manual matching finds both directions for flexibility
    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].dateDifference).toBe(8);
    expect(result.matches[0].matchType).toBe('approximate');
    expect(result.matches[0].reasoning).toContain('Possible manual match');
  });

  it('should NOT find matches beyond 8 days for manual matching', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-25'), // 10 days later - beyond manual range
        description: 'Deposit from Checking',
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Savings Account',
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

    expect(result.matches).toHaveLength(0);
  });

  it('should find matches with 12% exchange rate tolerance', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'USD to EUR Transfer',
        amount: -1000, // USD
        category: 'Internal Transfer',
        account: 'USD Account',
        type: 'transfer',
        originalCurrency: 'USD',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        description: 'EUR Deposit',
        amount: 920, // EUR - about 8% difference (within 12% tolerance)
        category: 'Internal Transfer',
        account: 'EUR Account',
        type: 'transfer',
        originalCurrency: 'EUR',
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

    expect(result.matches.length).toBeGreaterThanOrEqual(1);
    expect(result.matches[0].reasoning).toContain('exchange rate tolerance');
    expect(result.matches[0].matchType).toBe('approximate');
    expect(result.matches[0].confidence).toBeLessThanOrEqual(0.85); // Manual matches capped at 85%
  });

  it('should NOT find matches beyond 12% exchange rate tolerance', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'USD to EUR Transfer',
        amount: -1000, // USD
        category: 'Internal Transfer',
        account: 'USD Account',
        type: 'transfer',
        originalCurrency: 'USD',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-16'),
        description: 'EUR Deposit',
        amount: 850, // EUR - 15% difference (beyond 12% tolerance)
        category: 'Internal Transfer',
        account: 'EUR Account',
        type: 'transfer',
        originalCurrency: 'EUR',
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

    expect(result.matches).toHaveLength(0);
  });

  it('should allow multiple possible matches for manual search', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'Transfer Out',
        amount: -1000,
        category: 'Internal Transfer',
        account: 'Account A',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-17'),
        description: 'Deposit 1',
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Account B',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-3',
        date: new Date('2024-01-19'),
        description: 'Deposit 2',
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

    // Manual matching should find multiple possibilities
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('should preserve automatic matching behavior unchanged', async () => {
    const transactions: Transaction[] = [
      {
        id: 'tx-1',
        date: new Date('2024-01-15'),
        description: 'Transfer to Savings',
        amount: -1000,
        category: 'Internal Transfer',
        account: 'Checking Account',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      },
      {
        id: 'tx-2',
        date: new Date('2024-01-23'), // 8 days later - should NOT match in automatic
        description: 'Deposit from Checking',
        amount: 1000,
        category: 'Internal Transfer',
        account: 'Savings Account',
        type: 'transfer',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        isVerified: false
      }
    ];

    // Test automatic matching (should NOT find this match due to 8-day gap)
    const automaticResult = await transferMatchingService.findTransferMatches({
      transactions,
      maxDaysDifference: 7, // Standard automatic matching
      tolerancePercentage: 0.01
    });

    // Test manual matching (SHOULD find this match)
    const manualResult = await transferMatchingService.findManualTransferMatches({
      transactions,
      maxDaysDifference: 8,
      tolerancePercentage: 0.12
    });

    // Automatic should find no matches (8 days > 7 day limit)
    expect(automaticResult.matches).toHaveLength(0);
    
    // Manual should find the match(es)
    expect(manualResult.matches.length).toBeGreaterThanOrEqual(1);
    expect(manualResult.matches[0].reasoning).toContain('Possible manual match');
  });
});