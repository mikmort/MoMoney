import { defaultCategories } from '../data/defaultCategories';
import { Category } from '../types';

/**
 * Utility functions for determining transaction types based on category information
 * instead of relying on the transaction's type field.
 */

const CATEGORIES_STORAGE_KEY = 'mo-money-categories';

/**
 * Gets all available categories (custom categories from localStorage if available, otherwise defaults)
 * @returns Array of all categories
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getAllCategories(): Category[] {
  try {
    const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('Failed to load custom categories from localStorage:', error);
  }
  return defaultCategories;
}

/**
 * Gets the type of a category by its name
 * @param categoryName - The name of the category
 * @returns The category type or undefined if not found
 */
export function getCategoryType(categoryName: string): 'income' | 'expense' | 'transfer' | 'asset-allocation' | undefined {
  const categories = getAllCategories();
  const category = categories.find(cat => cat.name === categoryName);
  return category?.type;
}

/**
 * Gets all category names of a specific type
 * @param type - The category type to filter by
 * @returns Array of category names matching the type
 */
export function getCategoryNamesOfType(type: 'income' | 'expense' | 'transfer' | 'asset-allocation'): string[] {
  const categories = getAllCategories();
  return categories
    .filter(cat => cat.type === type)
    .map(cat => cat.name);
}

/**
 * Determines if a transaction should be treated as income based on its category
 * @param categoryName - The category name of the transaction
 * @returns true if the category is an income category
 */
export function isIncomeCategory(categoryName: string): boolean {
  return getCategoryType(categoryName) === 'income';
}

/**
 * Determines if a transaction should be treated as expense based on its category
 * @param categoryName - The category name of the transaction
 * @returns true if the category is an expense category
 */
export function isExpenseCategory(categoryName: string): boolean {
  return getCategoryType(categoryName) === 'expense';
}

/**
 * Determines if a transaction should be treated as transfer based on its category
 * @param categoryName - The category name of the transaction
 * @returns true if the category is a transfer category
 */
export function isTransferCategory(categoryName: string): boolean {
  return getCategoryType(categoryName) === 'transfer';
}

/**
 * Determines if a transaction should be treated as asset allocation based on its category
 * @param categoryName - The category name of the transaction
 * @returns true if the category is an asset-allocation category
 */
export function isAssetAllocationCategory(categoryName: string): boolean {
  return getCategoryType(categoryName) === 'asset-allocation';
}