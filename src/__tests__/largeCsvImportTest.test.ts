/**
 * Test to reproduce the exact issue where 135 transactions from a CSV import
 * are being flagged as duplicates
 */
import { dataService } from '../services/dataService';
import { Transaction } from '../types';

describe('Large CSV Import - 135 Transaction Duplicate Issue', () => {
  beforeEach(async () => {
    await dataService.clearAllData();
    (dataService as any).isInitialized = true;
  });

  it('should handle importing 135 transactions without flagging them all as duplicates', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add some realistic existing transactions to simulate an account with history
    const existingTransactions = [
      {
        date: new Date('2025-01-01'),
        description: 'Credit Dividend',
        amount: 0.05,
        category: 'Investment Income',
        account: accountId,
        type: 'income' as const
      },
      {
        date: new Date('2025-01-15'),
        description: 'ACH Debit BARCLAYCARD US  - CREDITCARD',
        amount: -75.00,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      {
        date: new Date('2025-01-20'),
        description: 'Withdrawal Transfer To ***1144 Leschi House',
        amount: -630.43,
        category: 'Internal Transfer',
        account: accountId,
        type: 'transfer' as const
      },
      // Add some monthly recurring transactions that might appear similar
      ...Array.from({length: 20}, (_, i) => ({
        date: new Date(2024, i % 12, Math.floor(i/12) + 1),
        description: i % 3 === 0 ? 'Monthly Fee' : i % 3 === 1 ? 'Interest Payment' : `Regular Transaction ${i}`,
        amount: i % 3 === 0 ? -5.00 : i % 3 === 1 ? 1.25 : -(Math.random() * 50 + 10),
        category: i % 3 === 0 ? 'Bank Fees' : i % 3 === 1 ? 'Investment Income' : 'Various',
        account: accountId,
        type: (i % 3 === 1 ? 'income' : 'expense') as const
      }))
    ];

    // Add existing transactions to simulate an account with history
    for (const txn of existingTransactions) {
      await dataService.addTransaction(txn);
    }

    console.log(`Added ${existingTransactions.length} existing transactions to account`);

    // Generate 135 new transactions that are realistic but should not be duplicates
    const newTransactions = Array.from({length: 135}, (_, i) => {
      const baseDate = new Date('2025-03-01');
      baseDate.setDate(baseDate.getDate() + Math.floor(i / 5)); // Spread over time

      return {
        date: baseDate,
        description: generateRealisticDescription(i),
        amount: generateRealisticAmount(i),
        category: generateCategory(i),
        account: accountId,
        type: (i % 10 === 0 ? 'income' : 'expense') as const
      };
    });

    console.log(`Created ${newTransactions.length} new transactions for import`);

    // Run duplicate detection - this is what the file processing service does
    const duplicateResult = await dataService.detectDuplicates(newTransactions);

    console.log(`Duplicate detection results:`);
    console.log(`- Total new transactions: ${newTransactions.length}`);
    console.log(`- Duplicates found: ${duplicateResult.duplicates.length}`);
    console.log(`- Unique transactions: ${duplicateResult.uniqueTransactions.length}`);
    console.log(`- Percentage flagged as duplicates: ${(duplicateResult.duplicates.length / newTransactions.length * 100).toFixed(1)}%`);

    if (duplicateResult.duplicates.length > 0) {
      console.log('\nFirst 5 duplicate matches:');
      duplicateResult.duplicates.slice(0, 5).forEach((dup, index) => {
        console.log(`${index + 1}. New: "${dup.newTransaction.description}" ($${dup.newTransaction.amount})`);
        console.log(`   Existing: "${dup.existingTransaction.description}" ($${dup.existingTransaction.amount})`);
        console.log(`   Similarity: ${(dup.similarity * 100).toFixed(1)}% | Match fields: [${dup.matchFields.join(', ')}]`);
        console.log(`   Days difference: ${dup.daysDifference || 0}`);
        console.log('');
      });
    }

    // The key assertion: not ALL transactions should be duplicates
    // A realistic expectation is that less than 10% would be duplicates
    expect(duplicateResult.duplicates.length).toBeLessThan(newTransactions.length * 0.1);
    expect(duplicateResult.uniqueTransactions.length).toBeGreaterThan(newTransactions.length * 0.9);
  });

  it('should test with exact same configuration as file processing service', async () => {
    const accountId = 'first-tech-credit-union-first-tech-shared-checking';
    
    // Add minimal existing data
    await dataService.addTransaction({
      date: new Date('2025-01-01'),
      description: 'Credit Dividend',
      amount: 0.05,
      category: 'Investment Income',
      account: accountId,
      type: 'income' as const
    });

    // Create a smaller set for focused testing
    const newTransactions = Array.from({length: 10}, (_, i) => ({
      date: new Date('2025-03-01'),
      description: `Test Transaction ${i + 1}`,
      amount: -(10 + i),
      category: 'Shopping',
      account: accountId,
      type: 'expense' as const
    }));

    // Use the exact same configuration that file processing service would use (default)
    const duplicateResult = await dataService.detectDuplicates(newTransactions);

    console.log(`Small test - ${newTransactions.length} transactions:`);
    console.log(`- Duplicates: ${duplicateResult.duplicates.length}`);
    console.log(`- Unique: ${duplicateResult.uniqueTransactions.length}`);
    console.log(`- Configuration: ${JSON.stringify(duplicateResult.config, null, 2)}`);

    // These should all be unique since they have different descriptions, amounts, and dates
    expect(duplicateResult.duplicates.length).toBe(0);
    expect(duplicateResult.uniqueTransactions.length).toBe(10);
  });
});

function generateRealisticDescription(index: number): string {
  const descriptions = [
    'COSTCO WHOLESALE #123 SEATTLE WA',
    'STARBUCKS #456 BELLEVUE WA',
    'SHELL SERVICE STATION REDMOND WA',
    'AMAZON MARKETPLACE SEATTLE WA',
    'TARGET T-789 KIRKLAND WA',
    'WHOLE FOODS MARKET SEATTLE WA',
    'TRADER JOES #012 BELLEVUE WA',
    'HOME DEPOT #345 RENTON WA',
    'QFC #678 SEATTLE WA',
    'SAFEWAY #901 REDMOND WA',
    'FRED MEYER #234 KIRKLAND WA',
    'MCDONALDS #567 BELLEVUE WA',
    'CHEVRON STATION SEATTLE WA',
    'WALGREENS #890 REDMOND WA',
    'CVS PHARMACY SEATTLE WA'
  ];

  const baseDescription = descriptions[index % descriptions.length];
  const suffix = Math.floor(index / descriptions.length);
  
  return suffix > 0 ? `${baseDescription} ${suffix}` : baseDescription;
}

function generateRealisticAmount(index: number): number {
  const amounts = [-45.67, -12.34, -89.99, -156.78, -23.45, -67.89, -34.56, -78.90, -125.43, -98.76];
  const baseAmount = amounts[index % amounts.length];
  const variation = (Math.random() - 0.5) * 10; // Add some variation
  
  return Math.round((baseAmount + variation) * 100) / 100;
}

function generateCategory(index: number): string {
  const categories = [
    'Groceries',
    'Food & Dining',
    'Gas & Fuel',
    'Shopping',
    'Home Improvement',
    'Health & Medical',
    'Entertainment',
    'Transportation'
  ];
  
  return categories[index % categories.length];
}