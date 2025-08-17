import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transfer Days Display Fix', () => {
  const service = transferMatchingService;

  test('should display whole days instead of decimals for transfer matches', async () => {
    // Create transactions with a time difference that results in decimal days
    // 22 hours apart = 0.9166666666666666 days
    const date1 = new Date('2025-01-15T10:00:00Z');
    const date2 = new Date('2025-01-16T08:00:00Z'); // 22 hours later
    
    const transaction1: Transaction = {
      id: '1',
      date: date1,
      amount: -100.00,
      description: 'Transfer to savings',
      category: 'Internal Transfer',
      account: 'Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer to savings',
      originalCurrency: 'USD'
    };

    const transaction2: Transaction = {
      id: '2', 
      date: date2,
      amount: 100.00,
      description: 'Transfer from checking',
      category: 'Internal Transfer', 
      account: 'Savings',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer from checking',
      originalCurrency: 'USD'
    };

    const result = await service.findTransferMatches({
      transactions: [transaction1, transaction2],
      maxDaysDifference: 2,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(1);
    const match = result.matches[0];
    
    // The raw calculation would be 0.9166666666666666 days
    // But we want it to display as 1 day
    expect(match.dateDifference).toBe(1);
    
    // Check that the reasoning displays whole days
    expect(match.reasoning).toContain('1 days apart');
    expect(match.reasoning).not.toContain('0.91');
    expect(match.reasoning).not.toContain('0.9166666666666666');
  });

  test('should handle same-day transfers correctly', async () => {
    const date = new Date('2025-01-15T10:00:00Z');
    
    const transaction1: Transaction = {
      id: '1',
      date: date,
      amount: -100.00,
      description: 'Transfer to savings',
      category: 'Internal Transfer',
      account: 'Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer to savings',
      originalCurrency: 'USD'
    };

    const transaction2: Transaction = {
      id: '2',
      date: date,
      amount: 100.00,
      description: 'Transfer from checking',
      category: 'Internal Transfer',
      account: 'Savings',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer from checking',
      originalCurrency: 'USD'
    };

    const result = await service.findTransferMatches({
      transactions: [transaction1, transaction2],
      maxDaysDifference: 2,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(1);
    const match = result.matches[0];
    
    expect(match.dateDifference).toBe(0);
    expect(match.reasoning).toContain('0 days apart');
  });

  test('should round up partial days correctly', async () => {
    // Create transactions 1.3 days apart
    const date1 = new Date('2025-01-15T10:00:00Z');
    const date2 = new Date('2025-01-16T17:12:00Z'); // ~31.2 hours later = 1.3 days
    
    const transaction1: Transaction = {
      id: '1',
      date: date1,
      amount: -100.00,
      description: 'Transfer to savings',
      category: 'Internal Transfer',
      account: 'Checking',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer to savings',
      originalCurrency: 'USD'
    };

    const transaction2: Transaction = {
      id: '2',
      date: date2,
      amount: 100.00,
      description: 'Transfer from checking',
      category: 'Internal Transfer',
      account: 'Savings',
      type: 'transfer',
      addedDate: new Date(),
      lastModifiedDate: new Date(),
      isVerified: true,
      originalText: 'Transfer from checking',
      originalCurrency: 'USD'
    };

    const result = await service.findTransferMatches({
      transactions: [transaction1, transaction2],
      maxDaysDifference: 2,
      tolerancePercentage: 0.01
    });

    expect(result.matches).toHaveLength(1);
    const match = result.matches[0];
    
    // 1.3 days should round to 1 day
    expect(match.dateDifference).toBe(1);
    expect(match.reasoning).toContain('1 days apart');
  });
});