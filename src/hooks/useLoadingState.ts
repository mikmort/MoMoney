import { useState, useCallback } from 'react';

interface UseLoadingStateReturn<T> {
  isLoading: boolean;
  error: string | null;
  execute: (asyncFunction: () => Promise<T>) => Promise<T | null>;
  setError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Custom hook to manage loading and error states for async operations
 * Reduces duplicate loading/error handling patterns across components
 */
export const useLoadingState = <T = any>(): UseLoadingStateReturn<T> => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (asyncFunction: () => Promise<T>): Promise<T | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await asyncFunction();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    isLoading,
    error,
    execute,
    setError,
    clearError
  };
};

export default useLoadingState;