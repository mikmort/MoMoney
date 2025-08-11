import { useState, useEffect, useCallback } from 'react';
import { Account } from '../types';
import { accountManagementService, AccountDetectionRequest, AccountDetectionResponse } from '../services/accountManagementService';

export interface UseAccountManagementResult {
  accounts: Account[];
  isLoading: boolean;
  error: string | null;
  addAccount: (account: Omit<Account, 'id'>) => Promise<Account>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<Account | null>;
  deleteAccount: (id: string) => Promise<boolean>;
  detectAccount: (request: AccountDetectionRequest) => Promise<AccountDetectionResponse>;
  getAccount: (id: string) => Account | undefined;
  refreshAccounts: () => void;
}

export const useAccountManagement = (): UseAccountManagementResult => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load accounts on mount
  const refreshAccounts = useCallback(() => {
    setIsLoading(true);
    setError(null);
    
    try {
      const loadedAccounts = accountManagementService.getAccounts();
      setAccounts(loadedAccounts);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load accounts';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshAccounts();
  }, [refreshAccounts]);

  const addAccount = useCallback(async (accountData: Omit<Account, 'id'>): Promise<Account> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const newAccount = accountManagementService.addAccount(accountData);
      setAccounts(prev => [...prev, newAccount]);
      return newAccount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add account';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const updateAccount = useCallback(async (id: string, updates: Partial<Account>): Promise<Account | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const updatedAccount = await accountManagementService.updateAccount(id, updates);
      if (updatedAccount) {
        setAccounts(prev => prev.map(acc => acc.id === id ? updatedAccount : acc));
      }
      return updatedAccount;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update account';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteAccount = useCallback(async (id: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const success = await accountManagementService.deleteAccount(id);
      if (success) {
        setAccounts(prev => prev.filter(acc => acc.id !== id));
      }
      return success;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete account';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const detectAccount = useCallback(async (request: AccountDetectionRequest): Promise<AccountDetectionResponse> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const result = await accountManagementService.detectAccountFromFile(request);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to detect account';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getAccount = useCallback((id: string): Account | undefined => {
    return accountManagementService.getAccount(id);
  }, []);

  return {
    accounts,
    isLoading,
    error,
    addAccount,
    updateAccount,
    deleteAccount,
    detectAccount,
    getAccount,
    refreshAccounts
  };
};
