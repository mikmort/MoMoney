import { Transaction, TransactionSplit } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Utility functions for working with transaction splits
 */

/**
 * Check if a transaction has splits
 */
export const hasTransactionSplits = (transaction: Transaction): boolean => {
  return !!(transaction.splits && transaction.splits.length > 0);
};

/**
 * Get the total amount of all splits for a transaction
 */
export const getSplitTotal = (splits: TransactionSplit[]): number => {
  return splits.reduce((total, split) => total + split.amount, 0);
};

/**
 * Validate that splits add up to the transaction amount
 */
export const validateSplits = (transaction: Transaction): {
  isValid: boolean;
  difference: number;
  message?: string;
} => {
  if (!hasTransactionSplits(transaction)) {
    return { isValid: true, difference: 0 };
  }

  const splitTotal = getSplitTotal(transaction.splits!);
  const difference = Math.abs(transaction.amount) - Math.abs(splitTotal);
  const tolerance = 0.01; // Allow 1 cent difference for rounding

  if (Math.abs(difference) <= tolerance) {
    return { isValid: true, difference: 0 };
  }

  const message = difference > 0 
    ? `Splits total $${Math.abs(splitTotal).toFixed(2)} but transaction amount is $${Math.abs(transaction.amount).toFixed(2)}. Missing $${difference.toFixed(2)}`
    : `Splits total $${Math.abs(splitTotal).toFixed(2)} but transaction amount is $${Math.abs(transaction.amount).toFixed(2)}. Over by $${Math.abs(difference).toFixed(2)}`;

  return { isValid: false, difference, message };
};

/**
 * Create a new empty split for a transaction
 */
export const createEmptySplit = (defaultCategory = '', defaultSubcategory = ''): TransactionSplit => ({
  id: uuidv4(),
  amount: 0,
  category: defaultCategory,
  subcategory: defaultSubcategory,
});

/**
 * Convert a regular transaction to use splits
 * Creates a single split with the transaction's current category and amount
 */
export const convertToSplitTransaction = (transaction: Transaction): TransactionSplit[] => {
  return [{
    id: uuidv4(),
    amount: transaction.amount,
    category: transaction.category,
    subcategory: transaction.subcategory,
  }];
};

/**
 * Get the effective category for display purposes
 * For split transactions, returns a summary string
 */
export const getEffectiveCategory = (transaction: Transaction): string => {
  if (!hasTransactionSplits(transaction)) {
    return transaction.subcategory 
      ? `${transaction.category} → ${transaction.subcategory}`
      : transaction.category;
  }

  const splits = transaction.splits!;
  if (splits.length === 1) {
    const split = splits[0];
    return split.subcategory 
      ? `${split.category} → ${split.subcategory}`
      : split.category;
  }

  // Multiple splits - show summary
  const uniqueCategories = new Set(splits.map(s => s.category));
  if (uniqueCategories.size === 1) {
    const category = Array.from(uniqueCategories)[0];
    return `${category} (${splits.length} splits)`;
  }

  return `Multiple Categories (${splits.length} splits)`;
};

/**
 * Get formatted amount display for split transactions
 */
export const getFormattedAmount = (transaction: Transaction): string => {
  const amount = transaction.amount;
  const absAmount = Math.abs(amount);
  const prefix = amount >= 0 ? '' : '-';
  return `${prefix}$${absAmount.toFixed(2)}`;
};

/**
 * Remove a split from a transaction
 */
export const removeSplit = (transaction: Transaction, splitId: string): TransactionSplit[] => {
  if (!hasTransactionSplits(transaction)) {
    return [];
  }
  return transaction.splits!.filter(split => split.id !== splitId);
};

/**
 * Update a specific split in a transaction
 */
export const updateSplit = (
  transaction: Transaction, 
  splitId: string, 
  updates: Partial<TransactionSplit>
): TransactionSplit[] => {
  if (!hasTransactionSplits(transaction)) {
    return [];
  }
  
  return transaction.splits!.map(split => 
    split.id === splitId 
      ? { ...split, ...updates }
      : split
  );
};

/**
 * Clear splits from a transaction and revert to single category
 */
export const clearSplits = (transaction: Transaction): Partial<Transaction> => {
  const updates: Partial<Transaction> = {
    splits: undefined,
    isSplit: false,
  };

  // If there's exactly one split, use its category
  if (hasTransactionSplits(transaction) && transaction.splits && transaction.splits.length === 1) {
    const split = transaction.splits[0];
    updates.category = split.category;
    updates.subcategory = split.subcategory;
  }

  return updates;
};