import { transferMatchingService } from '../services/transferMatchingService';
import { Transaction } from '../types';

describe('Transfer Matching Debug', () => {
  const testTransactions: Transaction[] = [
    {
      id: 'test-ach-debit-chase',
      date: new Date('2025-06-16'),
      amount: -316.72,
      description: 'ACH Debit CHASE CREDIT',
      category: 'Transfer', 
      account: 'Bank of America',
      type: 'transfer'
    } as Transaction,
    {
      id: 'test-auto-payment-chase',
      date: new Date('2025-06-13'),
      amount: 316.72,
      description: 'AUTOMATIC PAYMENT - Chase Checking',
      category: 'Transfer',
      account: 'Chase Checking', 
      type: 'transfer'
    } as Transaction,
    {
      id: 'test-ach-debit-capital',
      date: new Date('2025-06-16'),
      amount: -2214.87,
      description: 'ACH Debit CAPITAL ONE',
      category: 'Transfer',
      account: 'Bank of America',
      type: 'transfer'
    } as Transaction,
    {
      id: 'test-capital-transfer',
      date: new Date('2025-06-15'),
      amount: 2214.87,
      description: 'Capital One Transfer',
      category: 'Transfer',
      account: 'Capital One',
      type: 'transfer'
    } as Transaction
  ];

  it('should find matching transfers', async () => {
    console.log('Testing transfer matching with transactions:', testTransactions.map(t => ({
      id: t.id,
      amount: t.amount,
      account: t.account,
      date: t.date.toISOString()
    })));

    const result = await transferMatchingService.findTransferMatches({
      transactions: testTransactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    console.log('Match result:', result);
    console.log('Matches found:', result.matches.length);
    console.log('Unmatched transactions:', result.unmatched.length);
    
    result.matches.forEach(match => {
      console.log(`Match: ${match.sourceTransactionId} <-> ${match.targetTransactionId}, confidence: ${match.confidence}, reasoning: ${match.reasoning}`);
    });

    result.unmatched.forEach(tx => {
      console.log(`Unmatched: ${tx.id} (${tx.amount}) from ${tx.account}`);
    });

    // We should have 2 matches
    expect(result.matches.length).toBe(2);
  });

  it('should match chase transactions specifically', async () => {
    const chaseTransactions = testTransactions.filter(t => 
      t.id.includes('chase') || t.description.includes('CHASE') || t.account.includes('Chase')
    );

    console.log('Chase-related transactions:', chaseTransactions);

    const result = await transferMatchingService.findTransferMatches({
      transactions: chaseTransactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.01
    });

    console.log('Chase match result:', result);
    expect(result.matches.length).toBe(1);
  });
});