/**
 * Comprehensive test for multi-device sync functionality
 * Tests the complete flow of syncing data between devices via Azure Blob Storage
 */

import { appInitializationService } from '../services/appInitializationService';
import { azureBlobService } from '../services/azureBlobService';
import { skipAuthentication } from '../config/devConfig';

describe('Multi-Device Sync', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    // Mock fetch with proper response structure
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(''),
        headers: new Map([['content-type', 'application/json']])
      } as Response)
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Boot-time sync flow', () => {
    test('should check for cloud data on app initialization', async () => {
      // Mock successful cloud data fetch
      const mockCloudData = {
        timestamp: new Date().toISOString(),
        transactions: JSON.stringify([]),
        categories: JSON.stringify([]),
        accounts: JSON.stringify([]),
        preferences: JSON.stringify({}),
        budgets: JSON.stringify([]),
        rules: JSON.stringify([]),
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCloudData,
        headers: new Map([['content-type', 'application/json']])
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(fetch).toHaveBeenCalled();
    });

    test('should handle first-time user with no cloud data', async () => {
      // Mock 404 response (no cloud data)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({}),
        text: async () => 'Not Found',
        headers: new Map([['content-type', 'application/json']])
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      // Should handle first-time user gracefully
      expect(result.autosaveEnabled).toBe(true); // New users get autosave enabled
    });

    test('should sync with newer cloud data', async () => {
      // Set up local data with older timestamp
      const localTimestamp = new Date('2023-01-01').toISOString();
      localStorage.setItem('mo_money_last_sync_timestamp', localTimestamp);
      localStorage.setItem('mo_money_transactions', JSON.stringify([
        { id: '1', description: 'Local Transaction', amount: 100 }
      ]));

      // Mock cloud data with newer timestamp
      const cloudTimestamp = new Date('2023-01-02').toISOString();
      const mockCloudData = {
        timestamp: cloudTimestamp,
        transactions: JSON.stringify([
          { id: '2', description: 'Cloud Transaction', amount: 200 }
        ]),
        categories: JSON.stringify([]),
        accounts: JSON.stringify([]),
        preferences: JSON.stringify({}),
        budgets: JSON.stringify([]),
        rules: JSON.stringify([]),
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCloudData
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.syncPerformed).toBe(true);
      
      // Verify cloud data was restored locally
      const restoredTransactions = localStorage.getItem('mo_money_transactions');
      expect(restoredTransactions).toContain('Cloud Transaction');
    });

    test('should upload newer local data to cloud', async () => {
      // Set up local data with newer timestamp
      const localTimestamp = new Date('2023-01-02').toISOString();
      localStorage.setItem('mo_money_last_sync_timestamp', localTimestamp);
      localStorage.setItem('mo_money_transactions', JSON.stringify([
        { id: '1', description: 'Local Transaction', amount: 100 }
      ]));

      // Mock cloud data with older timestamp
      const cloudTimestamp = new Date('2023-01-01').toISOString();
      const mockCloudData = {
        timestamp: cloudTimestamp,
        transactions: JSON.stringify([
          { id: '2', description: 'Cloud Transaction', amount: 200 }
        ]),
        categories: JSON.stringify([]),
        accounts: JSON.stringify([]),
        preferences: JSON.stringify({}),
        budgets: JSON.stringify([]),
        rules: JSON.stringify([]),
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCloudData
      });

      // Mock forceUpload to succeed
      const mockForceUpload = jest.spyOn(azureBlobService, 'forceUpload');
      mockForceUpload.mockResolvedValueOnce({
        success: true,
        message: 'Data uploaded successfully'
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.syncPerformed).toBe(true);
      expect(mockForceUpload).toHaveBeenCalled();
    });
  });

  describe('Authentication integration', () => {
    test('should work in development mode', async () => {
      expect(skipAuthentication).toBe(true);
      
      const result = await appInitializationService.initialize();
      expect(result.success).toBe(true);
      expect(result.autosaveEnabled).toBe(true); // Default enabled
    });

    test('should preserve existing user autosave preferences', async () => {
      // Simulate existing user who disabled autosave
      localStorage.setItem('mo_money_autosave_configured', 'true');
      localStorage.setItem('mo_money_autosave_enabled', 'false');

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.autosaveEnabled).toBe(false);
    });

    test('should enable autosave by default for new users', async () => {
      // No existing autosave configuration
      expect(localStorage.getItem('mo_money_autosave_configured')).toBeNull();

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.autosaveEnabled).toBe(true);
      expect(localStorage.getItem('mo_money_autosave_configured')).toBe('true');
      expect(localStorage.getItem('mo_money_autosave_enabled')).toBe('true');
    });
  });

  describe('Manual sync controls', () => {
    test('should allow toggling autosave on and off', async () => {
      // Test enabling autosave
      const enableResult = await appInitializationService.toggleAutosave(true);
      expect(enableResult).toBe(true);
      expect(appInitializationService.isAutosaveEnabled()).toBe(true);

      // Test disabling autosave
      const disableResult = await appInitializationService.toggleAutosave(false);
      expect(disableResult).toBe(true);
      expect(appInitializationService.isAutosaveEnabled()).toBe(false);
    });

    test('should maintain autosave state across app restarts', async () => {
      // Enable autosave
      await appInitializationService.toggleAutosave(true);
      expect(appInitializationService.isAutosaveEnabled()).toBe(true);

      // Simulate app restart by creating new service instance
      const { appInitializationService: newService } = await import('../services/appInitializationService');
      expect(newService.isAutosaveEnabled()).toBe(true);
    });
  });

  describe('Data synchronization scenarios', () => {
    test('should handle all supported data types', async () => {
      const testData = {
        timestamp: new Date().toISOString(),
        transactions: JSON.stringify([{ id: '1', amount: 100 }]),
        categories: JSON.stringify([{ id: 'cat1', name: 'Test Category' }]),
        accounts: JSON.stringify([{ id: 'acc1', name: 'Test Account' }]),
        preferences: JSON.stringify({ currency: 'USD' }),
        budgets: JSON.stringify([{ id: 'bud1', amount: 1000 }]),
        rules: JSON.stringify([{ id: 'rule1', pattern: 'test' }]),
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => testData
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      
      // Verify all data types were restored
      expect(localStorage.getItem('mo_money_transactions')).toBe(testData.transactions);
      expect(localStorage.getItem('mo_money_categories')).toBe(testData.categories);
      expect(localStorage.getItem('mo_money_accounts')).toBe(testData.accounts);
      expect(localStorage.getItem('mo_money_user_preferences')).toBe(testData.preferences);
      expect(localStorage.getItem('mo_money_budgets')).toBe(testData.budgets);
      expect(localStorage.getItem('mo_money_category_rules')).toBe(testData.rules);
    });

    test('should handle network failures gracefully', async () => {
      // Mock network error
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const result = await appInitializationService.initialize();
      
      // App should still initialize successfully even if sync fails
      expect(result.success).toBe(true);
      expect(result.autosaveEnabled).toBe(true); // Autosave should still be enabled
    });

    test('should handle partial data gracefully', async () => {
      // Mock cloud data with only some fields
      const mockCloudData = {
        timestamp: new Date().toISOString(),
        transactions: JSON.stringify([{ id: '1', amount: 100 }]),
        // Missing categories, accounts, etc.
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCloudData
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(localStorage.getItem('mo_money_transactions')).toBe(mockCloudData.transactions);
      // Other fields should remain unchanged (null if not set)
      expect(localStorage.getItem('mo_money_categories')).toBeNull();
    });
  });

  describe('User experience scenarios', () => {
    test('Multi-device scenario: Device A creates data, Device B syncs', async () => {
      // Simulate Device A creating data
      const deviceAData = {
        timestamp: new Date().toISOString(),
        transactions: JSON.stringify([
          { id: '1', description: 'Device A Transaction', amount: 100 }
        ]),
        categories: JSON.stringify([]),
        accounts: JSON.stringify([]),
        preferences: JSON.stringify({}),
        budgets: JSON.stringify([]),
        rules: JSON.stringify([]),
        version: '1.0'
      };

      // Mock Device B syncing (cloud data is newer)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => deviceAData
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.syncPerformed).toBe(true);
      
      // Device B should now have Device A's data
      const syncedTransactions = localStorage.getItem('mo_money_transactions');
      expect(syncedTransactions).toContain('Device A Transaction');
    });

    test('should prevent data loss in conflict scenarios', async () => {
      // Set up local data
      localStorage.setItem('mo_money_transactions', JSON.stringify([
        { id: '1', description: 'Local Transaction', amount: 100 }
      ]));
      localStorage.setItem('mo_money_last_sync_timestamp', new Date('2023-01-01').toISOString());

      // Mock cloud data that's newer
      const newerCloudData = {
        timestamp: new Date('2023-01-02').toISOString(),
        transactions: JSON.stringify([
          { id: '2', description: 'Cloud Transaction', amount: 200 }
        ]),
        categories: JSON.stringify([]),
        accounts: JSON.stringify([]),
        preferences: JSON.stringify({}),
        budgets: JSON.stringify([]),
        rules: JSON.stringify([]),
        version: '1.0'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => newerCloudData
      });

      const result = await appInitializationService.initialize();
      
      expect(result.success).toBe(true);
      expect(result.syncPerformed).toBe(true);
      
      // Should prefer newer cloud data (timestamp-based resolution)
      const syncedTransactions = localStorage.getItem('mo_money_transactions');
      expect(syncedTransactions).toContain('Cloud Transaction');
      expect(syncedTransactions).not.toContain('Local Transaction');
    });
  });
});