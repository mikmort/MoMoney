import { Transaction } from '../types';
import { azureOpenAIService } from './azureOpenAIService';

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

class TransferMatchingService {
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
    const transferTransactions = transactions.filter(tx => 
      tx.type === 'transfer' &&
      (!dateRangeStart || tx.date >= dateRangeStart) &&
      (!dateRangeEnd || tx.date <= dateRangeEnd) &&
      !tx.reimbursementId // Not already matched
    );

    const matches: TransferMatch[] = [];
    const matchedIds = new Set<string>();

    // Find potential matches using simple heuristics first
    for (const sourceTx of transferTransactions) {
      if (matchedIds.has(sourceTx.id)) continue;

      for (const targetTx of transferTransactions) {
        if (matchedIds.has(targetTx.id) || sourceTx.id === targetTx.id) continue;

        // Check if amounts are inverse (one positive, one negative, similar magnitude)
        const amountMatch = this.areAmountsMatching(sourceTx.amount, targetTx.amount, tolerancePercentage);
        
        if (!amountMatch) continue;

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
          matchType: dateDiff === 0 && amountMatch ? 'exact' : 'approximate',
          dateDifference: dateDiff,
          amountDifference: Math.abs(Math.abs(sourceTx.amount) - Math.abs(targetTx.amount)),
          reasoning: `Transfer match: ${sourceTx.account} ↔ ${targetTx.account}, ${dateDiff} days apart`,
          isVerified: false
        };

        matches.push(match);
        matchedIds.add(sourceTx.id);
        matchedIds.add(targetTx.id);
        break; // Found a match for this transaction
      }
    }

    // Get unmatched transfers
    const unmatched = transferTransactions.filter(tx => !matchedIds.has(tx.id));

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
    const abs1 = Math.abs(amount1);
    const abs2 = Math.abs(amount2);
    const diff = Math.abs(abs1 - abs2);
    const avgAmount = (abs1 + abs2) / 2;
    
    // Check if amounts are similar within tolerance
    return avgAmount > 0 && (diff / avgAmount) <= tolerance;
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
    
    // Description similarity bonus (basic check)
    if (this.areDescriptionsSimilar(sourceTx.description, targetTx.description)) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 0.99); // Cap at 99%
  }

  private areDescriptionsSimilar(desc1: string, desc2: string): boolean {
    const words1 = desc1.toLowerCase().split(/\s+/);
    const words2 = desc2.toLowerCase().split(/\s+/);
    
    // Check for common words indicating transfers
    const transferWords = ['transfer', 'move', 'atm', 'withdrawal', 'deposit'];
    const hasTransferWords1 = words1.some(word => transferWords.includes(word));
    const hasTransferWords2 = words2.some(word => transferWords.includes(word));
    
    return hasTransferWords1 || hasTransferWords2;
  }

  private async enhanceMatchesWithAI(matches: TransferMatch[], allTransactions: Transaction[]): Promise<TransferMatch[]> {
    // For now, return matches as-is. In a full implementation, we could use AI to:
    // 1. Analyze transaction descriptions for transfer-like patterns
    // 2. Identify account relationships
    // 3. Improve confidence scoring based on historical patterns
    
    return matches;
  }

  /**
   * Get unmatched transfer transactions
   */
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
}

export const transferMatchingService = new TransferMatchingService();