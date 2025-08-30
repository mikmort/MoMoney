import { skipAuthentication } from '../config/devConfig';
import { staticWebAppAuthService } from './staticWebAppAuthService';

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
        const content = await response.json();
        console.log(`[Azure Sync] Download successful via /download endpoint`);
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
        const content = await response.json();
        console.log(`[Azure Sync] Download successful via alternative endpoint`);
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
      // Get all data from localStorage that we want to sync
      const data = {
        timestamp: new Date().toISOString(),
        transactions: localStorage.getItem('mo_money_transactions'),
        categories: localStorage.getItem('mo_money_categories'),
        accounts: localStorage.getItem('mo_money_accounts'),
        preferences: localStorage.getItem('mo_money_user_preferences'),
        budgets: localStorage.getItem('mo_money_budgets'),
        rules: localStorage.getItem('mo_money_category_rules'),
        version: '1.0'
      };

      return data;
    } catch (error) {
      console.error('Error getting local data:', error);
      return null;
    }
  }

  private async saveLocalData(data: any): Promise<boolean> {
    try {
      if (!data || typeof data !== 'object') return false;

      // Restore data to localStorage
      if (data.transactions) localStorage.setItem('mo_money_transactions', data.transactions);
      if (data.categories) localStorage.setItem('mo_money_categories', data.categories);
      if (data.accounts) localStorage.setItem('mo_money_accounts', data.accounts);
      if (data.preferences) localStorage.setItem('mo_money_user_preferences', data.preferences);
      if (data.budgets) localStorage.setItem('mo_money_budgets', data.budgets);
      if (data.rules) localStorage.setItem('mo_money_category_rules', data.rules);

      return true;
    } catch (error) {
      console.error('Error saving local data:', error);
      return false;
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
      const blobName = await this.getBlobName();
      const result = await this.downloadBlob(blobName);
      
      if (result.success && result.content) {
        const saved = await this.saveLocalData(result.content);
        if (saved) {
          return { 
            success: true, 
            message: `Data downloaded successfully from: ${blobName}` 
          };
        } else {
          return { 
            success: false, 
            message: 'Downloaded data but failed to save locally' 
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
      return { 
        success: false, 
        message: `Download error: ${error}` 
      };
    }
  }
}

export const azureBlobService = new AzureBlobService();
