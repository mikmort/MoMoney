import { v4 as uuidv4 } from 'uuid';
import { skipAuthentication } from '../config/devConfig';
import { staticWebAppAuthService } from './staticWebAppAuthService';
import { notificationService } from './notificationService';
import type { ExportData } from './simplifiedImportExportService';
import {
  cloudSyncSnapshotService, decodeSnapshot, encodeSnapshot, hasUserData,
  removedRecords, snapshotContent, snapshotFingerprint
} from './cloudSyncSnapshotService';

interface SyncResult {
  success: boolean;
  message: string;
  restored?: boolean;
}

interface CloudCopy {
  data: ExportData;
  etag: string | null;
}

export class AzureBlobService {
  public readonly baseUrl = 'https://storageproxy-c6g8bvbcdqc7duam.canadacentral-01.azurewebsites.net/api/blob';
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private needsReload = false;
  private lastError: string | null = null;
  private readonly ownerKey = 'mo_money_sync_owner';

  private async getUserId(): Promise<string> {
    if (skipAuthentication) {
      throw new Error('Cloud sync is disabled in development mode. Sign in to sync your own account.');
    }
    const user = await staticWebAppAuthService.getUser();
    if (!user?.userId) throw new Error('Sign in before syncing. No cloud data was changed.');
    return user.userId;
  }

  public async getBlobName(): Promise<string> {
    return `${await this.getUserId()}-money-save`;
  }

  public async getBlobUrl(): Promise<string> {
    return `${this.baseUrl}/${await this.getBlobName()}`;
  }

  private async assertOwner(userId: string): Promise<void> {
    if (await this.getUserId() !== userId) throw new Error('Account changed during sync. Reload before syncing.');
    const owner = localStorage.getItem(this.ownerKey);
    if (owner && owner !== userId) {
      throw new Error('This browser contains another account\'s data. Export it and use a separate browser profile for this account.');
    }
    localStorage.setItem(this.ownerKey, userId);
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      return await fetch(`${this.baseUrl}/${path}`, { ...options, cache: 'no-store', signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async download(blobName: string): Promise<CloudCopy | null> {
    let response = await this.request(`download/${blobName}`);
    // Only an explicit missing route/blob permits fallback, never a network/parse/auth failure.
    if (response.status === 404) response = await this.request(blobName);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Cloud read failed (${response.status}). No data was replaced.`);
    return { data: decodeSnapshot(await response.json()), etag: response.headers.get('ETag') };
  }

  private async upload(blobName: string, data: ExportData, etag: string | null): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(etag ? { 'If-Match': etag } : { 'If-None-Match': '*' })
    };
    const options = { method: 'POST', headers, body: JSON.stringify(encodeSnapshot(data)) };
    let response = await this.request(`upload/${blobName}`, options);
    if (response.status === 404) {
      response = await this.request(blobName, { ...options, method: 'PUT' });
    }
    if (response.status === 409 || response.status === 412) {
      throw new Error('Cloud data changed on another device. Nothing was overwritten; download or resolve the conflict first.');
    }
    if (!response.ok) throw new Error(`Cloud write failed (${response.status}). Your local data is still available.`);
    const saved = await this.download(blobName);
    if (!saved || snapshotContent(saved.data) !== snapshotContent(data)) {
      throw new Error('Cloud upload could not be verified. Sync is not marked complete; keep your local data.');
    }
  }

  private async recoveryCopy(blobName: string, data: ExportData): Promise<void> {
    await this.upload(`${blobName}-recovery-${uuidv4()}`, data, null);
  }

  private async remember(userId: string, data: ExportData): Promise<void> {
    localStorage.setItem(`mo_money_sync_baseline_${userId}`, await snapshotFingerprint(data));
    localStorage.setItem('mo_money_last_sync_timestamp', new Date().toISOString());
  }

  private async performSync(mode: 'auto' | 'upload' | 'download'): Promise<SyncResult> {
    if (this.busy) return { success: false, message: 'A cloud sync is already running. Please wait.' };
    if (this.needsReload) return { success: false, message: 'Reload the page before syncing restored data.' };
    this.busy = true;
    try {
      const userId = await this.getUserId();
      await this.assertOwner(userId);
      const blobName = `${userId}-money-save`;
      const local = await cloudSyncSnapshotService.read();
      const cloud = await this.download(blobName);
      const localHash = await snapshotFingerprint(local);
      const cloudHash = cloud ? await snapshotFingerprint(cloud.data) : null;
      const baseline = localStorage.getItem(`mo_money_sync_baseline_${userId}`);
      if (!cloud && baseline) {
        throw new Error('The previously synchronized cloud copy is missing. Sync paused; recover or investigate the missing blob before creating a replacement.');
      }
      if (cloudHash === localHash) {
        await this.remember(userId, local);
        return { success: true, message: 'Local data matches the verified cloud copy.' };
      }

      let restore = mode === 'download';
      if (mode === 'auto' && cloud) {
        if (!hasUserData(local) && !baseline) restore = true;
        else if (baseline === localHash) restore = true;
        else if (baseline !== cloudHash) {
          throw new Error('Local and cloud data differ without a shared baseline. Auto-sync paused to preserve both. Export a backup, then choose Upload or Download in Settings.');
        }
      }

      if (restore) {
        if (!cloud) throw new Error('No cloud data found. Your local data was not changed.');
        if (mode === 'auto' && hasUserData(local) && removedRecords(local, cloud.data).length) {
          throw new Error('Cloud data would remove local records. Auto-sync paused; review the cloud copy before downloading in Settings.');
        }
        // Never clear local storage without a verified, independent recovery copy.
        if (hasUserData(local)) await this.recoveryCopy(blobName, local);
        await this.assertOwner(userId);
        await cloudSyncSnapshotService.restore(cloud.data, local);
        this.needsReload = true;
        this.stopSync();
        await this.remember(userId, cloud.data);
        return { success: true, restored: true, message: 'Cloud data restored. Reload to use the restored data.' };
      }

      if (!hasUserData(local) && !cloud) {
        return { success: true, message: 'No saved data to sync yet.' };
      }
      if (cloud) {
        const removed = removedRecords(cloud.data, local);
        const conflict = baseline !== cloudHash;
        if (removed.length || conflict) {
          if (mode !== 'upload') {
            throw new Error(`Auto-sync paused: upload would remove ${removed.join(', ') || 'a conflicting cloud version'}. Review and confirm Upload to Cloud in Settings.`);
          }
          const confirmed = await notificationService.showConfirmation(
            `Replace the cloud copy with this browser's data? ${removed.length ? `This removes ${removed.join(', ')}.` : 'Another cloud version exists.'} A verified recovery copy will be kept first.`,
            { title: 'Confirm cloud replacement', confirmText: 'Back up & Replace', cancelText: 'Cancel', danger: true }
          );
          if (!confirmed) return { success: false, message: 'Upload cancelled. Neither copy was changed.' };
        }
        if (!cloud.etag) {
          throw new Error('The storage proxy does not expose an ETag. Safe replacement is blocked until it supports conditional writes and exposes ETag through CORS.');
        }
        await this.recoveryCopy(blobName, cloud.data);
      }
      // Keep this version independently too, even if a different device wins the head-write race.
      await this.recoveryCopy(blobName, local);
      await this.assertOwner(userId);
      if (snapshotContent(await cloudSyncSnapshotService.read()) !== snapshotContent(local)) {
        throw new Error('Local data changed while syncing. It was not replaced; retry after the import or edit finishes.');
      }
      await this.upload(blobName, local, cloud?.etag ?? null);
      await this.remember(userId, local);
      this.lastError = null;
      return { success: true, message: 'Data uploaded and verified in your account. Recovery copies were preserved.' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Azure Sync]', message);
      if (mode === 'auto' && this.lastError !== message) {
        notificationService.showAlert('error', message, 'Cloud sync needs attention');
        this.lastError = message;
      }
      return { success: false, message };
    } finally {
      this.busy = false;
    }
  }

  public async synchronize(): Promise<SyncResult> {
    return this.performSync('auto');
  }

  public async startSync(): Promise<void> {
    if (skipAuthentication || this.syncTimer || this.needsReload) return;
    this.syncTimer = setInterval(() => {
      if (!this.busy) void this.synchronize().then(result => {
        if (result.restored) window.location.reload();
      });
    }, 30000);
  }

  public stopSync(): void {
    if (this.syncTimer) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }

  public stopPeriodicSync(): void {
    this.stopSync();
  }

  public async syncToCloud(): Promise<boolean> {
    return (await this.synchronize()).success;
  }

  public async syncFromCloud(): Promise<boolean> {
    return (await this.forceDownload()).success;
  }

  public async forceUpload(): Promise<SyncResult> {
    return this.performSync('upload');
  }

  public async forceDownload(): Promise<SyncResult> {
    return this.performSync('download');
  }
}

export const azureBlobService = new AzureBlobService();
