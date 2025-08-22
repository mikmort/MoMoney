import { Transaction, CollapsedTransfer } from '../types';
import { dataService } from './dataService';
import { accountManagementService } from './accountManagementService';

export interface TransferMatch {
  id: string;
  sourceTransactionId: string;
  targetTransactionId: string;
  confidence: number; // AI confidence in the match (0-1)
  matchType: 'exact' | 'approximate' | 'manual';
  dateDifference: number; // Days between source and target transfer
  amountDifference: number; // Difference in amounts (should be minimal for transfers)
  reasoning?: string; // AI explanation for the match
  isVerified: boolean; // User has verified the match
}

export interface TransferMatchRequest {
  transactions: Transaction[];
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  maxDaysDifference?: number; // Maximum days between transfers
  tolerancePercentage?: number; // Tolerance for amount differences (e.g., 0.01 = 1%)
}

export interface TransferMatchResponse {
  matches: TransferMatch[];
  unmatched: Transaction[];
  confidence: number;
}

// Same-account matched transaction interfaces (for cancelled/reversed transactions)
export interface SameAccountMatch {
  id: string;
  sourceTransactionId: string;
  targetTransactionId: string;
  confidence: number; // Confidence in the match (0-1)
  matchType: 'exact' | 'approximate' | 'manual';
  dateDifference: number; // Days between the opposite transactions
  amountDifference: number; // Difference in amounts (should be minimal for exact matches)
  reasoning?: string; // Explanation for the match
  isVerified: boolean; // User has verified the match
}

export interface SameAccountMatchRequest {
  transactions: Transaction[];
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  maxDaysDifference?: number; // Maximum days between opposite transactions (default: 1)
  tolerancePercentage?: number; // Tolerance for amount differences (default: 0.01 = 1%)
}

export interface SameAccountMatchResponse {
  matches: SameAccountMatch[];
  unmatched: Transaction[];
  confidence: number;
}

class TransferMatchingService {
  
  /**
   * Get the currency of a transaction from its associated account
   */
  private getTransactionCurrency(transaction: Transaction): string {
    const accounts = accountManagementService.getAccounts();
    
    // Try to match by account ID first, then by name
    const account = accounts.find(acc => acc.id === transaction.account) || 
                    accounts.find(acc => acc.name === transaction.account);
    
    if (!account) {
      console.warn(`⚠️ Account not found for transaction ${transaction.id}: "${transaction.account}"`);
      return 'USD'; // Default to USD if account not found
    }
    
    return account.currency || 'USD';
  }

  /**
   * Check if a transaction is a foreign currency transaction (not USD)
   */
  private isForeignTransaction(transaction: Transaction): boolean {
    const currency = this.getTransactionCurrency(transaction);
    return currency !== 'USD';
  }

  /**
   * Find matching transfer transactions for manual user search with relaxed criteria
   * Uses expanded date range (+/- 8 days) and exchange rate tolerance (+/- 12%)
   */
  async findManualTransferMatches(request: TransferMatchRequest): Promise<TransferMatchResponse> {
    const {
      transactions,
      dateRangeStart,
      dateRangeEnd,
      maxDaysDifference = 8, // Expanded for manual search: +/- 8 days
      tolerancePercentage = 0.12 // Relaxed for exchange rates: +/- 12%
    } = request;

    console.log('🔍 findManualTransferMatches called with:', {
      totalTransactions: transactions.length,
      dateRangeStart: dateRangeStart?.toISOString(),
      dateRangeEnd: dateRangeEnd?.toISOString(),
      maxDaysDifference,
      tolerancePercentage
    });

    // Filter transactions within date range - include transfers AND foreign currency expenses
    const candidateTransactions = transactions.filter(tx => {
      // Always include transfer transactions
      if (tx.type === 'transfer' && 
          (!dateRangeStart || tx.date >= dateRangeStart) &&
          (!dateRangeEnd || tx.date <= dateRangeEnd) &&
          !tx.reimbursementId) {
        return true;
      }
      
      // Also include foreign currency expenses as potential cross-currency matches
      if ((tx.type === 'expense' || tx.type === 'income') &&
          (!dateRangeStart || tx.date >= dateRangeStart) &&
          (!dateRangeEnd || tx.date <= dateRangeEnd) &&
          !tx.reimbursementId) {
        // Check if this is a foreign currency transaction using account-based detection
        return this.isForeignTransaction(tx);
      }
      
      return false;
    });

    console.log('📊 Candidate transactions found:', {
      total: candidateTransactions.length,
      transfers: candidateTransactions.filter(tx => tx.type === 'transfer').length,
      foreignExpenses: candidateTransactions.filter(tx => 
        (tx.type === 'expense' || tx.type === 'income') && this.isForeignTransaction(tx)
      ).length,
      candidateIds: candidateTransactions.map(tx => ({ id: tx.id, type: tx.type, amount: tx.amount, account: tx.account }))
    });

    // Log detailed info for specific transactions we're looking for
    console.log('🔍 Looking for specific transactions:');
    candidateTransactions.forEach(tx => {
      if (tx.description.toLowerCase().includes('firsttech') || 
          tx.description.toLowerCase().includes('firsttec') || 
          tx.description.toLowerCase().includes('michael joseph morton') ||
          Math.abs(tx.amount) > 700000 || Math.abs(tx.amount) > 100000) {
        console.log('🎯 Potential target transaction:', {
          id: tx.id.substring(0,8),
          description: tx.description,
          amount: tx.amount,
          account: tx.account,
          currency: this.getTransactionCurrency(tx),
          isForeign: this.isForeignTransaction(tx),
          date: tx.date.toISOString().split('T')[0]
        });
      }
    });

    const matches: TransferMatch[] = [];
    const matchedIds = new Set<string>();
    const processedPairs = new Set<string>(); // Track processed transaction pairs to prevent duplicates

    console.log('🔄 Starting matching loop with', candidateTransactions.length, 'candidates');
    let pairsChecked = 0;
    let amountMatches = 0;
    let dateMatches = 0;
    let accountMatches = 0;
    let finalMatches = 0;

    // Find potential matches using relaxed heuristics for manual search
    for (const sourceTx of candidateTransactions) {
      if (matchedIds.has(sourceTx.id)) continue;

      for (const targetTx of candidateTransactions) {
        if (matchedIds.has(targetTx.id) || sourceTx.id === targetTx.id) continue;
        
        pairsChecked++;

        // Create a unique pair key to prevent duplicate matches in both directions
        const pairKey = [sourceTx.id, targetTx.id].sort().join('-');
        if (processedPairs.has(pairKey)) continue;

        // Check if amounts are inverse (one positive, one negative, similar magnitude)
        // Use relaxed tolerance for manual matching, especially for exchange rates
        const sameCurrency = this.haveSameCurrency(sourceTx, targetTx);
        const amountMatch = this.areAmountsMatchingForManualSearch(sourceTx, targetTx, tolerancePercentage);
        
        if (!amountMatch) {
          // Debug failed amount matches for first few pairs
          if (pairsChecked <= 10) {
            console.log(`❌ Amount mismatch for pair ${pairsChecked}:`, {
              source: { id: sourceTx.id.substring(0,8), amount: sourceTx.amount, type: sourceTx.type },
              target: { id: targetTx.id.substring(0,8), amount: targetTx.amount, type: targetTx.type },
              tolerance: tolerancePercentage,
              sameCurrency
            });
          }
          continue;
        }
        amountMatches++;

        // Check date proximity - expanded range for manual search
        const dateDiff = Math.abs((sourceTx.date.getTime() - targetTx.date.getTime()) / (1000 * 60 * 60 * 24));
        if (dateDiff > maxDaysDifference) {
          if (pairsChecked <= 10) {
            console.log(`❌ Date mismatch for pair ${pairsChecked}:`, {
              source: { id: sourceTx.id.substring(0,8), date: sourceTx.date.toISOString().split('T')[0] },
              target: { id: targetTx.id.substring(0,8), date: targetTx.date.toISOString().split('T')[0] },
              dateDiff: Math.round(dateDiff * 10) / 10,
              maxAllowed: maxDaysDifference
            });
          }
          continue;
        }
        dateMatches++;

        // Check if accounts are different (transfers should be between different accounts)
        // Exception: For cross-currency matching, same account is allowed (e.g., transfer + foreign currency fee on same account)
        const sourceForeign = this.isForeignTransaction(sourceTx);
        const targetForeign = this.isForeignTransaction(targetTx);
        const isCrossCurrencyMatch = sourceForeign || targetForeign;
        
        if (sourceTx.account === targetTx.account && !isCrossCurrencyMatch) {
          if (pairsChecked <= 10) {
            console.log(`❌ Same account (not cross-currency) for pair ${pairsChecked}:`, {
              source: { 
                id: sourceTx.id.substring(0,8), 
                account: sourceTx.account, 
                amount: sourceTx.amount,
                originalCurrency: sourceTx.originalCurrency,
                notes: sourceTx.notes?.substring(0, 100) || 'N/A',
                isForeign: sourceForeign 
              },
              target: { 
                id: targetTx.id.substring(0,8), 
                account: targetTx.account, 
                amount: targetTx.amount,
                originalCurrency: targetTx.originalCurrency,
                notes: targetTx.notes?.substring(0, 100) || 'N/A',
                isForeign: targetForeign 
              }
            });
          }
          continue;
        }
        
        if (sourceTx.account === targetTx.account && isCrossCurrencyMatch) {
          console.log(`✅ Same account allowed (cross-currency) for pair ${pairsChecked}:`, {
            source: { id: sourceTx.id.substring(0,8), account: sourceTx.account, type: sourceTx.type, isForeign: sourceForeign },
            target: { id: targetTx.id.substring(0,8), account: targetTx.account, type: targetTx.type, isForeign: targetForeign }
          });
        }
        accountMatches++;

        // For manual matching, we flag all matches as "Possible Matches"
        // since we're using relaxed criteria
        const match: TransferMatch = {
          id: `manual-transfer-match-${sourceTx.id}-${targetTx.id}`,
          sourceTransactionId: sourceTx.id,
          targetTransactionId: targetTx.id,
          confidence: this.calculateManualMatchConfidence(sourceTx, targetTx, dateDiff, Math.abs(sourceTx.amount - Math.abs(targetTx.amount)), sameCurrency),
          matchType: 'approximate', // Manual matches are always considered approximate due to relaxed criteria
          dateDifference: Math.round(dateDiff),
          amountDifference: Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)),
          reasoning: sameCurrency 
            ? `Possible manual match: ${sourceTx.account} ↔ ${targetTx.account}, ${Math.round(dateDiff)} days apart`
            : `Possible match with exchange rate tolerance: ${sourceTx.account} ↔ ${targetTx.account}, ${Math.round(dateDiff)} days apart (≤12% amount difference)`,
          isVerified: false
        };

        finalMatches++;
        console.log(`✅ Match found! (#${finalMatches})`, {
          source: { id: sourceTx.id.substring(0,8), amount: sourceTx.amount, account: sourceTx.account, type: sourceTx.type },
          target: { id: targetTx.id.substring(0,8), amount: targetTx.amount, account: targetTx.account, type: targetTx.type },
          confidence: match.confidence,
          dateDiff: Math.round(dateDiff * 10) / 10,
          amountDiff: Math.round(match.amountDifference * 100) / 100
        });

        matches.push(match);
        processedPairs.add(pairKey); // Mark this pair as processed to prevent duplicates
        // Don't add to matchedIds for manual matching to allow multiple possibilities
        // matchedIds.add(sourceTx.id);
        // matchedIds.add(targetTx.id);
      }
    }

    console.log('🔍 Matching loop summary:', {
      candidatesProcessed: candidateTransactions.length,
      pairsChecked,
      amountMatches,
      dateMatches,
      accountMatches,
      finalMatches
    });

    // Get unmatched transactions (all since we don't mark as matched in manual search)
    const unmatched = candidateTransactions.filter(tx => !matchedIds.has(tx.id));

    console.log('✅ findManualTransferMatches result:', {
      matchesFound: matches.length,
      unmatchedCount: unmatched.length,
      averageConfidence: matches.length > 0 ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length : 0,
      matches: matches.map(m => ({
        id: m.id,
        sourceId: m.sourceTransactionId,
        targetId: m.targetTransactionId,
        confidence: m.confidence,
        matchType: m.matchType,
        reasoning: m.reasoning
      }))
    });

    return {
      matches,
      unmatched,
      confidence: matches.length > 0 ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length : 0
    };
  }

  /**
   * Find matching transfer transactions
   */
  async findTransferMatches(request: TransferMatchRequest): Promise<TransferMatchResponse> {
    const {
      transactions,
      dateRangeStart,
      dateRangeEnd,
      maxDaysDifference = 7, // Transfers usually happen within a week
      tolerancePercentage = 0.01 // 1% tolerance for amount differences
    } = request;

    // Filter transfer transactions within date range
    const candidateTransactions = transactions.filter(tx => 
      tx.type === 'transfer' && // Only transfer transactions for matching
      (!dateRangeStart || tx.date >= dateRangeStart) &&
      (!dateRangeEnd || tx.date <= dateRangeEnd) &&
      !tx.reimbursementId // Not already matched
    );

    const matches: TransferMatch[] = [];
    const matchedIds = new Set<string>();

    // Find potential matches using simple heuristics first
    for (const sourceTx of candidateTransactions) {
      if (matchedIds.has(sourceTx.id)) continue;

      for (const targetTx of candidateTransactions) {
        if (matchedIds.has(targetTx.id) || sourceTx.id === targetTx.id) continue;

        // Check if amounts are inverse (one positive, one negative, similar magnitude)
        // New requirement: If amounts aren't identical AND both have same currency (no conversion), 
        // only allow auto-matching for very small differences that could be fees (< $5 or < 0.5%)
        const sameCurrency = this.haveSameCurrency(sourceTx, targetTx);
        const amountsIdentical = Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)) < 0.01;
        const amountDiff = Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount));
        const avgAmount = (Math.abs(sourceTx.amount) + Math.abs(targetTx.amount)) / 2;
        const percentDiff = avgAmount > 0 ? amountDiff / avgAmount : 0;
        
        // For same currency transactions, only allow small differences that could be fees
        if (sameCurrency && !amountsIdentical) {
          // Allow small differences (< $5 AND < 0.3%) that could be due to fees
          const allowSmallFees = amountDiff < 5.0 && percentDiff < 0.003; // 0.3%
          if (!allowSmallFees) {
            continue; // Skip auto-matching for same-currency transactions with larger differences
          }
        }
        
        const amountMatch = this.areAmountsMatching(sourceTx.amount, targetTx.amount, tolerancePercentage);
        
        if (!amountMatch) continue;
        
        // If we reach here, it's either different currencies or acceptable same-currency amounts
        const shouldAutoMatch = true;

        // Check date proximity
        const dateDiff = Math.abs((sourceTx.date.getTime() - targetTx.date.getTime()) / (1000 * 60 * 60 * 24));
        if (dateDiff > maxDaysDifference) continue;

        // Check if accounts are different (transfers should be between different accounts)
        if (sourceTx.account === targetTx.account) continue;

        const match: TransferMatch = {
          id: `transfer-match-${sourceTx.id}-${targetTx.id}`,
          sourceTransactionId: sourceTx.id,
          targetTransactionId: targetTx.id,
          confidence: this.calculateMatchConfidence(sourceTx, targetTx, dateDiff, Math.abs(sourceTx.amount - Math.abs(targetTx.amount))),
          matchType: shouldAutoMatch && dateDiff === 0 && amountMatch ? 'exact' : 'approximate',
          dateDifference: Math.round(dateDiff),
          amountDifference: Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)),
          reasoning: `Transfer match: ${sourceTx.account} ↔ ${targetTx.account}, ${Math.round(dateDiff)} days apart`,
          isVerified: false
        };

        // Add to auto-matches since we've already filtered out same-currency non-identical amounts
        matches.push(match);
        matchedIds.add(sourceTx.id);
        matchedIds.add(targetTx.id);
        break; // Found a match for this transaction
      }
    }

    // Get unmatched transactions
    const unmatched = candidateTransactions.filter(tx => !matchedIds.has(tx.id));

    // Use AI to improve matching confidence for uncertain matches
    const improvedMatches = await this.enhanceMatchesWithAI(matches, transactions);

    return {
      matches: improvedMatches,
      unmatched,
      confidence: matches.length > 0 ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length : 0
    };
  }

  /**
   * Apply transfer matches to transactions
   */
  async applyTransferMatches(transactions: Transaction[], matches: TransferMatch[]): Promise<Transaction[]> {
    const updatedTransactions = [...transactions];
    
    for (const match of matches) {
      const sourceIndex = updatedTransactions.findIndex(tx => tx.id === match.sourceTransactionId);
      const targetIndex = updatedTransactions.findIndex(tx => tx.id === match.targetTransactionId);
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Link the transactions
        updatedTransactions[sourceIndex] = {
          ...updatedTransactions[sourceIndex],
          reimbursementId: match.targetTransactionId,
          notes: updatedTransactions[sourceIndex].notes 
            ? `${updatedTransactions[sourceIndex].notes}\n[Matched Transfer: ${match.confidence.toFixed(2)} confidence]`
            : `[Matched Transfer: ${match.confidence.toFixed(2)} confidence]`
        };
        
        updatedTransactions[targetIndex] = {
          ...updatedTransactions[targetIndex],
          reimbursementId: match.sourceTransactionId,
          notes: updatedTransactions[targetIndex].notes 
            ? `${updatedTransactions[targetIndex].notes}\n[Matched Transfer: ${match.confidence.toFixed(2)} confidence]`
            : `[Matched Transfer: ${match.confidence.toFixed(2)} confidence]`
        };
      }
    }
    
    return updatedTransactions;
  }

  private areAmountsMatching(amount1: number, amount2: number, tolerance: number): boolean {
    // For transfer matching, amounts must have opposite signs
    // One should be positive, the other negative
    if ((amount1 > 0) === (amount2 > 0)) {
      return false; // Same sign, cannot be a transfer match
    }
    
    const abs1 = Math.abs(amount1);
    const abs2 = Math.abs(amount2);
    const diff = Math.abs(abs1 - abs2);
    const avgAmount = (abs1 + abs2) / 2;
    
    // Check if amounts are similar within tolerance
    return avgAmount > 0 && (diff / avgAmount) <= tolerance;
  }

  private areAmountsMatchingForManualSearch(sourceTx: Transaction, targetTx: Transaction, tolerance: number): boolean {
    // For transfer matching, amounts must have opposite signs
    // One should be positive, the other negative
    if ((sourceTx.amount > 0) === (targetTx.amount > 0)) {
      console.log(`❌ Same signs detected:`, {
        source: { id: sourceTx.id.substring(0,8), amount: sourceTx.amount, sign: sourceTx.amount > 0 ? '+' : '-' },
        target: { id: targetTx.id.substring(0,8), amount: targetTx.amount, sign: targetTx.amount > 0 ? '+' : '-' }
      });
      return false; // Same sign, cannot be a transfer match
    }
    
    const abs1 = Math.abs(sourceTx.amount);
    const abs2 = Math.abs(targetTx.amount);
    const diff = Math.abs(abs1 - abs2);
    const avgAmount = (abs1 + abs2) / 2;
    
    // Check if amounts are similar within tolerance
    const isWithinTolerance = avgAmount > 0 && (diff / avgAmount) <= tolerance;
    
    if (!isWithinTolerance) {
      console.log(`❌ Amount tolerance exceeded:`, {
        source: { id: sourceTx.id.substring(0,8), amount: sourceTx.amount },
        target: { id: targetTx.id.substring(0,8), amount: targetTx.amount },
        abs1, abs2, diff, avgAmount,
        tolerancePercent: (diff / avgAmount * 100).toFixed(1) + '%',
        allowedTolerance: (tolerance * 100).toFixed(1) + '%'
      });
    }
    
    return isWithinTolerance;
  }

  private areAbsoluteAmountsMatching(amount1: number, amount2: number, tolerance: number): boolean {
    // For same-account matching, just check absolute value similarity
    // (opposite sign check is done separately before calling this)
    const abs1 = Math.abs(amount1);
    const abs2 = Math.abs(amount2);
    const diff = Math.abs(abs1 - abs2);
    const avgAmount = (abs1 + abs2) / 2;
    
    // Check if amounts are similar within tolerance
    return avgAmount > 0 && (diff / avgAmount) <= tolerance;
  }

  /**
   * Determines if a transfer match is manual (user-created) vs automatic (AI-created)
   * Manual matches: have reimbursementId but no automatic confidence notes
   * Automatic matches: have reimbursementId AND confidence notes like "[Matched Transfer: 0.85 confidence]"
   */
  private isManualMatch(transaction: Transaction): boolean {
    return !!transaction.reimbursementId && 
           !!transaction.notes && 
           !transaction.notes.includes('[Matched Transfer:');
  }

  private haveSameCurrency(tx1: Transaction, tx2: Transaction): boolean {
    // Get currencies from account information
    const tx1Currency = this.getTransactionCurrency(tx1);
    const tx2Currency = this.getTransactionCurrency(tx2);
    
    // If both have explicit original currencies, compare them
    if (tx1.originalCurrency && tx2.originalCurrency) {
      return tx1.originalCurrency === tx2.originalCurrency;
    }
    
    // Compare account currencies
    return tx1Currency === tx2Currency;
  }

  private calculateMatchConfidence(
    sourceTx: Transaction, 
    targetTx: Transaction, 
    dateDiff: number, 
    amountDiff: number
  ): number {
    let confidence = 0.5; // Base confidence
    
    // Date proximity bonus
    if (dateDiff === 0) confidence += 0.3;
    else if (dateDiff <= 1) confidence += 0.2;
    else if (dateDiff <= 3) confidence += 0.1;
    
    // Amount precision bonus
    if (amountDiff === 0) confidence += 0.3;
    else if (amountDiff <= 0.01) confidence += 0.2;
    else if (amountDiff <= 1) confidence += 0.1;
    
    return Math.min(confidence, 0.99); // Cap at 99%
  }

  private calculateManualMatchConfidence(
    sourceTx: Transaction, 
    targetTx: Transaction, 
    dateDiff: number, 
    amountDiff: number,
    sameCurrency: boolean
  ): number {
    let confidence = 0.4; // Lower base confidence for manual matches with relaxed criteria
    
    // Date proximity bonus (more forgiving for manual matches)
    if (dateDiff === 0) confidence += 0.2;
    else if (dateDiff <= 1) confidence += 0.15;
    else if (dateDiff <= 3) confidence += 0.1;
    else if (dateDiff <= 8) confidence += 0.05; // Still some bonus for within 8 days
    
    // Amount precision bonus (adjusted for exchange rate tolerance)
    if (amountDiff === 0) confidence += 0.3;
    else if (amountDiff <= 0.01) confidence += 0.25;
    else if (amountDiff <= 1) confidence += 0.15;
    else if (!sameCurrency && amountDiff <= Math.max(sourceTx.amount, targetTx.amount) * 0.12) {
      // Exchange rate tolerance - up to 12% difference is acceptable
      confidence += 0.1;
    }
    
    // Currency matching bonus
    if (sameCurrency) {
      confidence += 0.1; // Same currency is more reliable
    } else {
      confidence -= 0.05; // Different currency requires more caution
    }
    
    return Math.min(confidence, 0.85); // Cap at 85% for manual matches due to relaxed criteria
  }

  private async enhanceMatchesWithAI(matches: TransferMatch[], allTransactions: Transaction[]): Promise<TransferMatch[]> {
    // For now, return matches as-is. In a full implementation, we could use AI to:
    // 1. Analyze transaction descriptions for transfer-like patterns
    // 2. Identify account relationships
    // 3. Improve confidence scoring based on historical patterns
    
    return matches;
  }

  /**
   * Automatically find and apply transfer matches to transactions
   * Only applies matches with confidence >= 0.4 (40%)
   * PRESERVES EXISTING MANUAL MATCHES - never overrides user's manual matching decisions
   */
  async autoMatchTransfers(transactions: Transaction[]): Promise<Transaction[]> {
    const transferTransactions = transactions.filter(tx => tx.type === 'transfer');
    
    if (transferTransactions.length === 0) {
      return transactions;
    }

    // CRITICAL: Identify existing manual matches to preserve them
    const existingManualMatches = new Set<string>();
    transferTransactions.forEach(tx => {
      if (this.isManualMatch(tx)) {
        // This is a manual match - preserve it
        existingManualMatches.add(tx.id);
        existingManualMatches.add(tx.reimbursementId!);
        console.log(`🔒 Preserving manual match: ${tx.id} ↔ ${tx.reimbursementId}`);
      }
    });

    const matchRequest: TransferMatchRequest = {
      transactions: transferTransactions,
      maxDaysDifference: 7,
      tolerancePercentage: 0.05 // 5% tolerance for fees and currency conversion
    };

    const matchResult = await this.findTransferMatches(matchRequest);
    if (matchResult.matches.length === 0) {
      return transactions;
    }

    // Filter matches to only include high-confidence ones (>= 40%) AND exclude existing manual matches
    const highConfidenceMatches = matchResult.matches.filter(match => {
      const confidence40Plus = match.confidence >= 0.4;
      const notManualMatch = !existingManualMatches.has(match.sourceTransactionId) && 
                            !existingManualMatches.has(match.targetTransactionId);
      
      if (!notManualMatch) {
        console.log(`🔒 Skipping auto-match (preserving manual): ${match.sourceTransactionId} ↔ ${match.targetTransactionId}`);
      }
      
      return confidence40Plus && notManualMatch;
    });
    
    if (highConfidenceMatches.length === 0) {
      const manualSkipped = matchResult.matches.filter(match => 
        existingManualMatches.has(match.sourceTransactionId) || existingManualMatches.has(match.targetTransactionId)
      ).length;
      console.log(`🔄 Found ${matchResult.matches.length} transfer matches, but none meet 40% confidence threshold after excluding ${manualSkipped} manual matches`);
      return transactions;
    }

    console.log(`🔄 Auto-matching ${highConfidenceMatches.length} transfer pairs (${matchResult.matches.length} total found, preserved ${existingManualMatches.size/2} manual matches) at ≥40% confidence`);
    return await this.applyTransferMatches(transactions, highConfidenceMatches);
  }

  /**
   * Create collapsed transfer representations from matched transfers
   */
  createCollapsedTransfers(transactions: Transaction[]): CollapsedTransfer[] {
    const collapsedTransfers: CollapsedTransfer[] = [];
    const processedIds = new Set<string>();

    const matchedTransfers = transactions.filter(tx => 
      tx.type === 'transfer' && tx.reimbursementId && !processedIds.has(tx.id)
    );

    for (const tx of matchedTransfers) {
      if (processedIds.has(tx.id)) continue;

      const matchedTx = transactions.find(t => t.id === tx.reimbursementId);
      if (!matchedTx || processedIds.has(matchedTx.id)) continue;

      // Determine source and target (source is the negative amount)
      const [sourceTx, targetTx] = tx.amount < 0 ? [tx, matchedTx] : [matchedTx, tx];
      
      const dateDiff = Math.abs((sourceTx.date.getTime() - targetTx.date.getTime()) / (1000 * 60 * 60 * 24));
      const amountDiff = Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount));
      
      const collapsed: CollapsedTransfer = {
        id: `collapsed-${sourceTx.id}-${targetTx.id}`,
        date: sourceTx.date,
        description: this.generateTransferDescription(sourceTx, targetTx),
        sourceAccount: sourceTx.account,
        targetAccount: targetTx.account,
        amount: Math.abs(sourceTx.amount),
        sourceTransaction: sourceTx,
        targetTransaction: targetTx,
        confidence: this.calculateMatchConfidence(sourceTx, targetTx, dateDiff, amountDiff),
        matchType: dateDiff === 0 && amountDiff === 0 ? 'exact' : 'approximate',
        amountDifference: amountDiff,
        exchangeRate: sourceTx.exchangeRate || targetTx.exchangeRate,
        fees: [] // TODO: Implement fee detection
      };

      collapsedTransfers.push(collapsed);
      processedIds.add(sourceTx.id);
      processedIds.add(targetTx.id);
    }

    return collapsedTransfers;
  }

  /**
   * Generate a descriptive name for a collapsed transfer
   */
  private generateTransferDescription(sourceTx: Transaction, targetTx: Transaction): string {
    // Clean up common transfer patterns
    const sourceDesc = sourceTx.description
      .replace(/^(Transfer to|Transfer from|ATM Withdrawal|Deposit)\s*-?\s*/i, '')
      .replace(/\s*-\s*\w+\s*(Online|ATM|Branch).*$/i, '');
    
    const targetDesc = targetTx.description
      .replace(/^(Transfer to|Transfer from|ATM Withdrawal|Deposit)\s*-?\s*/i, '')
      .replace(/\s*-\s*\w+\s*(Online|ATM|Branch).*$/i, '');

    // Use the more descriptive one, or create a generic description
    if (sourceDesc.toLowerCase().includes('atm')) {
      return 'ATM Withdrawal';
    } else if (sourceDesc && sourceDesc !== targetDesc) {
      return `Transfer: ${sourceDesc}`;
    } else if (targetDesc) {
      return `Transfer: ${targetDesc}`;
    } else {
      return `Transfer: ${sourceTx.account} → ${targetTx.account}`;
    }
  }

  /**
   * Filter transactions to exclude matched transfers (for hiding transfers by default)
   */
  filterNonTransfers(transactions: Transaction[]): Transaction[] {
    return transactions.filter(tx => {
      // Include non-transfer transactions
      if (tx.type !== 'transfer') return true;
      
      // Include unmatched transfers (they might be potential transfers needing review)
      return !tx.reimbursementId;
    });
  }

  /**
   * Get all transfer-related transactions (matched and unmatched)
   */
  getAllTransfers(transactions: Transaction[]): Transaction[] {
    return transactions.filter(tx => tx.type === 'transfer');
  }
  getUnmatchedTransfers(transactions: Transaction[]): Transaction[] {
    return transactions.filter(tx => 
      tx.type === 'transfer' && !tx.reimbursementId
    );
  }

  /**
   * Count unmatched transfers for UI indicators
   */
  countUnmatchedTransfers(transactions: Transaction[]): number {
    return this.getUnmatchedTransfers(transactions).length;
  }

  /**
   * Unmatch a transfer match by removing the link between transactions
   */
  async unmatchTransfers(transactions: Transaction[], matchId: string): Promise<Transaction[]> {
    const match = this.parseMatchId(matchId);
    if (!match) return transactions;

    const updatedTransactions = [...transactions];
    
    // Find the source and target transactions
    const sourceIndex = updatedTransactions.findIndex(tx => tx.id === match.sourceId);
    const targetIndex = updatedTransactions.findIndex(tx => tx.id === match.targetId);
    
    if (sourceIndex !== -1 && targetIndex !== -1) {
      // Remove the reimbursementId link and update notes
      updatedTransactions[sourceIndex] = {
        ...updatedTransactions[sourceIndex],
        reimbursementId: undefined,
        notes: this.removeMatchNoteFromTransaction(updatedTransactions[sourceIndex].notes || '')
      };
      
      updatedTransactions[targetIndex] = {
        ...updatedTransactions[targetIndex],
        reimbursementId: undefined,
        notes: this.removeMatchNoteFromTransaction(updatedTransactions[targetIndex].notes || '')
      };
    }
    
    return updatedTransactions;
  }

  /**
   * Get all matched transfers with their match details
   */
  getMatchedTransfers(transactions: Transaction[]): TransferMatch[] {
    const matches: TransferMatch[] = [];
    const processedIds = new Set<string>();

    const matchedTransfers = transactions.filter(tx => 
      tx.type === 'transfer' && tx.reimbursementId
    );

    for (const tx of matchedTransfers) {
      if (processedIds.has(tx.id)) continue;

      const matchedTx = transactions.find(t => t.id === tx.reimbursementId);
      if (matchedTx && !processedIds.has(matchedTx.id)) {
        const dateDiff = Math.abs((tx.date.getTime() - matchedTx.date.getTime()) / (1000 * 60 * 60 * 24));
        const amountDiff = Math.abs(Math.abs(tx.amount) - Math.abs(matchedTx.amount));
        
        const match: TransferMatch = {
          id: `transfer-match-${tx.id}-${matchedTx.id}`,
          sourceTransactionId: tx.id,
          targetTransactionId: matchedTx.id,
          confidence: this.calculateMatchConfidence(tx, matchedTx, dateDiff, amountDiff),
          matchType: 'manual', // Existing matches are considered manual/verified
          dateDifference: Math.round(dateDiff),
          amountDifference: amountDiff,
          reasoning: `Existing match: ${tx.account} ↔ ${matchedTx.account}`,
          isVerified: true
        };

        matches.push(match);
        processedIds.add(tx.id);
        processedIds.add(matchedTx.id);
      }
    }

    return matches;
  }

  /**
   * Manually match two transfer transactions
   */
  async manuallyMatchTransfers(
    transactions: Transaction[], 
    sourceId: string, 
    targetId: string
  ): Promise<Transaction[]> {
    const updatedTransactions = [...transactions];
    
    const sourceIndex = updatedTransactions.findIndex(tx => tx.id === sourceId);
    const targetIndex = updatedTransactions.findIndex(tx => tx.id === targetId);
    
    if (sourceIndex !== -1 && targetIndex !== -1) {
      const sourceTx = updatedTransactions[sourceIndex];
      const targetTx = updatedTransactions[targetIndex];
      
      // Validate that this is a reasonable match
      if (sourceTx.type !== 'transfer' || targetTx.type !== 'transfer') {
        throw new Error('Both transactions must be transfer type');
      }
      
      if (sourceTx.account === targetTx.account) {
        throw new Error('Cannot match transfers within the same account');
      }
      
      // Link the transactions
      const sourceUpdates = {
        reimbursementId: targetId,
        notes: sourceTx.notes 
          ? `${sourceTx.notes}\n[Manual Transfer Match]`
          : '[Manual Transfer Match]'
      };

      const targetUpdates = {
        reimbursementId: sourceId,
        notes: targetTx.notes 
          ? `${targetTx.notes}\n[Manual Transfer Match]`
          : '[Manual Transfer Match]'
      };

      // Update the in-memory array
      updatedTransactions[sourceIndex] = {
        ...updatedTransactions[sourceIndex],
        ...sourceUpdates
      };
      
      updatedTransactions[targetIndex] = {
        ...updatedTransactions[targetIndex],
        ...targetUpdates
      };

      // Persist changes to database
      console.log('💾 Persisting manual transfer match to database...', { sourceId, targetId });
      
      try {
        await dataService.batchUpdateTransactions([
          { id: sourceId, updates: sourceUpdates, note: 'Manual transfer match applied' },
          { id: targetId, updates: targetUpdates, note: 'Manual transfer match applied' }
        ]);
        
        console.log('✅ Manual transfer match persisted successfully');
      } catch (error) {
        console.error('❌ Failed to persist manual transfer match:', error);
        throw new Error('Failed to save manual transfer match to database');
      }
    }
    
    return updatedTransactions;
  }

  private parseMatchId(matchId: string): { sourceId: string; targetId: string } | null {
    const match = matchId.match(/transfer-match-(.+)-(.+)/);
    if (match) {
      return { sourceId: match[1], targetId: match[2] };
    }
    return null;
  }

  /**
   * Find matching transactions within the same account (cancelled/reversed transactions)
   */
  async findSameAccountMatches(request: SameAccountMatchRequest): Promise<SameAccountMatchResponse> {
    const {
      transactions,
      dateRangeStart,
      dateRangeEnd,
      maxDaysDifference = 1, // Default: within 1 day for cancellations/reversals
      tolerancePercentage = 0.01 // 1% tolerance for amount differences
    } = request;

    // Filter transactions within date range (excluding transfers as they are handled separately)
    const candidateTransactions = transactions.filter(tx => 
      tx.type !== 'transfer' && // Exclude transfers - they are handled by transfer matching
      (!dateRangeStart || tx.date >= dateRangeStart) &&
      (!dateRangeEnd || tx.date <= dateRangeEnd) &&
      !tx.reimbursementId // Not already matched
    );

    const matches: SameAccountMatch[] = [];
    const matchedIds = new Set<string>();

    // Find potential same-account matches
    for (const sourceTx of candidateTransactions) {
      if (matchedIds.has(sourceTx.id)) continue;

      for (const targetTx of candidateTransactions) {
        if (matchedIds.has(targetTx.id) || sourceTx.id === targetTx.id) continue;

        // Must be in the same account
        if (sourceTx.account !== targetTx.account) continue;

        // Must have opposite amounts (one positive, one negative, similar magnitude)
        if ((sourceTx.amount > 0) === (targetTx.amount > 0)) continue;

        // Check if amounts match within tolerance (for same-account, we already know they have opposite signs from the check above)
        const amountMatch = this.areAbsoluteAmountsMatching(sourceTx.amount, targetTx.amount, tolerancePercentage);
        if (!amountMatch) continue;

        // Check date proximity
        const dateDiff = Math.abs((sourceTx.date.getTime() - targetTx.date.getTime()) / (1000 * 60 * 60 * 24));
        if (dateDiff > maxDaysDifference) continue;

        const match: SameAccountMatch = {
          id: `same-account-match-${sourceTx.id}-${targetTx.id}`,
          sourceTransactionId: sourceTx.id,
          targetTransactionId: targetTx.id,
          confidence: this.calculateSameAccountMatchConfidence(sourceTx, targetTx, dateDiff, Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount))),
          matchType: dateDiff === 0 && Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)) < 0.01 ? 'exact' : 'approximate',
          dateDifference: Math.round(dateDiff),
          amountDifference: Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)),
          reasoning: `Same account matched transaction: ${sourceTx.account}, ${Math.round(dateDiff)} days apart, amounts: ${sourceTx.amount} / ${targetTx.amount}`,
          isVerified: false
        };

        matches.push(match);
        matchedIds.add(sourceTx.id);
        matchedIds.add(targetTx.id);
        break; // Found a match for this transaction
      }
    }

    // Get unmatched transactions (only those that could potentially be matched)
    const unmatched = candidateTransactions.filter(tx => !matchedIds.has(tx.id));

    return {
      matches,
      unmatched,
      confidence: matches.length > 0 ? matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length : 0
    };
  }

  /**
   * Apply same-account matches to transactions
   */
  async applySameAccountMatches(transactions: Transaction[], matches: SameAccountMatch[]): Promise<Transaction[]> {
    const updatedTransactions = [...transactions];
    
    for (const match of matches) {
      const sourceIndex = updatedTransactions.findIndex(tx => tx.id === match.sourceTransactionId);
      const targetIndex = updatedTransactions.findIndex(tx => tx.id === match.targetTransactionId);
      
      if (sourceIndex !== -1 && targetIndex !== -1) {
        // Link the transactions using reimbursementId (reusing existing field)
        updatedTransactions[sourceIndex] = {
          ...updatedTransactions[sourceIndex],
          reimbursementId: match.targetTransactionId,
          notes: updatedTransactions[sourceIndex].notes 
            ? `${updatedTransactions[sourceIndex].notes}\n[Matched Transaction: ${match.confidence.toFixed(2)} confidence]`
            : `[Matched Transaction: ${match.confidence.toFixed(2)} confidence]`
        };
        
        updatedTransactions[targetIndex] = {
          ...updatedTransactions[targetIndex],
          reimbursementId: match.sourceTransactionId,
          notes: updatedTransactions[targetIndex].notes 
            ? `${updatedTransactions[targetIndex].notes}\n[Matched Transaction: ${match.confidence.toFixed(2)} confidence]`
            : `[Matched Transaction: ${match.confidence.toFixed(2)} confidence]`
        };
      }
    }
    
    return updatedTransactions;
  }

  /**
   * Automatically find and apply same-account matches to transactions
   * Only applies matches with confidence >= 0.7 (70%)
   */
  async autoMatchSameAccountTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const matchRequest: SameAccountMatchRequest = {
      transactions,
      maxDaysDifference: 1, // Within 1 day for cancellations
      tolerancePercentage: 0.01 // 1% tolerance
    };

    const matchResult = await this.findSameAccountMatches(matchRequest);
    if (matchResult.matches.length === 0) {
      return transactions;
    }

    // Filter matches to only include high-confidence ones (>= 70%)
    const highConfidenceMatches = matchResult.matches.filter(match => match.confidence >= 0.7);
    
    if (highConfidenceMatches.length === 0) {
      console.log(`🔄 Found ${matchResult.matches.length} same-account matches, but none meet 70% confidence threshold`);
      return transactions;
    }

    console.log(`🔄 Auto-matching ${highConfidenceMatches.length} same-account pairs (${matchResult.matches.length} total found) at ≥70% confidence`);
    return await this.applySameAccountMatches(transactions, highConfidenceMatches);
  }

  private calculateSameAccountMatchConfidence(
    sourceTx: Transaction, 
    targetTx: Transaction, 
    dateDiff: number, 
    amountDiff: number
  ): number {
    let confidence = 0.5; // Lower base confidence for same-account opposite amounts
    
    // Date proximity bonus (higher for same-account matches since they should be very close)
    if (dateDiff === 0) confidence += 0.3; // Same day is very likely
    else if (dateDiff <= 1) confidence += 0.1; // Next day is possible but less confident
    
    // Amount precision bonus (should be exact or very close for cancellations)
    if (amountDiff === 0) confidence += 0.15; // Exact match is very important
    else if (amountDiff <= 0.01) confidence += 0.1;
    else confidence -= 0.1; // Penalize amount differences
    
    // Description similarity bonus for cancellation patterns
    if (this.areDescriptionsIndicatingCancellation(sourceTx.description, targetTx.description)) {
      confidence += 0.2; // Strong indicator
    } else {
      confidence -= 0.05; // Penalty for dissimilar descriptions
    }
    
    return Math.min(Math.max(confidence, 0), 0.99); // Clamp between 0 and 99%
  }

  private areDescriptionsIndicatingCancellation(desc1: string, desc2: string): boolean {
    const desc1Lower = desc1.toLowerCase();
    const desc2Lower = desc2.toLowerCase();
    
    // Check for cancellation/reversal keywords
    const cancellationWords = ['cancel', 'reverse', 'reversal', 'refund', 'correction', 'adjustment'];
    const hasCancellationWords = cancellationWords.some(word => 
      desc1Lower.includes(word) || desc2Lower.includes(word)
    );
    
    if (hasCancellationWords) return true;
    
    // Check if descriptions are very similar (likely same merchant/transaction)
    const words1 = desc1Lower.split(/\s+/).filter(word => word.length > 2);
    const words2 = desc2Lower.split(/\s+/).filter(word => word.length > 2);
    
    if (words1.length === 0 || words2.length === 0) return false;
    
    const commonWords = words1.filter(word => words2.includes(word));
    const similarity = (commonWords.length * 2) / (words1.length + words2.length);
    
    return similarity >= 0.6; // 60% word similarity indicates likely same transaction
  }

  private removeMatchNoteFromTransaction(notes: string): string {
    return notes
      .replace(/\n?\[Matched Transfer: .+?\]/g, '')
      .replace(/\n?\[Manual Transfer Match\]/g, '')
      .replace(/\n?\[Matched Transaction: .+?\]/g, '') // Add support for same-account matches
      .trim();
  }
}

export const transferMatchingService = new TransferMatchingService();