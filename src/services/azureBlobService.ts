import { skipAuthentication } from '../config/devConfig';
import { db } from './db';
import { captureSnapshot, restoreSnapshot } from './cloudSnapshotService';
import { notificationService } from './notificationService';
import { CloudSnapshot, CloudVersion, hasSnapshotData, isRecord, removedRecords, snapshotContent, validateSnapshot } from '../utils/cloudSnapshot';

interface SyncResult { success: boolean; message: string }
interface CurrentResponse { current: CloudVersion | null; account: string }

export class AzureBlobService {
  public readonly baseUrl = '/api/storage';
  private timer: ReturnType<typeof setInterval> | null = null;
  private busy = false;
  private stopped = true;
  private reloadRequired = false;
  private lastError = '';
  private starting: Promise<void> | null = null;

  public isAvailable(): boolean {
    return !skipAuthentication && process.env.REACT_APP_CLOUD_SYNC_ENABLED === 'true';
  }

  public async getBlobUrl(): Promise<string> { return `${this.baseUrl}/current`; }

  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.isAvailable()) throw new Error('Cloud sync is disabled. Use a signed-in app with the protected storage API configured.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: body === undefined ? 'GET' : 'PUT',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (response.headers.get('X-MoMoney-Storage') !== '1') {
        throw new Error('The protected storage API is not deployed or sign-in has expired. No data was replaced.');
      }
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(isRecord(result) && typeof result.error === 'string' ? result.error : `Cloud request failed (${response.status}).`);
      return result;
    } finally { clearTimeout(timeout); }
  }

  private parseVersion(value: unknown): CloudVersion {
    if (!isRecord(value) || typeof value.revision !== 'string' || typeof value.createdAt !== 'string' ||
        !(value.parent === null || typeof value.parent === 'string')) throw new Error('Invalid cloud version response.');
    validateSnapshot(value.data);
    return { revision: value.revision, createdAt: value.createdAt, parent: value.parent, data: value.data };
  }

  private async current(): Promise<CurrentResponse> {
    const response = await this.request('current');
    if (!isRecord(response) || typeof response.account !== 'string' || !('current' in response)) {
      throw new Error('Incomplete cloud response. Saving is blocked.');
    }
    return { account: response.account, current: response.current === null ? null : this.parseVersion(response.current) };
  }

  private async fingerprint(data: CloudSnapshot): Promise<string> {
    const bytes = new TextEncoder().encode(snapshotContent(data));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async run(action: () => Promise<string>): Promise<SyncResult> {
    if (this.busy) return { success: false, message: 'Another cloud operation is in progress.' };
    if (this.reloadRequired) return { success: false, message: 'Reload to use the restored data before syncing again.' };
    this.busy = true;
    try {
      const message = await action();
      this.lastError = '';
      return { success: true, message };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Cloud]', message);
      return { success: false, message };
    } finally { this.busy = false; }
  }

  private async upload(manual: boolean): Promise<string> {
    const { dataService } = await import('./dataService');
    await dataService.readyForPersistence();
    const { current, account } = await this.current();
    const owner = await db.syncMetadata.get('owner');
    if (owner && owner.fingerprint !== account) throw new Error('This local database belongs to another cloud account. Export it before downloading this account\'s data.');
    const data = await captureSnapshot();
    const fingerprint = await this.fingerprint(data);
    const baseline = await db.syncMetadata.get(`cloud:${account}`);
    const remoteFingerprint = current ? await this.fingerprint(current.data) : null;
    if (fingerprint === remoteFingerprint) {
      await db.syncMetadata.put({ id: `cloud:${account}`, revision: current!.revision, fingerprint });
      await db.syncMetadata.put({ id: 'owner', fingerprint: account });
      return 'Local and cloud data match.';
    }
    if (current && (!baseline || baseline.revision !== current.revision)) {
      throw new Error('Cloud data differs from this device. Download the cloud version first, or export local data and merge it after downloading. Neither copy was overwritten.');
    }
    if (!current && baseline?.revision) throw new Error('The cloud save is unexpectedly missing. Saving is blocked; check the storage account.');
    if (!current && !hasSnapshotData(data)) return 'No data to upload.';
    if (!baseline && !manual) throw new Error('Use Upload to Cloud in Settings to link this device and create its first save.');

    const removalCount = current ? removedRecords(current.data, data) : 0;
    if (removalCount && !manual) throw new Error(`Automatic save blocked: ${removalCount} records would be removed. Review the change using Upload to Cloud in Settings.`);
    if (removalCount) {
      const approved = await notificationService.showConfirmation(
        `This save removes ${removalCount} records (including history/settings) from the current cloud version. Transactions: ${current!.data.transactions.length} -> ${data.transactions.length}. Prior cloud versions will be retained. Approve only if these deletions were intentional.`,
        { title: 'Confirm destructive cloud save', confirmText: 'Save deletions', danger: true }
      );
      if (!approved) return 'Save cancelled. Cloud data was not changed.';
      if (fingerprint !== await this.fingerprint(await captureSnapshot())) throw new Error('Local data changed during confirmation. Review the save again.');
    }
    if (!manual && this.stopped) return 'Automatic sync was stopped.';
    const saved = this.parseVersion(await this.request('current', {
      expectedRevision: current?.revision ?? null, allowRemoval: removalCount > 0, data
    }));
    if (await this.fingerprint(saved.data) !== fingerprint) throw new Error('Server returned different data. Save not acknowledged; review cloud history.');
    // Mark exactly what was sent, never edits made while the request was in flight.
    await db.syncMetadata.put({ id: `cloud:${account}`, revision: saved.revision, fingerprint });
    await db.syncMetadata.put({ id: 'owner', fingerprint: account });
    return 'Cloud save completed. A recovery version was retained.';
  }

  public forceUpload(): Promise<SyncResult> { return this.run(() => this.upload(true)); }
  public async syncToCloud(): Promise<boolean> {
    const result = await this.run(() => this.upload(false));
    if (!result.success && result.message !== this.lastError) {
      this.lastError = result.message;
      notificationService.showAlert('warning', result.message, 'Cloud save paused');
    }
    return result.success;
  }

  public async forceDownload(revision?: string): Promise<SyncResult> {
    return this.run(async () => {
      const { current, account } = await this.current();
      const version = revision ? this.parseVersion(await this.request(`version?revision=${encodeURIComponent(revision)}`)) : current;
      if (!version) throw new Error('No cloud data found. Local data was not changed.');
      this.stopSync();
      localStorage.setItem('mo_money_autosave_enabled', 'false');
      const { dataService } = await import('./dataService');
      await dataService.readyForPersistence();
      dataService.suspendPersistence();
      this.reloadRequired = true;
      await restoreSnapshot(version.data);
      // Services cache records in memory: prohibit further writes until a full reload.
      await db.syncMetadata.put({ id: `cloud:${account}`, revision: current?.revision ?? null, fingerprint: await this.fingerprint(version.data) });
      await db.syncMetadata.put({ id: 'owner', fingerprint: account });
      return 'Data restored. The previous local copy is retained under Local recovery snapshots. Reload now.';
    });
  }

  public async listVersions(cursor?: string): Promise<{ versions: Omit<CloudVersion, 'data'>[]; next: string | null }> {
    const result = await this.request(`versions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!isRecord(result) || !Array.isArray(result.versions) || !(result.next === null || typeof result.next === 'string')) {
      throw new Error('Invalid version history.');
    }
    const versions = result.versions.map(value => {
      if (!isRecord(value) || typeof value.revision !== 'string' || typeof value.createdAt !== 'string' ||
          !(value.parent === null || typeof value.parent === 'string')) throw new Error('Invalid version metadata.');
      return { revision: value.revision, parent: value.parent, createdAt: value.createdAt };
    });
    return { versions, next: result.next };
  }

  public async startSync(): Promise<void> {
    if (!this.isAvailable()) throw new Error('Cloud storage is not configured for this signed-in app.');
    if (this.timer) return;
    if (this.starting) return this.starting;
    this.stopped = false;
    this.starting = (async () => {
      // Read first. Starting the app never restores or overwrites either copy automatically.
      await this.current();
      if (this.stopped) return;
      this.timer = setInterval(() => { void this.syncToCloud(); }, 30000);
    })();
    try { await this.starting; }
    finally { this.starting = null; }
  }

  public stopSync(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const azureBlobService = new AzureBlobService();
