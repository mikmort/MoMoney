import { useState, useCallback } from 'react';
import { Transaction, ReimbursementMatch, ReimbursementMatchRequest } from '../types';
import { reimbursementMatchingService } from '../services/reimbursementMatchingService';

export const useReimbursementMatching = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<ReimbursementMatch[]>([]);

  const findMatches = useCallback(async (request: ReimbursementMatchRequest) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await reimbursementMatchingService.findReimbursementMatches(request);
      setMatches(result.matches);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to find reimbursement matches';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyMatches = useCallback(async (transactions: Transaction[], matchesToApply: ReimbursementMatch[]) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const updatedTransactions = await reimbursementMatchingService.applyReimbursementMatches(
        transactions, 
        matchesToApply
      );
      return updatedTransactions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply reimbursement matches';
      setError(errorMessage);
      return transactions; // Return original transactions on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const filterNonReimbursed = useCallback((transactions: Transaction[]) => {
    return reimbursementMatchingService.filterNonReimbursedTransactions(transactions);
  }, []);

  const createManualMatch = useCallback((expenseId: string, reimbursementId: string, reasoning?: string): ReimbursementMatch => {
    return {
      id: `${expenseId}-${reimbursementId}`,
      expenseTransactionId: expenseId,
      reimbursementTransactionId: reimbursementId,
      confidence: 1.0,
      matchType: 'manual',
      dateDifference: 0, // Will be calculated when applied
      amountDifference: 0, // Will be calculated when applied
      reasoning: reasoning || 'Manually matched by user',
      isVerified: true
    };
  }, []);

  return {
    isLoading,
    error,
    matches,
    findMatches,
    applyMatches,
    filterNonReimbursed,
    createManualMatch
  };
};
