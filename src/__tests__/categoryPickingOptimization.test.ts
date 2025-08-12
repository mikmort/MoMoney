import { renderHook, act } from '@testing-library/react';
import { useCategoriesManager } from '../hooks/useCategoriesManager';

// Mock localStorage
const localStorageMock = (() => {
  let store: { [key: string]: string } = {};

  return {
    getItem: (key: string) => {
      return store[key] || null;
    },
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

describe('Category Picking Optimization', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('should load default categories sorted alphabetically', () => {
    const { result } = renderHook(() => useCategoriesManager());

    expect(result.current.categories.length).toBeGreaterThan(0);
    
    // Check that categories are sorted alphabetically
    const categoryNames = result.current.categories.map(cat => cat.name);
    const sortedNames = [...categoryNames].sort();
    expect(categoryNames).toEqual(sortedNames);
  });

  it('should add new category and maintain alphabetical order', () => {
    const { result } = renderHook(() => useCategoriesManager());

    const newCategory = {
      id: 'test-category',
      name: 'AAA Test Category',
      type: 'expense' as const,
      color: '#FF0000',
      icon: '🧪',
      subcategories: []
    };

    act(() => {
      result.current.addCategory(newCategory);
    });

    // Check that the new category is first (alphabetically)
    expect(result.current.categories[0].name).toBe('AAA Test Category');
    
    // Verify alphabetical order is maintained
    const categoryNames = result.current.categories.map(cat => cat.name);
    const sortedNames = [...categoryNames].sort();
    expect(categoryNames).toEqual(sortedNames);
  });

  it('should persist categories to localStorage', () => {
    const { result } = renderHook(() => useCategoriesManager());

    const newCategory = {
      id: 'test-category-2',
      name: 'ZZZ Last Category',
      type: 'expense' as const,
      color: '#00FF00',
      icon: '💚',
      subcategories: []
    };

    act(() => {
      result.current.addCategory(newCategory);
    });

    // Check that localStorage was updated
    const storedCategories = JSON.parse(localStorageMock.getItem('mo-money-categories') || '[]');
    expect(storedCategories.length).toBeGreaterThan(0);
    expect(storedCategories.some((cat: any) => cat.name === 'ZZZ Last Category')).toBe(true);
  });

  it('should return category options sorted alphabetically including subcategories', () => {
    const { result } = renderHook(() => useCategoriesManager());

    const newCategory = {
      id: 'test-category-3',
      name: 'BBB Middle Category',
      type: 'expense' as const,
      color: '#0000FF',
      icon: '💙',
      subcategories: [
        { id: 'sub-1', name: 'ZZZ Sub', description: 'Last sub' },
        { id: 'sub-2', name: 'AAA Sub', description: 'First sub' }
      ]
    };

    act(() => {
      result.current.addCategory(newCategory);
    });

    const options = result.current.getAllCategoryOptions();
    
    // Check that category appears in sorted order
    const middleCategoryIndex = options.findIndex(opt => opt === 'BBB Middle Category');
    expect(middleCategoryIndex).toBeGreaterThan(-1);
    
    // Check that subcategories are sorted within the category
    const middleSubcategories = options.filter(opt => opt.startsWith('BBB Middle Category > '));
    expect(middleSubcategories).toEqual([
      'BBB Middle Category > AAA Sub',
      'BBB Middle Category > ZZZ Sub'
    ]);

    // Verify overall alphabetical order of main categories
    const mainCategories = options.filter(opt => !opt.includes(' > '));
    const sortedMainCategories = [...mainCategories].sort();
    expect(mainCategories).toEqual(sortedMainCategories);
  });

  it('should load categories from localStorage on initialization', () => {
    const testCategories = [
      {
        id: 'stored-category',
        name: 'Stored Category',
        type: 'expense' as const,
        color: '#FFFF00',
        icon: '💛',
        subcategories: []
      }
    ];

    localStorageMock.setItem('mo-money-categories', JSON.stringify(testCategories));

    const { result } = renderHook(() => useCategoriesManager());

    // Should load the stored category plus default categories
    expect(result.current.categories.some(cat => cat.name === 'Stored Category')).toBe(true);
  });

  it('should handle localStorage errors gracefully', () => {
    // Mock a JSON parsing error
    localStorageMock.setItem('mo-money-categories', 'invalid-json');

    const { result } = renderHook(() => useCategoriesManager());

    // Should fallback to default categories when JSON parsing fails
    expect(result.current.categories.length).toBeGreaterThan(0);
    
    // Should be sorted alphabetically
    const categoryNames = result.current.categories.map(cat => cat.name);
    const sortedNames = [...categoryNames].sort();
    expect(categoryNames).toEqual(sortedNames);
  });
});