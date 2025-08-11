import { rulesService } from '../services/rulesService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { defaultCategories } from '../data/defaultCategories';

describe('Batch Processing Index Mismatch Bug', () => {
  beforeEach(async () => {
    await rulesService.clearAllRules();
  });

  it('should demonstrate the index mismatch bug in batch processing', async () => {
    console.log('🧪 Testing index mismatch bug in batch processing...');

    // Simulate the scenario from fileProcessingService.ts
    // 1. Start with transactions that don't match rules initially
    const originalUnmatchedTransactions = [
      {
        date: new Date('2024-01-15'),
        description: 'Spotify USA',
        amount: -15.99,
        notes: '',
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Spotify USA'
      },
      {
        date: new Date('2024-01-16'),  
        description: 'Netflix',
        amount: -12.99,
        notes: '',
        category: 'Uncategorized', 
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Netflix'
      },
      {
        date: new Date('2024-01-17'),
        description: 'Amazon Purchase',
        amount: -25.99,
        notes: '',
        category: 'Uncategorized',
        account: 'Checking Account', 
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Amazon Purchase'
      }
    ];

    console.log(`Original unmatched transactions: ${originalUnmatchedTransactions.length}`);
    originalUnmatchedTransactions.forEach((t, i) => {
      console.log(`  ${i}: ${t.description}`);
    });

    // 2. Simulate AI batch results for these transactions
    const batchResults = [
      {
        categoryId: 'entertainment',
        subcategoryId: 'entertainment-streaming',
        confidence: 0.87,
        reasoning: 'Spotify streaming'
      },
      {
        categoryId: 'entertainment', 
        subcategoryId: 'entertainment-streaming',
        confidence: 0.89,
        reasoning: 'Netflix streaming'
      },
      {
        categoryId: 'shopping',
        subcategoryId: 'shopping-online',
        confidence: 0.85,
        reasoning: 'Amazon shopping'
      }
    ];

    console.log(`\nBatch results: ${batchResults.length}`);
    batchResults.forEach((r, i) => {
      console.log(`  ${i}: ${r.categoryId} (${r.confidence})`);
    });

    // 3. Now simulate what happens when rules get created mid-processing
    // This simulates the logic from lines 1032-1077 where auto-rules are created
    console.log('\n🔄 Simulating auto-rule creation from batch results...');
    
    // Create rule for Netflix (index 1) with high confidence  
    await rulesService.createAutoRuleFromAI(
      'Checking Account',
      'Netflix', 
      'Entertainment',
      'Streaming Services',
      0.89
    );

    console.log('Created auto-rule for Netflix');

    // 4. Now simulate re-applying rules (lines 985-1000)
    console.log('\n🔄 Re-applying rules to remaining transactions...');
    
    const ruleResults = await rulesService.applyRulesToBatch(originalUnmatchedTransactions);
    console.log(`After re-applying rules: ${ruleResults.matchedTransactions.length} matched, ${ruleResults.unmatchedTransactions.length} unmatched`);

    ruleResults.matchedTransactions.forEach((match, i) => {
      console.log(`  Rule matched ${i}: ${match.transaction.description} -> ${match.transaction.category}`);
    });

    ruleResults.unmatchedTransactions.forEach((unmatched, i) => {
      console.log(`  Still unmatched ${i}: ${unmatched.description}`);
    });

    // 5. This is where the bug happens - simulate the final processing loop
    console.log('\n❌ DEMONSTRATING THE BUG:');
    console.log(`Original unmatched count: ${originalUnmatchedTransactions.length}`);
    console.log(`Batch results count: ${batchResults.length}`);
    console.log(`But after rule re-application, unmatched count: ${ruleResults.unmatchedTransactions.length}`);

    // Simulate the loop from lines 1142-1144
    for (let index = 0; index < batchResults.length && index < originalUnmatchedTransactions.length; index++) {
      const transaction = originalUnmatchedTransactions[index];
      const ai = batchResults[index] || { categoryId: 'uncategorized', confidence: 0.1 };

      console.log(`\nLoop iteration ${index}:`);
      console.log(`  Transaction: ${transaction.description}`);
      console.log(`  AI result: ${ai.categoryId} (${ai.confidence})`);

      // Check if this transaction actually matched a rule now
      const ruleMatched = ruleResults.matchedTransactions.some(
        match => match.transaction.description === transaction.description
      );

      if (ruleMatched) {
        console.log(`  ❌ BUG: This transaction should have been rule-matched, not AI-processed!`);
        console.log(`  ❌ BUG: But it's being processed with AI result: ${ai.categoryId}`);
      }
    }

    // The bug: Netflix should have matched the rule and not be in the AI processing loop
    // But the original algorithm processes it with AI results anyway
    expect(ruleResults.matchedTransactions.length).toBeGreaterThan(0);
    expect(ruleResults.matchedTransactions.some(m => m.transaction.description === 'Netflix')).toBe(true);
  });

  it('should test the correct fix for the index mismatch bug', async () => {
    console.log('🧪 Testing the CORRECT approach to avoid index mismatch...');

    // The correct approach should be:
    // 1. Apply rules first
    // 2. Process ONLY the truly unmatched transactions with AI
    // 3. Don't mix rule-matched and AI-processed transactions in final loop

    const originalTransactions = [
      {
        date: new Date('2024-01-15'),
        description: 'Spotify USA',
        amount: -15.99,
        notes: '',
        category: 'Uncategorized',
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Spotify USA'
      },
      {
        date: new Date('2024-01-16'),  
        description: 'Netflix',
        amount: -12.99,
        notes: '',
        category: 'Uncategorized', 
        account: 'Checking Account',
        type: 'expense' as const,
        isVerified: false,
        originalText: 'Netflix'
      }
    ];

    // 1. Apply rules first
    const initialRuleResults = await rulesService.applyRulesToBatch(originalTransactions);
    console.log(`Initial rule results: ${initialRuleResults.matchedTransactions.length} matched, ${initialRuleResults.unmatchedTransactions.length} unmatched`);

    // 2. Create auto-rule for one transaction
    if (initialRuleResults.unmatchedTransactions.length > 0) {
      const firstUnmatched = initialRuleResults.unmatchedTransactions[0];
      await rulesService.createAutoRuleFromAI(
        firstUnmatched.account,
        firstUnmatched.description,
        'Entertainment',
        'Streaming Services',
        0.90
      );
      console.log(`Created auto-rule for: ${firstUnmatched.description}`);
    }

    // 3. Re-apply rules to catch newly matched transactions
    const finalRuleResults = await rulesService.applyRulesToBatch(originalTransactions);
    console.log(`Final rule results: ${finalRuleResults.matchedTransactions.length} matched, ${finalRuleResults.unmatchedTransactions.length} unmatched`);

    // 4. The CORRECT approach: Only process truly unmatched transactions with AI
    const finalUnmatchedTransactions = finalRuleResults.unmatchedTransactions;
    console.log(`\n✅ CORRECT: Processing only ${finalUnmatchedTransactions.length} unmatched transactions with AI`);

    finalUnmatchedTransactions.forEach((t, i) => {
      console.log(`  Unmatched ${i}: ${t.description} -> will get AI classification`);
    });

    finalRuleResults.matchedTransactions.forEach((match, i) => {
      console.log(`  Rule-matched ${i}: ${match.transaction.description} -> ${match.transaction.category} (rule: ${match.rule.name})`);
    });

    // This should result in consistent, correct categorization
    expect(finalRuleResults.matchedTransactions.length + finalRuleResults.unmatchedTransactions.length)
      .toBe(originalTransactions.length);
  });
});