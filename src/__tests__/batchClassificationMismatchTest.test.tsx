/**
 * Test for AI Batch Classification Index Mismatch Issue #306
 * 
 * This test specifically targets the root cause of the AI reasoning mismatch:
 * When batch processing transactions for AI classification, the response indices
 * don't properly align with the original transaction indices, causing reasoning
 * from one transaction to be assigned to another.
 */

import { Transaction, Category, AIClassificationResponse } from '../types';

describe('AI Batch Classification Index Mismatch Issue #306', () => {
  
  const mockCategories: Category[] = [
    {
      id: 'transportation',
      name: 'Transportation',
      type: 'expense',
      subcategories: [
        { id: 'parking', name: 'Parking' }
      ]
    },
    {
      id: 'technology',
      name: 'Technology', 
      type: 'expense',
      subcategories: [
        { id: 'software', name: 'Software' }
      ]
    },
    {
      id: 'uncategorized',
      name: 'Uncategorized',
      type: 'expense',
      subcategories: []
    }
  ];

  it('should demonstrate the index mismatch problem in batch processing', () => {
    // Original unmatched transactions (in order they appear in file)
    const originalUnmatchedTransactions: Partial<Transaction>[] = [
      {
        description: 'HELP.MAX.COM',
        amount: -23.16,
        date: new Date('2024-01-15')
      },
      {
        description: 'BLOX PARKERING AUTOPARK',
        amount: -5.50,
        date: new Date('2024-01-16') 
      }
    ];

    // AI batch results (could be in different order or with different indices)
    const batchResults: AIClassificationResponse[] = [
      {
        categoryId: 'transportation',
        subcategoryId: 'parking',
        confidence: 0.95,
        reasoning: 'The description "BLOX PARKERING AUTOPARK" clearly indicates a parking expense.'
      },
      {
        categoryId: 'uncategorized', 
        subcategoryId: undefined,
        confidence: 0.3,
        reasoning: 'The description "HELP.MAX.COM" is unclear and requires manual categorization.'
      }
    ];

    // CURRENT BUGGY LOGIC: Direct index mapping
    const processedTransactionsBuggy: Transaction[] = [];
    
    for (let index = 0; index < Math.min(batchResults.length, originalUnmatchedTransactions.length); index++) {
      const transaction = originalUnmatchedTransactions[index];
      const ai = batchResults[index]; // BUG: This assumes indices match!
      
      const newTransaction = {
        ...transaction,
        id: `tx-${index}`,
        reasoning: ai.reasoning, // THIS IS WHERE THE MISMATCH OCCURS
        confidence: ai.confidence,
        category: ai.categoryId === 'uncategorized' ? 'Uncategorized' : 'Transportation',
        addedDate: new Date(),
        lastModifiedDate: new Date(),
        account: 'test-account',
        type: 'expense' as const
      } as Transaction;
      
      processedTransactionsBuggy.push(newTransaction);
    }

    // PROBLEM DEMONSTRATED: The first transaction gets the wrong reasoning
    const firstTransaction = processedTransactionsBuggy[0];
    expect(firstTransaction.description).toBe('HELP.MAX.COM');
    
    // BUG: The reasoning mentions BLOX PARKERING but transaction is HELP.MAX.COM
    expect(firstTransaction.reasoning).toBe('The description "BLOX PARKERING AUTOPARK" clearly indicates a parking expense.');
    
    // This is the exact mismatch described in the GitHub issue!
    expect(firstTransaction.reasoning).toContain('BLOX PARKERING');
    expect(firstTransaction.description).toContain('HELP.MAX.COM');
    
    // The reasoning doesn't match the description
    expect(firstTransaction.reasoning).not.toContain(firstTransaction.description);
  });

  it('should show how to fix the index mismatch with proper correlation', () => {
    // Original transactions with unique identifiers
    const originalTransactions: Array<Partial<Transaction> & { tempId: string }> = [
      {
        tempId: 'temp-1',
        description: 'HELP.MAX.COM',
        amount: -23.16,
        date: new Date('2024-01-15')
      },
      {
        tempId: 'temp-2', 
        description: 'BLOX PARKERING AUTOPARK',
        amount: -5.50,
        date: new Date('2024-01-16')
      }
    ];

    // AI responses with proper correlation keys
    const aiResponses: Array<AIClassificationResponse & { transactionKey: string }> = [
      {
        transactionKey: 'HELP.MAX.COM|-23.16|2024-01-15',
        categoryId: 'uncategorized',
        confidence: 0.3,
        reasoning: 'The description "HELP.MAX.COM" is unclear and requires manual categorization.'
      },
      {
        transactionKey: 'BLOX PARKERING AUTOPARK|-5.5|2024-01-16',
        categoryId: 'transportation',
        subcategoryId: 'parking', 
        confidence: 0.95,
        reasoning: 'The description "BLOX PARKERING AUTOPARK" clearly indicates a parking expense.'
      }
    ];

    // FIXED LOGIC: Use correlation keys instead of indices
    const processedTransactionsFixed: Transaction[] = [];
    
    for (const transaction of originalTransactions) {
      // Create correlation key for this transaction
      const transactionKey = `${transaction.description}|${transaction.amount}|${transaction.date?.toISOString().split('T')[0]}`;
      
      // Find the correct AI response for this specific transaction
      const aiResponse = aiResponses.find(ai => ai.transactionKey === transactionKey);
      
      if (aiResponse) {
        const newTransaction = {
          ...transaction,
          id: `tx-${transaction.tempId}`,
          reasoning: aiResponse.reasoning, // NOW CORRECTLY MATCHED
          confidence: aiResponse.confidence,
          category: aiResponse.categoryId === 'uncategorized' ? 'Uncategorized' : 'Transportation',
          addedDate: new Date(),
          lastModifiedDate: new Date(),
          account: 'test-account',
          type: 'expense' as const
        } as Transaction;
        
        processedTransactionsFixed.push(newTransaction);
      }
    }

    // VALIDATION: Each transaction has the correct reasoning
    const helpTransaction = processedTransactionsFixed.find(t => t.description === 'HELP.MAX.COM');
    const bloxTransaction = processedTransactionsFixed.find(t => t.description === 'BLOX PARKERING AUTOPARK');

    // HELP.MAX.COM should have reasoning about HELP.MAX.COM
    expect(helpTransaction?.reasoning).toContain('HELP.MAX.COM');
    expect(helpTransaction?.reasoning).not.toContain('BLOX PARKERING');

    // BLOX PARKERING should have reasoning about BLOX PARKERING  
    expect(bloxTransaction?.reasoning).toContain('BLOX PARKERING');
    expect(bloxTransaction?.reasoning).not.toContain('HELP.MAX.COM');

    // Each transaction's reasoning matches its description
    expect(helpTransaction?.reasoning).toContain(helpTransaction.description);
    expect(bloxTransaction?.reasoning).toContain(bloxTransaction.description);
  });
});