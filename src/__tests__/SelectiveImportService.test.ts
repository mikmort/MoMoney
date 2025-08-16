import { simplifiedImportExportService, ExportData, ImportOptions } from '../services/simplifiedImportExportService';
import { db } from '../services/db';
import { rulesService } from '../services/rulesService';
import { budgetService } from '../services/budgetService';
import { accountManagementService } from '../services/accountManagementService';

// Mock the dependencies
jest.mock('../services/db');
jest.mock('../services/rulesService');
jest.mock('../services/budgetService');
jest.mock('../services/accountManagementService');

describe('SimplifiedImportExportService - Selective Import', () => {
  const mockDb = db as jest.Mocked<typeof db>;
  const mockRulesService = rulesService as jest.Mocked<typeof rulesService>;
  const mockBudgetService = budgetService as jest.Mocked<typeof budgetService>;
  const mockAccountService = accountManagementService as jest.Mocked<typeof accountManagementService>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock db methods
    mockDb.clearAll = jest.fn().mockResolvedValue(undefined);
    mockDb.transactions = {
      bulkAdd: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockDb.transactionHistory = {
      bulkAdd: jest.fn().mockResolvedValue(undefined)
    } as any;
    mockDb.saveUserPreferences = jest.fn().mockResolvedValue(undefined);
    
    // Mock service methods
    mockRulesService.clearAllRules = jest.fn().mockResolvedValue(undefined);
    mockRulesService.importRules = jest.fn().mockResolvedValue(undefined);
    mockAccountService.replaceAccounts = jest.fn();
    
    // Mock localStorage
    const localStorageMock = {
      getItem: jest.fn(),
      setItem: jest.fn(),
      removeItem: jest.fn(),
      clear: jest.fn()
    };
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
  });

  const createMockExportData = (): ExportData => ({
    version: '1.0',
    exportDate: '2024-01-01T00:00:00.000Z',
    appVersion: '0.1.0',
    transactions: [
      { 
        id: 'tx1', 
        date: new Date('2024-01-01'), 
        amount: 100, 
        description: 'Test Transaction', 
        category: 'food', 
        account: 'test-account',
        type: 'expense' as const
      }
    ],
    preferences: { 
      currency: 'USD', 
      dateFormat: 'MM/dd/yyyy', 
      theme: 'light' as const,
      defaultAccount: 'test',
      enableNotifications: true,
      budgetAlerts: true,
      autoCategorizationEnabled: true,
      showInvestments: false,
      includeInvestmentsInReports: false
    },
    transactionHistory: [{ id: 'hist1', data: { date: '2024-01-01T00:00:00.000Z' } }],
    accounts: [{ 
      id: 'acc1', 
      name: 'Test Account', 
      type: 'checking' as const, 
      institution: 'Test Bank',
      currency: 'USD',
      isActive: true
    }],
    rules: [{ 
      id: 'rule1', 
      name: 'Test Rule',
      isActive: true,
      priority: 1,
      conditions: [],
      action: { categoryId: 'food', categoryName: 'Food' },
      createdDate: new Date('2024-01-01'),
      lastModifiedDate: new Date('2024-01-01')
    }],
    categories: [{ 
      id: 'food', 
      name: 'Food', 
      type: 'expense' as const,
      subcategories: []
    }],
    budgets: [{ 
      id: 'budget1', 
      name: 'Test Budget',
      categoryId: 'food',
      amount: 500,
      period: 'monthly' as const,
      startDate: new Date('2024-01-01'),
      isActive: true
    }]
  });

  test('imports all data by default when no options provided', async () => {
    const mockData = createMockExportData();

    const result = await simplifiedImportExportService.importData(mockData);

    // Should import everything
    expect(mockDb.clearAll).toHaveBeenCalled();
    expect(mockDb.transactions.bulkAdd).toHaveBeenCalledWith([expect.objectContaining({ id: 'tx1' })]);
    expect(mockDb.saveUserPreferences).toHaveBeenCalledWith(mockData.preferences);
    expect(mockDb.transactionHistory.bulkAdd).toHaveBeenCalled();
    expect(mockAccountService.replaceAccounts).toHaveBeenCalledWith(mockData.accounts);
    expect(mockRulesService.importRules).toHaveBeenCalledWith(mockData.rules);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('mo-money-categories', JSON.stringify(mockData.categories));
    expect(window.localStorage.setItem).toHaveBeenCalledWith('mo-money-budgets', expect.any(String));

    expect(result.transactions).toBe(1);
    expect(result.preferences).toBe(true);
    expect(result.historyEntries).toBe(1);
    expect(result.accounts).toBe(1);
    expect(result.rules).toBe(1);
    expect(result.categories).toBe(1);
    expect(result.budgets).toBe(1);
  });

  test('imports only selected data types', async () => {
    const mockData = createMockExportData();
    const options: ImportOptions = {
      accounts: false,
      transactions: true,
      rules: false,
      budgets: false,
      categories: true,
      preferences: true,
      transactionHistory: true
    };

    const result = await simplifiedImportExportService.importData(mockData, options);

    // Should only import selected items
    expect(mockDb.clearAll).toHaveBeenCalled(); // Always called when importing transactions
    expect(mockDb.transactions.bulkAdd).toHaveBeenCalled(); // transactions: true
    expect(mockDb.saveUserPreferences).toHaveBeenCalled(); // preferences: true
    expect(mockDb.transactionHistory.bulkAdd).toHaveBeenCalled(); // transactionHistory: true
    expect(window.localStorage.setItem).toHaveBeenCalledWith('mo-money-categories', expect.any(String)); // categories: true

    // Should NOT import these
    expect(mockAccountService.replaceAccounts).not.toHaveBeenCalled(); // accounts: false
    expect(mockRulesService.importRules).not.toHaveBeenCalled(); // rules: false
    // For budgets, localStorage should not be called with budgets key
    const budgetCalls = (window.localStorage.setItem as jest.Mock).mock.calls
      .filter(call => call[0] === 'mo-money-budgets');
    expect(budgetCalls).toHaveLength(0);

    expect(result.transactions).toBe(1);
    expect(result.preferences).toBe(true);
    expect(result.historyEntries).toBe(1);
    expect(result.accounts).toBeUndefined();
    expect(result.rules).toBeUndefined();
    expect(result.categories).toBe(1);
    expect(result.budgets).toBeUndefined();
  });

  test('imports only accounts and categories', async () => {
    const mockData = createMockExportData();
    const options: ImportOptions = {
      accounts: true,
      transactions: false,
      rules: false,
      budgets: false,
      categories: true,
      preferences: false,
      transactionHistory: false
    };

    const result = await simplifiedImportExportService.importData(mockData, options);

    // Should only import accounts and categories
    expect(mockAccountService.replaceAccounts).toHaveBeenCalledWith(mockData.accounts);
    expect(window.localStorage.setItem).toHaveBeenCalledWith('mo-money-categories', expect.any(String));

    // Should NOT import these
    expect(mockDb.clearAll).not.toHaveBeenCalled(); // no transactions
    expect(mockDb.transactions.bulkAdd).not.toHaveBeenCalled(); // transactions: false
    expect(mockDb.saveUserPreferences).not.toHaveBeenCalled(); // preferences: false
    expect(mockDb.transactionHistory.bulkAdd).not.toHaveBeenCalled(); // transactionHistory: false
    expect(mockRulesService.importRules).not.toHaveBeenCalled(); // rules: false

    expect(result.transactions).toBe(0);
    expect(result.preferences).toBe(false);
    expect(result.historyEntries).toBe(0);
    expect(result.accounts).toBe(1);
    expect(result.rules).toBeUndefined();
    expect(result.categories).toBe(1);
    expect(result.budgets).toBeUndefined();
  });

  test('handles missing data gracefully', async () => {
    const mockData: ExportData = {
      version: '1.0',
      exportDate: '2024-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      transactions: [],
      preferences: null,
      transactionHistory: []
      // Missing optional fields
    };

    const result = await simplifiedImportExportService.importData(mockData);

    // Should handle missing data without errors
    expect(result.transactions).toBe(0);
    expect(result.preferences).toBe(false);
    expect(result.historyEntries).toBe(0);
    expect(result.accounts).toBeUndefined();
    expect(result.rules).toBeUndefined();
    expect(result.categories).toBeUndefined();
    expect(result.budgets).toBeUndefined();
  });

  test('validates budget data with dates when importing', async () => {
    const mockData = createMockExportData();
    const options: ImportOptions = {
      accounts: false,
      transactions: false,
      rules: false,
      budgets: true,
      categories: false,
      preferences: false,
      transactionHistory: false
    };

    await simplifiedImportExportService.importData(mockData, options);

    // Check that budget was saved with proper date conversion
    expect(window.localStorage.setItem).toHaveBeenCalledWith('mo-money-budgets', expect.any(String));
    
    const savedBudgets = JSON.parse((window.localStorage.setItem as jest.Mock).mock.calls[0][1]);
    expect(savedBudgets).toHaveLength(1);
    expect(savedBudgets[0].id).toBe('budget1');
    expect(savedBudgets[0].name).toBe('Test Budget');
  });

  test('clears existing rules when importing transactions but not rules', async () => {
    const mockData = createMockExportData();
    const options: ImportOptions = {
      accounts: false,
      transactions: true, // Import transactions
      rules: false, // But don't import rules
      budgets: false,
      categories: false,
      preferences: true,
      transactionHistory: true
    };

    await simplifiedImportExportService.importData(mockData, options);

    // Should clear existing rules since we're importing transactions but not rules
    expect(mockRulesService.clearAllRules).toHaveBeenCalled();
    expect(mockRulesService.importRules).not.toHaveBeenCalled();
  });

  test('throws error for invalid backup file format', async () => {
    const invalidData = {
      // Missing version field
      exportDate: '2024-01-01T00:00:00.000Z',
      appVersion: '0.1.0',
      transactions: []
    } as any;

    await expect(
      simplifiedImportExportService.importData(invalidData)
    ).rejects.toThrow('Invalid backup file format - missing version');
  });
});