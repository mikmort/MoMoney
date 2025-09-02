import { skipAuthentication } from '../config/devConfig';
import { staticWebAppAuthService } from './staticWebAppAuthService';
import { simplifiedImportExportService } from './simplifiedImportExportService';
import { db } from './db';
import { accountManagementService } from './accountManagementService';

interface BlobUploadResult {
  success: boolean;
  url?: string;
  error?: string;
}

interface BlobDownloadResult {
  success: boolean;
  content?: any;
  error?: string;
}

class AzureBlobService {
  public readonly baseUrl = 'https://storageproxy-c6g8bvbcdqc7duam.canadacentral-01.azurewebsites.net/api/blob';
  private readonly syncIntervalMs = 30000; // 30 seconds
  private syncTimer: NodeJS.Timeout | null = null;
  private lastDataHash: string | null = null;
  private isInitialized = false;

  constructor() {
    console.log('[Azure Sync] Azure Blob Storage service initialized');
    this.initialize();
  }

  private async initialize() {
    if (this.isInitialized) return;
    
    // Test if the Azure Function is reachable and has blob functions
    const functionsAvailable = await this.testConnection();
    
    if (functionsAvailable) {
      console.log(`[Azure Sync] ✅ Azure Functions available, starting periodic sync`);
      // Start periodic sync only if functions are available
      this.startPeriodicSync();
    } else {
      console.log(`[Azure Sync] ⚠️ Blob storage functions not deployed. Auto-sync disabled. Use manual sync buttons to test.`);
    }
    
    this.isInitialized = true;
  }

  private async testConnection(): Promise<boolean> {
    console.log(`[Azure Sync] Testing connection to Azure Function at: ${this.baseUrl}`);
    
    try {
      // Test if the base API endpoint responds
      const response = await fetch(`${this.baseUrl.replace('/api/blob', '/api')}/health`, {
        method: 'GET'
      });
      
      console.log(`[Azure Sync] Health check response: ${response.status}`);
      if (response.ok) {
        console.log(`[Azure Sync] ✅ Azure Function is reachable`);
        return true;
      } else {
        console.log(`[Azure Sync] ⚠️ Azure Function responded but health endpoint returned: ${response.status}`);
      }
    } catch (error) {
      console.log(`[Azure Sync] ⚠️ Azure Function connection test failed:`, error);
    }

    // Test if the blob API root responds
    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'GET'
      });
      
      console.log(`[Azure Sync] Blob API root test response: ${response.status}`);
    } catch (error) {
      console.log(`[Azure Sync] Blob API root test failed:`, error);
    }

    // Try listing blobs to see if that endpoint exists
    try {
      const response = await fetch(`${this.baseUrl}/list`, {
        method: 'GET'
      });
      
      console.log(`[Azure Sync] Blob list test response: ${response.status}`);
      if (response.ok) {
        console.log(`[Azure Sync] ✅ Blob list endpoint is available`);
        return true;
      }
    } catch (error) {
      console.log(`[Azure Sync] Blob list test failed:`, error);
    }

    console.log(`[Azure Sync] ❌ No blob storage functions found. Deployment needed.`);
    return false;
  }

  public async startSync(): Promise<void> {
    if (!this.isInitialized) {
      console.log('[Azure Sync] Manually starting Azure Blob Storage sync');
      await this.initialize();
    }
  }

  public stopSync(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
      console.log('[Azure Sync] Stopped periodic sync');
    }
  }

  private async getUserId(): Promise<string> {
    if (skipAuthentication) {
      return 'dev-user-123'; // Development mode user ID (matches mockUser.id)
    }
    
    // In production, get from authenticated user
    try {
      const user = await staticWebAppAuthService.getUser();
      if (user && user.userId) {
        // Use the actual user ID from Azure Static Web Apps
        return user.userId;
      }
      
      // Fallback: if no userId, use a hash of userDetails + email for consistency
      if (user && user.userDetails) {
        const email = user.claims?.find((c: any) => c.typ === 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress')?.val;
        const identifier = `${user.userDetails}-${email || 'unknown'}`;
        // Create a simple hash for consistent user identification
        let hash = 0;
        for (let i = 0; i < identifier.length; i++) {
          const char = identifier.charCodeAt(i);
          hash = ((hash << 5) - hash) + char;
          hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash).toString();
      }
    } catch (error) {
      console.error('[Azure Sync] Failed to get user ID:', error);
    }
    
    // Final fallback
    return 'anonymous-user';
  }

  public async getBlobName(): Promise<string> {
    const userId = await this.getUserId();
    return `${userId}-money-save`;
  }

  public async getBlobUrl(): Promise<string> {
    const blobName = await this.getBlobName();
    return `${this.baseUrl}/${blobName}`;
  }

  private async uploadBlob(blobName: string, content: any, contentType: string = 'application/json'): Promise<BlobUploadResult> {
    const body = typeof content === 'string' ? content : JSON.stringify(content);
    const headers = {
      'Content-Type': contentType,
      'x-metadata-source': 'momoney-app',
      'x-metadata-timestamp': new Date().toISOString(),
      'Origin': window.location.origin
    };

    console.log(`[Azure Sync] Starting upload for blob: ${blobName}`);
    console.log(`[Azure Sync] Content length: ${body.length} bytes`);
    console.log(`[Azure Sync] Request origin: ${window.location.origin}`);

    // Try the /upload endpoint first
    try {
      console.log(`[Azure Sync] Trying upload endpoint: ${this.baseUrl}/upload/${blobName}`);
      const response = await fetch(`${this.baseUrl}/upload/${blobName}`, {
        method: 'POST',
        headers,
        body,
        mode: 'cors'
      });

      console.log(`[Azure Sync] Upload response status: ${response.status}`);
      
      if (response.ok) {
        console.log(`[Azure Sync] Upload successful via /upload endpoint`);
        return { 
          success: true, 
          url: `${this.baseUrl}/${blobName}` 
        };
      } else if (response.status === 403) {
        const errorText = await response.text();
        console.error(`[Azure Sync] ❌ CORS Error - Access Denied (403 Forbidden)`);
        console.error(`[Azure Sync] This usually means CORS is not properly configured on the Azure Functions app.`);
        console.error(`[Azure Sync] Error details: ${errorText}`);
        console.error(`[Azure Sync] To fix: Add '${window.location.origin}' to CORS allowed origins in Azure Functions app 'storageproxy-c6g8bvbcdqc7duam'`);
        return { 
          success: false, 
          error: `CORS Error: Azure Functions app needs CORS configuration. Add '${window.location.origin}' to allowed origins.` 
        };
      } else if (response.status === 404) {
        console.log(`[Azure Sync] /upload endpoint returned 404, trying alternative endpoint...`);
        // Fall through to try alternative endpoint
      } else {
        const errorText = await response.text();
        console.log(`[Azure Sync] Upload error response: ${errorText}`);
        return { 
          success: false, 
          error: `Upload failed: ${response.status} ${errorText}` 
        };
      }
    } catch (error) {
      console.log(`[Azure Sync] /upload endpoint failed with error:`, error);
      // Fall through to try alternative endpoint
    }

    // Try the alternative endpoint format (PUT might work better for creation)
    try {
      console.log(`[Azure Sync] Trying alternative endpoint with PUT: ${this.baseUrl}/${blobName}`);
      const response = await fetch(`${this.baseUrl}/${blobName}`, {
        method: 'PUT',
        headers,
        body
      });

      console.log(`[Azure Sync] PUT response status: ${response.status}`);

      if (response.ok) {
        console.log(`[Azure Sync] Upload successful via PUT to alternative endpoint`);
        return { 
          success: true, 
          url: `${this.baseUrl}/${blobName}` 
        };
      } else {
        const errorText = await response.text();
        console.log(`[Azure Sync] PUT error response: ${errorText}`);
      }
    } catch (error) {
      console.log(`[Azure Sync] PUT to alternative endpoint failed:`, error);
    }

    // Try POST to alternative endpoint as last resort
    try {
      console.log(`[Azure Sync] Trying alternative endpoint with POST: ${this.baseUrl}/${blobName}`);
      const response = await fetch(`${this.baseUrl}/${blobName}`, {
        method: 'POST',
        headers,
        body
      });

      console.log(`[Azure Sync] POST alternative response status: ${response.status}`);

      if (response.ok) {
        console.log(`[Azure Sync] Upload successful via POST to alternative endpoint`);
        return { 
          success: true, 
          url: `${this.baseUrl}/${blobName}` 
        };
      } else {
        const errorText = await response.text();
        console.log(`[Azure Sync] POST alternative error response: ${errorText}`);
        return { 
          success: false, 
          error: `Upload failed: ${response.status} ${errorText}` 
        };
      }
    } catch (error) {
      console.log(`[Azure Sync] All upload attempts failed. Final error:`, error);
      return { 
        success: false, 
        error: `Upload error: ${error}` 
      };
    }
  }

  private async downloadBlob(blobName: string): Promise<BlobDownloadResult> {
    // Try the /download endpoint first
    try {
      console.log(`[Azure Sync] Trying download endpoint: ${this.baseUrl}/download/${blobName}`);
      const response = await fetch(`${this.baseUrl}/download/${blobName}`);

      if (response.ok) {
        const responseData = await response.json();
        console.log(`[Azure Sync] Download successful via /download endpoint`);
        
        // Handle Azure Functions response format: {success: true, data: {content: "...", ...}}
        let content = responseData;
        if (responseData.success && responseData.data && responseData.data.content) {
          console.log(`[Azure Sync] Extracting content from Azure Functions response format`);
          const contentStr = responseData.data.content;
          content = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
        }
        
        return { 
          success: true, 
          content 
        };
      } else if (response.status === 404) {
        console.log(`[Azure Sync] File not found via /download endpoint, trying alternative...`);
        // Fall through to try alternative endpoint
      } else {
        const errorText = await response.text();
        return { 
          success: false, 
          error: `Download failed: ${response.status} ${errorText}` 
        };
      }
    } catch (error) {
      console.log(`[Azure Sync] /download endpoint failed, trying alternative: ${error}`);
      // Fall through to try alternative endpoint
    }

    // Try the alternative endpoint format
    try {
      console.log(`[Azure Sync] Trying alternative download endpoint: ${this.baseUrl}/${blobName}`);
      const response = await fetch(`${this.baseUrl}/${blobName}`);

      if (response.ok) {
        const responseData = await response.json();
        console.log(`[Azure Sync] Download successful via alternative endpoint`);
        
        // Handle Azure Functions response format: {success: true, data: {content: "...", ...}}
        let content = responseData;
        if (responseData.success && responseData.data && responseData.data.content) {
          console.log(`[Azure Sync] Extracting content from Azure Functions response format`);
          const contentStr = responseData.data.content;
          content = typeof contentStr === 'string' ? JSON.parse(contentStr) : contentStr;
        }
        
        return { 
          success: true, 
          content 
        };
      } else if (response.status === 404) {
        console.log(`[Azure Sync] File not found - this is normal for first-time sync`);
        return { 
          success: true, 
          content: null // Blob doesn't exist yet, not an error
        };
      } else {
        const errorText = await response.text();
        return { 
          success: false, 
          error: `Download failed: ${response.status} ${errorText}` 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        error: `Download error: ${error}` 
      };
    }
  }

  private generateDataHash(data: any): string {
    // Simple hash function for change detection
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  private async getLocalData(): Promise<any> {
    try {
      console.log('[Azure Sync] Getting local data using export service...');
      
      // Use the proper export service instead of directly reading localStorage
      const exportData = await simplifiedImportExportService.exportData();
      
      // Transform the export format to the cloud sync format
      const cloudSyncData = {
        timestamp: new Date().toISOString(),
        transactions: JSON.stringify(exportData.transactions || []),
        categories: JSON.stringify(exportData.categories || []),
        accounts: JSON.stringify(exportData.accounts || []),
        preferences: JSON.stringify(exportData.preferences || {}),
        budgets: JSON.stringify(exportData.budgets || []),
        rules: JSON.stringify(exportData.rules || []),
        version: '1.0',
        // Additional data from export
        transactionHistory: JSON.stringify(exportData.transactionHistory || []),
        balanceHistory: JSON.stringify(exportData.balanceHistory || []),
        currencyRates: JSON.stringify(exportData.currencyRates || []),
        transferMatches: JSON.stringify(exportData.transferMatches || [])
      };

      console.log(`[Azure Sync] Collected data: ${exportData.transactions?.length || 0} transactions, ${exportData.accounts?.length || 0} accounts, ${exportData.categories?.length || 0} categories`);
      return cloudSyncData;
    } catch (error) {
      console.error('[Azure Sync] Error getting local data:', error);
      return null;
    }
  }

  private async saveLocalData(data: any): Promise<boolean> {
    try {
      if (!data || typeof data !== 'object') {
        console.warn('[Azure Sync] Invalid data object provided for saving');
        return false;
      }

      console.log('[Azure Sync] Restoring data from cloud using import service...');
      console.log('[Azure Sync] Raw cloud data keys:', Object.keys(data));

      // Convert cloud sync format back to ExportData format
      const importData = {
        version: data.version || '1.0',
        exportDate: data.timestamp || new Date().toISOString(),
        appVersion: '0.1.0',
        transactions: data.transactions ? JSON.parse(data.transactions) : [],
        categories: data.categories ? JSON.parse(data.categories) : [],
        accounts: data.accounts ? JSON.parse(data.accounts) : [],
        preferences: data.preferences ? JSON.parse(data.preferences) : null,
        budgets: data.budgets ? JSON.parse(data.budgets) : [],
        rules: data.rules ? JSON.parse(data.rules) : [],
        transactionHistory: data.transactionHistory ? JSON.parse(data.transactionHistory) : [],
        balanceHistory: data.balanceHistory ? JSON.parse(data.balanceHistory) : [],
        currencyRates: data.currencyRates ? JSON.parse(data.currencyRates) : [],
        transferMatches: data.transferMatches ? JSON.parse(data.transferMatches) : []
      };

      console.log(`[Azure Sync] Converted for import: ${importData.transactions.length} transactions, ${importData.accounts.length} accounts, ${importData.categories.length} categories`);

      // Check if we actually have meaningful data to import
      const hasMeaningfulData = importData.transactions.length > 0 || importData.accounts.length > 0 || importData.categories.length > 0;
      console.log(`[Azure Sync] Has meaningful data to import: ${hasMeaningfulData}`);

      if (!hasMeaningfulData) {
        console.warn('[Azure Sync] No meaningful data found in cloud backup - skipping import');
        return false;
      }

      // Use the import service to properly restore all data
      const result = await simplifiedImportExportService.importData(importData, {
        accounts: true,
        transactions: true,
        rules: true,
        budgets: true,
        categories: true,
        balanceHistory: true,
        currencyRates: true,
        transferMatches: true,
        preferences: true,
        transactionHistory: true
      });

      console.log('[Azure Sync] ✅ Data import result:', result);
      
      // Verify the data was actually saved
      const verification = await this.verifyDataRestored(result);
      console.log('[Azure Sync] Data verification result:', verification);
      
      return verification.success;
    } catch (error) {
      console.error('[Azure Sync] Error saving local data:', error);
      return false;
    }
  }

  // Helper method to verify data was actually restored
  private async verifyDataRestored(importResult: any): Promise<{ success: boolean; details: string }> {
    try {
      // Check localStorage first for basic verification
      const transactionsStr = localStorage.getItem('transactions');
      const accountsStr = localStorage.getItem('accounts');
      const categoriesStr = localStorage.getItem('categories');
      
      const transactionCount = transactionsStr ? JSON.parse(transactionsStr).length : 0;
      const accountCount = accountsStr ? JSON.parse(accountsStr).length : 0;
      const categoryCount = categoriesStr ? JSON.parse(categoriesStr).length : 0;
      
      console.log(`[Azure Sync] Verification - Found ${transactionCount} transactions, ${accountCount} accounts, ${categoryCount} categories in localStorage`);
      
      // Also try to check IndexedDB if available
      try {
        const transactions = await db.transactions.toArray();
        const accounts = accountManagementService.getAccounts();
        console.log(`[Azure Sync] IndexedDB verification - Found ${transactions.length} transactions, ${accounts.length} accounts`);
      } catch (dbError) {
        console.warn('[Azure Sync] Could not verify IndexedDB data:', dbError);
      }
      
      const hasData = transactionCount > 0 || accountCount > 0 || categoryCount > 0;
      
      return {
        success: hasData,
        details: `Verified ${transactionCount} transactions, ${accountCount} accounts, ${categoryCount} categories in localStorage`
      };
    } catch (error) {
      console.error('[Azure Sync] Error during verification:', error);
      return {
        success: false,
        details: `Verification failed: ${error}`
      };
    }
  }

  public async syncToCloud(): Promise<boolean> {
    try {
      const localData = await this.getLocalData();
      if (!localData) return false;

      const dataHash = this.generateDataHash(localData);
      
      // Skip sync if data hasn't changed
      if (this.lastDataHash === dataHash) {
        return true; // No changes, sync not needed
      }

      const blobName = await this.getBlobName();
      const result = await this.uploadBlob(blobName, localData);
      
      if (result.success) {
        this.lastDataHash = dataHash;
        console.log(`[Azure Sync] Data synced to cloud: ${blobName}`);
        return true;
      } else {
        console.error('[Azure Sync] Failed to sync to cloud:', result.error);
        return false;
      }
    } catch (error) {
      console.error('[Azure Sync] Sync to cloud error:', error);
      return false;
    }
  }

  public async syncFromCloud(): Promise<boolean> {
    try {
      const blobName = await this.getBlobName();
      const result = await this.downloadBlob(blobName);
      
      if (result.success && result.content) {
        const saved = await this.saveLocalData(result.content);
        if (saved) {
          console.log(`[Azure Sync] Data restored from cloud: ${blobName}`);
          return true;
        }
      } else if (result.success && !result.content) {
        console.log('[Azure Sync] No cloud data found (first time user)');
        return true; // Not an error
      } else {
        console.error('[Azure Sync] Failed to sync from cloud:', result.error);
        return false;
      }
      
      return false;
    } catch (error) {
      console.error('[Azure Sync] Sync from cloud error:', error);
      return false;
    }
  }

  private startPeriodicSync() {
    // Clear any existing timer
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }

    // Start periodic sync every 30 seconds
    this.syncTimer = setInterval(async () => {
      await this.syncToCloud();
    }, this.syncIntervalMs);

    // Initial sync on startup
    setTimeout(async () => {
      await this.syncToCloud();
    }, 5000); // Wait 5 seconds after app startup
  }

  public stopPeriodicSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  // Manual sync methods for user-triggered actions
  public async forceUpload(): Promise<{ success: boolean; message: string }> {
    try {
      const localData = await this.getLocalData();
      if (!localData) {
        return { success: false, message: 'No local data to upload' };
      }

      const blobName = await this.getBlobName();
      const result = await this.uploadBlob(blobName, localData);
      
      if (result.success) {
        this.lastDataHash = this.generateDataHash(localData);
        return { 
          success: true, 
          message: `Data uploaded successfully to: ${blobName}` 
        };
      } else {
        return { 
          success: false, 
          message: result.error || 'Upload failed' 
        };
      }
    } catch (error) {
      return { 
        success: false, 
        message: `Upload error: ${error}` 
      };
    }
  }

  public async forceDownload(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[Azure Sync] Starting force download...');
      const blobName = await this.getBlobName();
      console.log(`[Azure Sync] Blob name: ${blobName}`);
      
      const result = await this.downloadBlob(blobName);
      console.log('[Azure Sync] Download blob result:', result);
      
      if (result.success && result.content) {
        console.log('[Azure Sync] Content received, size:', JSON.stringify(result.content).length, 'characters');
        console.log('[Azure Sync] Content preview:', Object.keys(result.content));
        
        const saved = await this.saveLocalData(result.content);
        console.log('[Azure Sync] Save local data result:', saved);
        
        if (saved) {
          return { 
            success: true, 
            message: `Data downloaded and restored successfully from: ${blobName}` 
          };
        } else {
          return { 
            success: false, 
            message: 'Downloaded data but failed to save locally - check console for details' 
          };
        }
      } else if (result.success && !result.content) {
        return { 
          success: false, 
          message: 'No data found in cloud storage' 
        };
      } else {
        return { 
          success: false, 
          message: result.error || 'Download failed' 
        };
      }
    } catch (error) {
      console.error('[Azure Sync] Force download error:', error);
      return { 
        success: false, 
        message: `Download error: ${error}` 
      };
    }
  }
}

export const azureBlobService = new AzureBlobService();
