import { useState, useCallback } from 'react';
import { Transaction } from '../types';
import { 
  transferMatchingService, 
  TransferMatch, 
  TransferMatchRequest, 
  TransferMatchResponse 
} from '../services/transferMatchingService';

export const useTransferMatching = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<TransferMatch[]>([]);
  const [lastMatchResult, setLastMatchResult] = useState<TransferMatchResponse | null>(null);

  const findTransferMatches = useCallback(async (request: TransferMatchRequest): Promise<TransferMatchResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Finding transfer matches...', request);
      const result = await transferMatchingService.findTransferMatches(request);
      
      setMatches(result.matches);
      setLastMatchResult(result);
      
      console.log(`✅ Found ${result.matches.length} transfer matches`, result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error finding transfer matches:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const findManualTransferMatches = useCallback(async (request: TransferMatchRequest): Promise<TransferMatchResponse | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔍 Finding manual transfer matches with relaxed criteria...', request);
      const result = await transferMatchingService.findManualTransferMatches(request);
      
      setMatches(result.matches);
      setLastMatchResult(result);
      
      console.log(`✅ Found ${result.matches.length} possible transfer matches (manual search)`, result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error finding manual transfer matches:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const applyTransferMatches = useCallback(async (transactions: Transaction[], matchesToApply: TransferMatch[]): Promise<Transaction[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('✅ Applying transfer matches...', matchesToApply);
      const updatedTransactions = await transferMatchingService.applyTransferMatches(transactions, matchesToApply);
      
      // Remove applied matches from state
      const appliedIds = new Set(matchesToApply.map(m => m.id));
      setMatches(prev => prev.filter(m => !appliedIds.has(m.id)));
      
      console.log('✅ Transfer matches applied successfully');
      return updatedTransactions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error applying transfer matches:', err);
      return transactions; // Return original on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getUnmatchedTransfers = useCallback((transactions: Transaction[]): Transaction[] => {
    return transferMatchingService.getUnmatchedTransfers(transactions);
  }, []);

  const countUnmatchedTransfers = useCallback((transactions: Transaction[]): number => {
    return transferMatchingService.countUnmatchedTransfers(transactions);
  }, []);

  const unmatchTransfers = useCallback(async (transactions: Transaction[], matchId: string): Promise<Transaction[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔓 Unmatching transfers...', matchId);
      const updatedTransactions = await transferMatchingService.unmatchTransfers(transactions, matchId);
      console.log('✅ Transfer unmatch completed successfully');
      return updatedTransactions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error unmatching transfers:', err);
      return transactions; // Return original on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getMatchedTransfers = useCallback((transactions: Transaction[]) => {
    return transferMatchingService.getMatchedTransfers(transactions);
  }, []);

  const manuallyMatchTransfers = useCallback(async (
    transactions: Transaction[], 
    sourceId: string, 
    targetId: string
  ): Promise<Transaction[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('🔗 Manually matching transfers...', sourceId, targetId);
      const updatedTransactions = await transferMatchingService.manuallyMatchTransfers(
        transactions, 
        sourceId, 
        targetId
      );
      console.log('✅ Manual transfer match completed successfully');
      return updatedTransactions;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('❌ Error manually matching transfers:', err);
      return transactions; // Return original on error
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    matches,
    lastMatchResult,
    findTransferMatches,
    findManualTransferMatches,
    applyTransferMatches,
    getUnmatchedTransfers,
    countUnmatchedTransfers,
    unmatchTransfers,
    getMatchedTransfers,
    manuallyMatchTransfers
  };
};