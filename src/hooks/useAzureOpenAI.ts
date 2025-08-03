import { useState, useCallback } from 'react';
import { azureOpenAIService } from '../services/azureOpenAIService';

export const useAzureOpenAI = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const testConnection = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await azureOpenAIService.testConnection();
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getServiceInfo = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const info = await azureOpenAIService.getServiceInfo();
      return info;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get service info';
      setError(errorMessage);
      return { status: 'error', model: 'unknown', initialized: false };
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    isLoading,
    error,
    testConnection,
    getServiceInfo
  };
};
