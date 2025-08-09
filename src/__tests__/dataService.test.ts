import { dataService } from '../services/dataService';
import { Transaction, DuplicateDetectionConfig } from '../types';

describe('Enhanced Duplicate Detection', () => {
  beforeEach(async () => {
    // Clear data before each test
    await dataService.clearAllData();
  });

  it('should detect exact duplicates', async () => {
    // Add a base transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Test Transaction',
      amount: -100.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense'
    });

    // Test duplicate detection with exact match
    const newTransactions = [{
      date: new Date('2025-01-01'),
      description: 'Test Transaction',
      amount: -100.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense' as const
    }];

    const result = await dataService.detectDuplicates(newTransactions);
    
    expect(result.duplicates).toHaveLength(1);
    expect(result.uniqueTransactions).toHaveLength(0);
    expect(result.duplicates[0].matchType).toBe('exact');
    expect(result.duplicates[0].similarity).toBeGreaterThan(0.9);
  });

  it('should detect near-duplicates with amount tolerance', async () => {
    // Add a base transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Coffee Shop',
      amount: -5.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense'
    });

    // Test with similar amount (within 2% tolerance)
    const newTransactions = [{
      date: new Date('2025-01-01'),
      description: 'Coffee Shop',
      amount: -4.95, // $0.05 difference, within tolerance
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense' as const
    }];

    const config: DuplicateDetectionConfig = {
      amountTolerance: 0.02, // 2%
      dateTolerance: 0
    };

    const result = await dataService.detectDuplicates(newTransactions, config);
    
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].matchType).toBe('tolerance');
    expect(result.duplicates[0].amountDifference).toBeCloseTo(0.05, 2);
  });

  it('should detect near-duplicates with date tolerance', async () => {
    // Add a base transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Grocery Store',
      amount: -50.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense'
    });

    // Test with different date within tolerance
    const newTransactions = [{
      date: new Date('2025-01-03'), // 2 days later
      description: 'Grocery Store',
      amount: -50.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense' as const
    }];

    const config: DuplicateDetectionConfig = {
      dateTolerance: 3 // 3 days tolerance
    };

    const result = await dataService.detectDuplicates(newTransactions, config);
    
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].daysDifference).toBe(2);
    expect(result.duplicates[0].matchType).toBe('tolerance');
  });

  it('should not detect unrelated transactions as duplicates', async () => {
    // Add a base transaction
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Coffee Shop',
      amount: -5.00,
      category: 'Food & Dining',
      account: 'Test Account',
      type: 'expense'
    });

    // Test with completely different transaction
    const newTransactions = [{
      date: new Date('2025-01-15'), // Different date
      description: 'Gas Station', // Different description
      amount: -75.00, // Different amount
      category: 'Transportation', // Different category
      account: 'Test Account',
      type: 'expense' as const
    }];

    const result = await dataService.detectDuplicates(newTransactions);
    
    expect(result.duplicates).toHaveLength(0);
    expect(result.uniqueTransactions).toHaveLength(1);
  });
});

describe('Anomaly Detection', () => {
  beforeEach(async () => {
    // Clear data and add historical transactions for testing
    await dataService.clearAllData();
    
    // Add typical coffee shop transactions
    const coffeeTransactions = [
      { date: new Date('2024-12-01'), description: 'Starbucks', amount: -4.50, category: 'Food & Dining', account: 'Test', type: 'expense' as const },
      { date: new Date('2024-12-02'), description: 'Starbucks', amount: -4.25, category: 'Food & Dining', account: 'Test', type: 'expense' as const },
      { date: new Date('2024-12-03'), description: 'Starbucks', amount: -4.75, category: 'Food & Dining', account: 'Test', type: 'expense' as const },
      { date: new Date('2024-12-04'), description: 'Starbucks', amount: -4.65, category: 'Food & Dining', account: 'Test', type: 'expense' as const },
      { date: new Date('2024-12-05'), description: 'Starbucks', amount: -4.85, category: 'Food & Dining', account: 'Test', type: 'expense' as const },
    ];
    
    for (const transaction of coffeeTransactions) {
      await dataService.addTransaction(transaction);
    }
  });

  it('should detect high anomalies', async () => {
    // Add an unusually high coffee transaction
    const anomalousTransaction = await dataService.addTransaction({
      date: new Date('2024-12-06'),
      description: 'Starbucks Premium',
      amount: -25.00, // Much higher than typical $4.50
      category: 'Food & Dining',
      account: 'Test',
      type: 'expense'
    });

    // Run anomaly detection
    await dataService.detectAnomalies();

    // Get the updated transaction
    const updated = await dataService.getTransactionById(anomalousTransaction.id);
    
    expect(updated?.isAnomaly).toBe(true);
    expect(updated?.anomalyType).toBe('high');
    expect(updated?.anomalyScore).toBeGreaterThan(2);
    expect(updated?.historicalAverage).toBeCloseTo(4.6, 1);
  });

  it('should not flag normal transactions as anomalies', async () => {
    // Add a normal coffee transaction
    const normalTransaction = await dataService.addTransaction({
      date: new Date('2024-12-06'),
      description: 'Starbucks',
      amount: -4.50, // Normal amount
      category: 'Food & Dining',
      account: 'Test',
      type: 'expense'
    });

    // Run anomaly detection
    await dataService.detectAnomalies();

    // Get the updated transaction
    const updated = await dataService.getTransactionById(normalTransaction.id);
    
    expect(updated?.isAnomaly).toBeFalsy();
  });

  it('should get all anomalous transactions', async () => {
    // Add some anomalous transactions
    await dataService.addTransaction({
      date: new Date('2024-12-06'),
      description: 'Starbucks Expensive',
      amount: -30.00,
      category: 'Food & Dining',
      account: 'Test',
      type: 'expense'
    });

    await dataService.addTransaction({
      date: new Date('2024-12-07'),
      description: 'Starbucks Very Expensive',
      amount: -50.00,
      category: 'Food & Dining',
      account: 'Test',
      type: 'expense'
    });

    // Run anomaly detection
    await dataService.detectAnomalies();

    const anomalies = await dataService.getAnomalousTransactions();
    
    expect(anomalies.length).toBeGreaterThan(0);
    expect(anomalies.every(t => t.isAnomaly)).toBe(true);
  });
});