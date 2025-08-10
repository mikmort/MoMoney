import { Transaction } from '../types';
import { rulesService } from './rulesService';

/**
 * Enhanced transfer detection service that creates and manages rules
 * for identifying transfer transactions before AI categorization
 */
class TransferDetectionService {
  private readonly transferKeywords = [
    // ACH and electronic transfers
    'ach transfer', 'ach credit', 'ach debit', 'ach payment',
    'electronic transfer', 'wire transfer', 'bank transfer',
    
    // Internal transfers
    'transfer to', 'transfer from', 'internal transfer', 
    'account transfer', 'between accounts',
    
    // Payment types commonly used for transfers
    'automatic payment', 'auto payment', 'autopay',
    'online transfer', 'mobile transfer', 'zelle',
    
    // ATM and withdrawal patterns
    'atm withdrawal', 'cash withdrawal', 'withdrawal',
    'atm deposit', 'cash deposit', 'deposit',
    
    // Specific transfer patterns
    'transfer', 'tfr', 'xfer', 'move money',
    'payment transfer', 'fund transfer',
    
    // Bank-specific patterns
    'quickpay', 'popmoney', 'clearxchange'
  ];

  private readonly bankFeeKeywords = [
    // Actual bank fees that should NOT be transfers
    'overdraft fee', 'nsf fee', 'insufficient funds',
    'maintenance fee', 'monthly fee', 'service charge',
    'atm fee', 'foreign transaction fee', 'wire fee',
    'late fee', 'returned item', 'stop payment'
  ];

  /**
   * Initialize transfer detection rules if they don't exist
   */
  async initializeTransferRules(): Promise<number> {
    console.log('🔄 Initializing transfer detection rules...');
    
    let rulesCreated = 0;
    
    // Create rules for each transfer keyword pattern
    for (const keyword of this.transferKeywords) {
      try {
        // Check if rule already exists
        const existingRules = await rulesService.getAllRules();
        const ruleExists = existingRules.some(rule => 
          rule.name.toLowerCase().includes(keyword.toLowerCase()) ||
          rule.conditions.some(condition => 
            condition.field === 'description' && 
            condition.operator === 'contains' &&
            typeof condition.value === 'string' &&
            condition.value.toLowerCase() === keyword.toLowerCase()
          )
        );

        if (!ruleExists) {
          const rule = await rulesService.addRule({
            name: `Transfer Detection: ${keyword}`,
            description: `Auto-generated rule to detect transfer transactions containing "${keyword}"`,
            isActive: true,
            priority: 10, // High priority to catch before AI
            conditions: [
              {
                field: 'description',
                operator: 'contains',
                value: keyword,
                caseSensitive: false
              }
            ],
            action: {
              categoryId: 'internal-transfer',
              categoryName: 'Internal Transfer',
              subcategoryId: 'transfer-between-accounts',
              subcategoryName: 'Between Accounts'
            }
          });
          
          rulesCreated++;
          console.log(`📋 Created transfer rule: ${rule.name}`);
        }
      } catch (error) {
        console.warn(`Failed to create transfer rule for "${keyword}":`, error);
      }
    }

    // Create a rule to prevent misclassification of bank fees
    try {
      const existingRules = await rulesService.getAllRules();
      const bankFeeRuleExists = existingRules.some(rule => 
        rule.name.includes('Bank Fee Protection')
      );

      if (!bankFeeRuleExists) {
        // Create a regex pattern that matches actual bank fees
        const bankFeePattern = this.bankFeeKeywords
          .map(keyword => keyword.replace(/\s+/g, '\\s+'))
          .join('|');

        const rule = await rulesService.addRule({
          name: 'Bank Fee Protection',
          description: 'Ensures actual bank fees are not misclassified as transfers',
          isActive: true,
          priority: 5, // Even higher priority than transfer rules
          conditions: [
            {
              field: 'description',
              operator: 'regex',
              value: bankFeePattern,
              caseSensitive: false
            }
          ],
          action: {
            categoryId: 'financial',
            categoryName: 'Financial',
            subcategoryId: 'financial-fees',
            subcategoryName: 'Bank Fees'
          }
        });

        rulesCreated++;
        console.log(`📋 Created bank fee protection rule: ${rule.name}`);
      }
    } catch (error) {
      console.warn('Failed to create bank fee protection rule:', error);
    }

    console.log(`✅ Transfer detection rules initialized: ${rulesCreated} new rules created`);
    return rulesCreated;
  }

  /**
   * Analyze a transaction to determine if it might be a transfer
   */
  analyzeTransaction(transaction: Omit<Transaction, 'id' | 'addedDate' | 'lastModifiedDate'>): {
    isLikelyTransfer: boolean;
    confidence: number;
    reasons: string[];
  } {
    const reasons: string[] = [];
    let confidence = 0;

    const description = transaction.description.toLowerCase();

    // Check for bank fee keywords first (these should NOT be transfers)
    const hasBankFeeKeywords = this.bankFeeKeywords.some(keyword => 
      description.includes(keyword.toLowerCase())
    );

    if (hasBankFeeKeywords) {
      return {
        isLikelyTransfer: false,
        confidence: 0.9,
        reasons: ['Contains bank fee keywords']
      };
    }

    // Check for transfer keywords
    const matchedKeywords = this.transferKeywords.filter(keyword => 
      description.includes(keyword.toLowerCase())
    );

    if (matchedKeywords.length > 0) {
      confidence += 0.6;
      reasons.push(`Contains transfer keywords: ${matchedKeywords.join(', ')}`);
    }

    // Check for common transfer patterns
    if (/\b(to|from)\s+(.*account|savings|checking)\b/i.test(description)) {
      confidence += 0.3;
      reasons.push('Contains account-to-account pattern');
    }

    // Check for reference numbers (common in transfers)
    if (/\b(ref|reference|confirmation)[\s#:]*[a-z0-9]+/i.test(description)) {
      confidence += 0.1;
      reasons.push('Contains reference number');
    }

    // Round amounts are more likely to be transfers
    const amount = Math.abs(transaction.amount);
    if (amount % 1 === 0 && amount >= 10) {
      confidence += 0.05;
      reasons.push('Round dollar amount');
    }

    return {
      isLikelyTransfer: confidence >= 0.5,
      confidence: Math.min(confidence, 0.95),
      reasons
    };
  }

  /**
   * Find potential transfer pairs by analyzing transactions for matching amounts
   */
  findPotentialTransferPairs(transactions: Transaction[]): Array<{
    sourceTransaction: Transaction;
    targetTransaction: Transaction;
    confidence: number;
    daysDifference: number;
    amountDifference: number;
  }> {
    const pairs: Array<{
      sourceTransaction: Transaction;
      targetTransaction: Transaction;
      confidence: number;
      daysDifference: number;
      amountDifference: number;
    }> = [];

    // Sort transactions by date for efficient searching
    const sortedTransactions = [...transactions].sort((a, b) => a.date.getTime() - b.date.getTime());

    for (let i = 0; i < sortedTransactions.length; i++) {
      const tx1 = sortedTransactions[i];
      
      // Skip if already identified as transfer
      if (tx1.type === 'transfer') continue;

      // Look for matching transactions within 7 days
      const searchStartDate = new Date(tx1.date.getTime() - 7 * 24 * 60 * 60 * 1000);
      const searchEndDate = new Date(tx1.date.getTime() + 7 * 24 * 60 * 60 * 1000);

      for (let j = i + 1; j < sortedTransactions.length; j++) {
        const tx2 = sortedTransactions[j];
        
        // Stop searching if we're beyond our date range
        if (tx2.date > searchEndDate) break;
        
        // Skip if same account or already identified as transfer
        if (tx1.account === tx2.account || tx2.type === 'transfer') continue;

        // Check if dates are within range
        if (tx2.date < searchStartDate) continue;

        // Check for opposite amounts (one positive, one negative, similar magnitude)
        const amount1 = tx1.amount;
        const amount2 = tx2.amount;
        const amountDiff = Math.abs(Math.abs(amount1) - Math.abs(amount2));
        const avgAmount = (Math.abs(amount1) + Math.abs(amount2)) / 2;
        const amountTolerance = avgAmount * 0.02; // 2% tolerance

        // Must be opposite signs and similar amounts
        if ((amount1 > 0) === (amount2 > 0) || amountDiff > amountTolerance) continue;

        const daysDifference = Math.abs((tx1.date.getTime() - tx2.date.getTime()) / (1000 * 60 * 60 * 24));

        // Calculate confidence based on various factors
        let confidence = 0.3; // Base confidence for opposite amounts

        // Same day bonus
        if (daysDifference === 0) confidence += 0.3;
        else if (daysDifference <= 1) confidence += 0.2;
        else if (daysDifference <= 3) confidence += 0.1;

        // Exact amount match bonus
        if (amountDiff === 0) confidence += 0.3;
        else if (amountDiff <= 0.01) confidence += 0.2;

        // Transfer keywords in either description
        const analysis1 = this.analyzeTransaction(tx1);
        const analysis2 = this.analyzeTransaction(tx2);
        
        if (analysis1.isLikelyTransfer || analysis2.isLikelyTransfer) {
          confidence += 0.2;
        }

        // Round amounts bonus
        if (Math.abs(amount1) % 1 === 0 && Math.abs(amount2) % 1 === 0) {
          confidence += 0.05;
        }

        // Only include high-confidence pairs
        if (confidence >= 0.7) {
          pairs.push({
            sourceTransaction: amount1 < 0 ? tx1 : tx2,
            targetTransaction: amount1 < 0 ? tx2 : tx1,
            confidence,
            daysDifference,
            amountDifference: amountDiff
          });
        }
      }
    }

    return pairs.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Create transfer rules based on detected transfer pairs
   */
  async createRulesFromTransferPairs(pairs: Array<{
    sourceTransaction: Transaction;
    targetTransaction: Transaction;
    confidence: number;
  }>): Promise<number> {
    let rulesCreated = 0;

    for (const pair of pairs) {
      const { sourceTransaction, targetTransaction } = pair;

      // Create rules for both transactions if they contain transfer-like patterns
      const sourceAnalysis = this.analyzeTransaction(sourceTransaction);
      const targetAnalysis = this.analyzeTransaction(targetTransaction);

      if (sourceAnalysis.isLikelyTransfer && sourceAnalysis.confidence >= 0.8) {
        try {
          const existingRules = await rulesService.getAllRules();
          const ruleExists = existingRules.some(rule => 
            rule.conditions.some(c => 
              c.field === 'description' && 
              c.operator === 'equals' &&
              c.value === sourceTransaction.description
            ) && 
            rule.conditions.some(c =>
              c.field === 'account' &&
              c.operator === 'equals' &&
              c.value === sourceTransaction.account
            )
          );

          if (!ruleExists) {
            await rulesService.addRule({
              name: `Transfer Rule: ${sourceTransaction.description} (${sourceTransaction.account})`,
              description: `Auto-generated from transfer pair detection`,
              isActive: true,
              priority: 15,
              conditions: [
                {
                  field: 'description',
                  operator: 'equals',
                  value: sourceTransaction.description,
                  caseSensitive: false
                },
                {
                  field: 'account',
                  operator: 'equals',
                  value: sourceTransaction.account,
                  caseSensitive: false
                }
              ],
              action: {
                categoryId: 'internal-transfer',
                categoryName: 'Internal Transfer',
                subcategoryId: 'transfer-between-accounts',
                subcategoryName: 'Between Accounts'
              }
            });
            rulesCreated++;
          }
        } catch (error) {
          console.warn('Failed to create rule for source transaction:', error);
        }
      }

      if (targetAnalysis.isLikelyTransfer && targetAnalysis.confidence >= 0.8) {
        try {
          const existingRules = await rulesService.getAllRules();
          const ruleExists = existingRules.some(rule => 
            rule.conditions.some(c => 
              c.field === 'description' && 
              c.operator === 'equals' &&
              c.value === targetTransaction.description
            ) && 
            rule.conditions.some(c =>
              c.field === 'account' &&
              c.operator === 'equals' &&
              c.value === targetTransaction.account
            )
          );

          if (!ruleExists) {
            await rulesService.addRule({
              name: `Transfer Rule: ${targetTransaction.description} (${targetTransaction.account})`,
              description: `Auto-generated from transfer pair detection`,
              isActive: true,
              priority: 15,
              conditions: [
                {
                  field: 'description',
                  operator: 'equals',
                  value: targetTransaction.description,
                  caseSensitive: false
                },
                {
                  field: 'account',
                  operator: 'equals',
                  value: targetTransaction.account,
                  caseSensitive: false
                }
              ],
              action: {
                categoryId: 'internal-transfer',
                categoryName: 'Internal Transfer',
                subcategoryId: 'transfer-between-accounts',
                subcategoryName: 'Between Accounts'
              }
            });
            rulesCreated++;
          }
        } catch (error) {
          console.warn('Failed to create rule for target transaction:', error);
        }
      }
    }

    console.log(`📋 Created ${rulesCreated} rules from ${pairs.length} transfer pairs`);
    return rulesCreated;
  }
}

export const transferDetectionService = new TransferDetectionService();