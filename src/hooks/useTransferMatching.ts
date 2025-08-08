import { useState } from 'react';
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

  const findTransferMatches = async (request: TransferMatchRequest): Promise<TransferMatchResponse | null> => {
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
  };

  const applyTransferMatches = async (transactions: Transaction[], matchesToApply: TransferMatch[]): Promise<Transaction[]> => {
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
  };

  const getUnmatchedTransfers = (transactions: Transaction[]): Transaction[] => {
    return transferMatchingService.getUnmatchedTransfers(transactions);
  };

  const countUnmatchedTransfers = (transactions: Transaction[]): number => {
    return transferMatchingService.countUnmatchedTransfers(transactions);
  };

  return {
    isLoading,
    error,
    matches,
    lastMatchResult,
    findTransferMatches,
    applyTransferMatches,
    getUnmatchedTransfers,
    countUnmatchedTransfers
  };
};