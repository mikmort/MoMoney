import { useState, useEffect, useCallback } from 'react';
import { Category } from '../types';
import { defaultCategories } from '../data/defaultCategories';

const CATEGORIES_STORAGE_KEY = 'mo-money-categories';

export const useCategoriesManager = () => {
  const [categories, setCategories] = useState<Category[]>([]);

  // Load categories from localStorage on hook initialization
  useEffect(() => {
    const loadCategories = () => {
      const saved = localStorage.getItem(CATEGORIES_STORAGE_KEY);
      if (saved) {
        try {
          const parsedCategories = JSON.parse(saved);
          // Sort categories alphabetically
          const sortedCategories = parsedCategories.sort((a: Category, b: Category) => 
            a.name.localeCompare(b.name)
          );
          setCategories(sortedCategories);
        } catch (error) {
          console.error('Failed to load categories from localStorage:', error);
          const sortedDefaults = [...defaultCategories].sort((a, b) => a.name.localeCompare(b.name));
          setCategories(sortedDefaults);
        }
      } else {
        // Sort default categories alphabetically
        const sortedDefaults = [...defaultCategories].sort((a, b) => a.name.localeCompare(b.name));
        setCategories(sortedDefaults);
      }
    };

    loadCategories();

    // Listen for storage changes in other tabs/windows
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === CATEGORIES_STORAGE_KEY) {
        loadCategories();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Save categories to localStorage
  const saveCategories = useCallback((newCategories: Category[]) => {
    // Sort categories alphabetically before saving
    const sortedCategories = [...newCategories].sort((a, b) => a.name.localeCompare(b.name));
    setCategories(sortedCategories);
    localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(sortedCategories));
  }, []);

  // Get all category options for dropdowns (includes subcategories)
  const getAllCategoryOptions = useCallback(() => {
    const options: string[] = [];
    
    // Sort categories alphabetically first
    const sortedCategories = [...categories].sort((a, b) => a.name.localeCompare(b.name));
    
    sortedCategories.forEach(cat => {
      // Add main category
      options.push(cat.name);
      
      // Add subcategories in alphabetical order
      const sortedSubcategories = [...cat.subcategories].sort((a, b) => a.name.localeCompare(b.name));
      sortedSubcategories.forEach(sub => {
        options.push(`${cat.name} > ${sub.name}`);
      });
    });
    
    return options;
  }, [categories]);

  // Get subcategories for a specific category
  const getSubcategories = useCallback((categoryName: string) => {
    const category = categories.find(cat => cat.name === categoryName);
    if (!category) return [];
    
    // Return subcategories sorted alphabetically
    return [...category.subcategories].sort((a, b) => a.name.localeCompare(b.name));
  }, [categories]);

  // Add a new category
  const addCategory = useCallback((newCategory: Category) => {
    const updatedCategories = [...categories, newCategory];
    saveCategories(updatedCategories);
  }, [categories, saveCategories]);

  // Update an existing category
  const updateCategory = useCallback((categoryId: string, updatedCategory: Category) => {
    const updatedCategories = categories.map(cat => 
      cat.id === categoryId ? updatedCategory : cat
    );
    saveCategories(updatedCategories);
  }, [categories, saveCategories]);

  // Delete a category
  const deleteCategory = useCallback((categoryId: string) => {
    const updatedCategories = categories.filter(cat => cat.id !== categoryId);
    saveCategories(updatedCategories);
  }, [categories, saveCategories]);

  return {
    categories,
    getAllCategoryOptions,
    getSubcategories,
    addCategory,
    updateCategory,
    deleteCategory,
    saveCategories
  };
};