import { azureBlobService } from './azureBlobService';
import { userPreferencesService } from './userPreferencesService';

interface InitializationResult {
  success: boolean;
  syncPerformed: boolean;
  autosaveEnabled: boolean;
  errors: string[];
}

class AppInitializationService {
  private isInitialized = false;

  async initialize(): Promise<InitializationResult> {
    if (this.isInitialized) {
      const autosaveEnabled = this.isAutosaveEnabled();
      console.log('[App Init] Already initialized, skipping...');
      return { success: true, syncPerformed: false, autosaveEnabled, errors: [] };
    }

    const result: InitializationResult = {
      success: true,
      syncPerformed: false,
      autosaveEnabled: false,
      errors: []
    };

    try {
      console.log('[App Init] Starting application initialization...');

      // Step 1: Enable autosave by default
      result.autosaveEnabled = await this.enableAutosaveByDefault();
      
      // Step 2: Check for cloud data and synchronize
      result.syncPerformed = await this.performInitialCloudSync();

      console.log(`[App Init] ✅ Initialization complete. Sync: ${result.syncPerformed}, Autosave: ${result.autosaveEnabled}`);
      this.isInitialized = true;

    } catch (error) {
      console.error('[App Init] ❌ Initialization failed:', error);
      result.success = false;
      result.errors.push(`Initialization error: ${error}`);
    }

    return result;
  }

  private async enableAutosaveByDefault(): Promise<boolean> {
    try {
      console.log('[App Init] Configuring autosave settings...');
      
      // Get current preferences (for potential future use)
      await userPreferencesService.getPreferences();
      
      // Check if user has explicitly configured autosave before
      const hasConfiguredAutosave = localStorage.getItem('mo_money_autosave_configured') === 'true';
      
      if (!hasConfiguredAutosave) {
        // First time user or user hasn't configured autosave yet - enable it by default
        console.log('[App Init] Enabling autosave by default for new user');
        
        // Enable Azure Blob autosync
        await azureBlobService.startSync();
        
        // Mark autosave as configured so we don't override user's choice in the future
        localStorage.setItem('mo_money_autosave_configured', 'true');
        localStorage.setItem('mo_money_autosave_enabled', 'true');
        
        return true;
      } else {
        // User has previously configured autosave - respect their choice
        const autosaveEnabled = localStorage.getItem('mo_money_autosave_enabled') === 'true';
        console.log(`[App Init] Using existing autosave preference: ${autosaveEnabled}`);
        
        if (autosaveEnabled) {
          await azureBlobService.startSync();
        }
        
        return autosaveEnabled;
      }
    } catch (error) {
      console.error('[App Init] Failed to configure autosave:', error);
      return false;
    }
  }

  private async performInitialCloudSync(): Promise<boolean> {
    try {
      console.log('[App Init] Checking for cloud data...');

      // Try to download cloud data
      const downloadResult = await this.downloadCloudData();

      if (!downloadResult.success) {
        if (downloadResult.notFound) {
          console.log('[App Init] First-time setup: No cloud data exists yet');
          // Upload current local data to cloud if any exists
          const uploaded = await this.uploadLocalDataToCloud();
          return uploaded; // Return true if upload succeeded, false if failed
        } else {
          console.error('[App Init] Failed to download cloud data:', downloadResult.error);
          return false;
        }
      }

      // Cloud data exists - determine which is newer
      const cloudData = downloadResult.data;
      const localTimestamp = this.getLocalDataTimestamp();
      const cloudTimestamp = new Date(cloudData.timestamp || '1970-01-01');

      console.log(`[App Init] Local data timestamp: ${localTimestamp ? localTimestamp.toISOString() : 'none'}`);
      console.log(`[App Init] Cloud data timestamp: ${cloudTimestamp.toISOString()}`);

      if (!localTimestamp || cloudTimestamp > localTimestamp) {
        // Cloud data is newer - download and restore
        console.log('[App Init] Cloud data is newer - downloading and applying...');
        const restoreResult = await this.restoreFromCloudData(cloudData);
        
        if (restoreResult) {
          console.log('[App Init] ✅ Successfully synchronized with cloud data (cloud was newer)');
          return true;
        } else {
          console.error('[App Init] ❌ Failed to restore cloud data');
          return false;
        }
      } else if (localTimestamp > cloudTimestamp) {
        // Local data is newer - upload to cloud
        console.log('[App Init] Local data is newer - uploading to cloud...');
        const uploadResult = await this.uploadLocalDataToCloud();
        
        if (uploadResult) {
          console.log('[App Init] ✅ Successfully uploaded newer local data to cloud');
          return true;
        } else {
          console.error('[App Init] ❌ Failed to upload local data to cloud');
          return false;
        }
      } else {
        // Data is in sync
        console.log('[App Init] Local and cloud data are already in sync');
        return false; // No sync needed
      }

    } catch (error) {
      console.error('[App Init] Cloud sync error:', error);
      return false;
    }
  }

  private async downloadCloudData(): Promise<{ success: boolean; data?: any; notFound?: boolean; error?: string }> {
    try {
      const blobName = await azureBlobService.getBlobName();
      console.log(`[App Init] Checking for existing cloud data: ${blobName}`);
      
      const response = await fetch(`${azureBlobService.baseUrl}/${blobName}`, {
        method: 'GET'
      });
      
      if (response.status === 404) {
        console.log('[App Init] No existing cloud data found (this is normal for first-time users)');
        return { success: false, notFound: true };
      }
      
      if (!response.ok) {
        console.warn(`[App Init] Cloud data check failed: HTTP ${response.status}`);
        return { 
          success: false, 
          error: `HTTP ${response.status}: ${await response.text()}` 
        };
      }
      
      const data = await response.json();
      console.log('[App Init] ✅ Found existing cloud data');
      return { success: true, data };
      
    } catch (error) {
      console.warn('[App Init] Cloud data check error:', error);
      return { 
        success: false, 
        error: `Download error: ${error}` 
      };
    }
  }

  private getLocalDataTimestamp(): Date | null {
    try {
      // Check various sources for the most recent local data timestamp
      const timestamps: Date[] = [];
      
      // Check localStorage for existing timestamps
      const savedTimestamp = localStorage.getItem('mo_money_last_sync_timestamp');
      if (savedTimestamp) {
        timestamps.push(new Date(savedTimestamp));
      }
      
      // Check when data was last modified (approximate)
      const dataKeys = [
        'mo_money_transactions',
        'mo_money_categories', 
        'mo_money_accounts',
        'mo_money_user_preferences',
        'mo_money_budgets',
        'mo_money_category_rules'
      ];
      
      // If we have any data, assume it was modified recently
      let hasLocalData = false;
      for (const key of dataKeys) {
        if (localStorage.getItem(key)) {
          hasLocalData = true;
          break;
        }
      }
      
      if (hasLocalData && timestamps.length === 0) {
        // We have data but no timestamp - assume it's recent for safety
        timestamps.push(new Date());
      }
      
      // Return the most recent timestamp
      return timestamps.length > 0 ? new Date(Math.max(...timestamps.map(d => d.getTime()))) : null;
      
    } catch (error) {
      console.error('[App Init] Error getting local data timestamp:', error);
      return null;
    }
  }

  private async restoreFromCloudData(cloudData: any): Promise<boolean> {
    try {
      console.log('[App Init] Restoring data from cloud...');
      
      // Save the cloud data to localStorage
      if (cloudData.transactions) localStorage.setItem('mo_money_transactions', cloudData.transactions);
      if (cloudData.categories) localStorage.setItem('mo_money_categories', cloudData.categories);
      if (cloudData.accounts) localStorage.setItem('mo_money_accounts', cloudData.accounts);
      if (cloudData.preferences) localStorage.setItem('mo_money_user_preferences', cloudData.preferences);
      if (cloudData.budgets) localStorage.setItem('mo_money_budgets', cloudData.budgets);
      if (cloudData.rules) localStorage.setItem('mo_money_category_rules', cloudData.rules);
      
      // Update sync timestamp
      localStorage.setItem('mo_money_last_sync_timestamp', cloudData.timestamp || new Date().toISOString());
      
      console.log('[App Init] ✅ Cloud data restored to localStorage');
      return true;
      
    } catch (error) {
      console.error('[App Init] Failed to restore cloud data:', error);
      return false;
    }
  }

  private async uploadLocalDataToCloud(): Promise<boolean> {
    try {
      console.log('[App Init] Uploading local data to cloud for first-time sync...');
      
      // Get local data
      const localData = {
        timestamp: new Date().toISOString(),
        transactions: localStorage.getItem('mo_money_transactions'),
        categories: localStorage.getItem('mo_money_categories'),
        accounts: localStorage.getItem('mo_money_accounts'),
        preferences: localStorage.getItem('mo_money_user_preferences'),
        budgets: localStorage.getItem('mo_money_budgets'),
        rules: localStorage.getItem('mo_money_category_rules'),
        version: '1.0'
      };
      
      // Only upload if we have some data
      const hasData = Object.values(localData).some(value => value !== null && value !== undefined);
      if (!hasData) {
        console.log('[App Init] No local data to upload');
        return true; // Not an error
      }
      
      const result = await azureBlobService.forceUpload();
      
      if (result.success) {
        // Update sync timestamp
        localStorage.setItem('mo_money_last_sync_timestamp', localData.timestamp);
        console.log('[App Init] ✅ Initial local data uploaded to cloud successfully');
        return true;
      } else {
        console.warn('[App Init] Failed to upload local data:', result.message);
        return false;
      }
      
    } catch (error) {
      console.error('[App Init] Error uploading local data:', error);
      return false;
    }
  }

  // Method to get autosave status
  public isAutosaveEnabled(): boolean {
    return localStorage.getItem('mo_money_autosave_enabled') === 'true';
  }

  // Method to manually toggle autosave
  public async toggleAutosave(enabled: boolean): Promise<boolean> {
    try {
      localStorage.setItem('mo_money_autosave_configured', 'true');
      localStorage.setItem('mo_money_autosave_enabled', enabled.toString());
      
      if (enabled) {
        await azureBlobService.startSync();
        console.log('[App Init] Autosave enabled');
      } else {
        azureBlobService.stopSync();
        console.log('[App Init] Autosave disabled');
      }
      
      return true;
    } catch (error) {
      console.error('[App Init] Failed to toggle autosave:', error);
      return false;
    }
  }
}

export const appInitializationService = new AppInitializationService();
