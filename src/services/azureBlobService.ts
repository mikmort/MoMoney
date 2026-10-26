import { v4 as uuid } from 'uuid';
import { skipAuthentication } from '../config/devConfig';
import { db } from './db';
import { captureSnapshot, restoreSnapshot, recoverInterruptedRestore } from './cloudSnapshotService';
import { CloudSnapshot, CloudVersion, hasSnapshotData, isRecord, snapshotContent, validateSnapshot, removedRecords, snapshotRemovals, deletionReceipts } from '../utils/cloudSnapshot';
import { ConflictChoice, SyncConflict, countSnapshotChanges, mergeCloudSnapshots } from '../utils/cloudMerge';
import { cloudAppliedEvent, dirtyKey, localChangeEvent, syncStatusEvent } from './syncEvents';

interface SyncResult { success: boolean; message: string }
interface CurrentResponse { current: CloudVersion | null; account: string }
class CloudOwnershipError extends Error {}
export interface CloudSyncStatus {
  phase: 'local-only' | 'checking' | 'saving' | 'saved' | 'pending' | 'offline' | 'attention' | 'applying';
  message: string;
  pendingChanges: number;
  lastSavedAt?: string;
  blocksEditing?: boolean;
}
export interface SyncReview {
  account: string;
  revision: string;
  local: CloudSnapshot;
  cloud: CloudSnapshot;
  base?: CloudSnapshot;
  conflicts: SyncConflict[];
  firstLink: boolean;
}

export class AzureBlobService {
  public readonly baseUrl = '/api/storage';
  private timer: ReturnType<typeof setInterval> | null = null;
  private debounce: ReturnType<typeof setTimeout> | null = null;
  private busy = false;
  private stopped = true;
  private reloadRequired = false;
  private starting: Promise<void> | null = null;
  private review: SyncReview | null = null;
  private status: CloudSyncStatus = { phase: 'local-only', message: 'Saved on this device only.', pendingChanges: 0 };
  private releaseTab: (() => void) | null = null;
  private startup = false;
  private importInProgress = false;
  private lastChange = 0;
  private changeGeneration = 0;
  private applyingReviewed = false;

  public isAvailable(): boolean {
    return !skipAuthentication && process.env.REACT_APP_CLOUD_SYNC_ENABLED === 'true';
  }

  public getStatus = (): CloudSyncStatus => this.status;
  public getReview = (): SyncReview | null => this.review;
  public setImportInProgress(value: boolean): void {
    this.importInProgress = value;
    if (!value && !this.stopped) this.schedule();
  }
  public async getBlobUrl(): Promise<string> { return `${this.baseUrl}/current`; }

  private setStatus(phase: CloudSyncStatus['phase'], message: string, pendingChanges = this.status.pendingChanges, lastSavedAt = this.status.lastSavedAt): void {
    this.status = { ...this.status, phase, message, pendingChanges, lastSavedAt };
    window.dispatchEvent(new Event(syncStatusEvent));
  }

  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.isAvailable()) throw new Error('Cloud sync is unavailable in this session. Data remains saved on this device.');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(`${this.baseUrl}/${path}`, {
        method: body === undefined ? 'GET' : 'PUT',
        credentials: 'same-origin', cache: 'no-store',
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      if (response.headers.get('X-MoMoney-Storage') !== '1') {
        throw new Error('The protected storage API is unavailable or sign-in expired. Your local changes are not yet backed up.');
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
    return { revision: value.revision, createdAt: value.createdAt, parent: value.parent, data: value.data, deletions: deletionReceipts(value.deletions) };
  }

  private async current(): Promise<CurrentResponse> {
    const response = await this.request('current');
    if (!isRecord(response) || typeof response.account !== 'string' || !('current' in response)) throw new Error('Incomplete cloud response. Saving is blocked.');
    return { account: response.account, current: response.current === null ? null : this.parseVersion(response.current) };
  }

  private async fingerprint(data: CloudSnapshot): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(snapshotContent(data)));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  private async checkOwner(account: string): Promise<void> {
    const owner = await db.syncMetadata.get('owner');
    if (owner && owner.fingerprint !== account) throw new CloudOwnershipError('This local database belongs to another cloud account. Sign back into that account and export its data before switching. Neither copy was changed.');
    this.status = { ...this.status, blocksEditing: false };
  }

  private async run(action: () => Promise<string>): Promise<SyncResult> {
    if (this.busy) return { success: false, message: 'Another cloud operation is in progress.' };
    if (this.reloadRequired) return { success: false, message: 'Reload to use the restored data before syncing again.' };
    this.busy = true;
    try {
      return { success: true, message: await action() };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[Cloud]', message);
      this.setStatus(navigator.onLine === false || error instanceof TypeError ? 'offline' : 'attention', message);
      if (error instanceof CloudOwnershipError) {
        this.status = { ...this.status, blocksEditing: true };
        window.dispatchEvent(new Event(syncStatusEvent));
      }
      return { success: false, message };
    } finally { this.busy = false; }
  }

  private canApply(): boolean {
    if (this.startup) return true;
    return !this.importInProgress && (this.applyingReviewed || (
      Date.now() - this.lastChange > 2000 &&
      !document.querySelector('form, input:not([type="hidden"]), textarea, select, [role="dialog"], [aria-modal="true"]')
    ));
  }

  private async remember(account: string, version: CloudVersion, applyBase?: CloudSnapshot): Promise<void> {
    const fingerprint = await this.fingerprint(version.data);
    await db.transaction('rw', db.syncMetadata, async () => {
      await db.syncMetadata.put({ id: `cloud:${account}`, revision: version.revision, fingerprint, data: version.data, updatedAt: version.createdAt });
      await db.syncMetadata.put({ id: 'owner', fingerprint: account });
      if (applyBase) await db.syncMetadata.put({ id: `apply-base:${account}`, data: applyBase, revision: version.revision });
      else await db.syncMetadata.delete(`apply-base:${account}`);
    });
  }

  private async install(data: CloudSnapshot, before: CloudSnapshot): Promise<boolean> {
    if (snapshotContent(data) === snapshotContent(before)) return true;
    if (!this.canApply()) return false;
    const { dataService } = await import('./dataService');
    // Do not swap persistence while an async operation has uncommitted in-memory edits.
    if (!await dataService.canApplyCloudSnapshot(before)) return false;
    this.setStatus('applying', 'Applying reconciled data. Both previous copies are recoverable.');
    dataService.suspendPersistence();
    try {
      await restoreSnapshot(data, before);
      await dataService.reloadAfterCloudSync();
      const [{ accountManagementService }, { rulesService }, { budgetService }, { userPreferencesService }] = await Promise.all([
        import('./accountManagementService'), import('./rulesService'), import('./budgetService'), import('./userPreferencesService')
      ]);
      accountManagementService.reloadFromStorage();
      rulesService.reloadFromStorage();
      budgetService.reloadFromStorage();
      await userPreferencesService.reloadFromStorage();
      window.dispatchEvent(new Event(cloudAppliedEvent));
      return true;
    } catch (error) {
      // A failed restore must never leave stale in-memory services able to save.
      this.reloadRequired = true;
      throw new Error(`Reconciliation could not be applied. Reload before editing. ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async finish(account: string, version: CloudVersion, before: CloudSnapshot): Promise<string> {
    const latest = await captureSnapshot();
    if (snapshotContent(latest) !== snapshotContent(before) || !await this.install(version.data, before)) {
      this.setStatus('pending', 'Changes saved on this device. Cloud updates will reconcile when editing finishes.');
      return this.status.message;
    }
    await this.remember(account, version);
    const generation = this.changeGeneration;
    const actual = await captureSnapshot();
    const pending = countSnapshotChanges(version.data, actual);
    if (pending) {
      await db.syncMetadata.put({ id: `queue:${account}`, data: actual, revision: version.revision });
      this.setStatus('pending', 'New edits are queued for cloud save.', pending, version.createdAt);
      this.schedule();
    } else {
      await db.syncMetadata.delete(`queue:${account}`);
      if (this.changeGeneration !== generation) {
        this.setStatus('pending', 'New edits are queued for cloud save.', Math.max(1, this.status.pendingChanges), version.createdAt);
        this.schedule();
        return this.status.message;
      }
      localStorage.removeItem(dirtyKey);
      this.setStatus('saved', 'Saved to cloud', 0, version.createdAt);
    }
    return this.status.message;
  }

  private async synchronize(approved?: { review: SyncReview; choices: Record<string, ConflictChoice> }): Promise<string> {
    const { dataService } = await import('./dataService');
    await dataService.readyForPersistence();
    if (this.importInProgress) {
      this.setStatus('pending', 'Import in progress. Cloud save will follow when it finishes.');
      return this.status.message;
    }
    this.setStatus('checking', 'Checking cloud changes...');
    const { current, account } = await this.current();
    await this.checkOwner(account);
    const local = await captureSnapshot();
    const baseline = await db.syncMetadata.get(`cloud:${account}`);
    const deferredBase = await db.syncMetadata.get(`apply-base:${account}`);
    const base = deferredBase?.data || baseline?.data;
    await db.syncMetadata.put({ id: `queue:${account}`, data: local, revision: baseline?.revision });
    this.status = { ...this.status, pendingChanges: base ? countSnapshotChanges(base, local) : local.transactions.length };
    if (approved && (approved.review.account !== account || approved.review.revision !== current?.revision ||
        snapshotContent(approved.review.local) !== snapshotContent(local))) {
      this.review = current ? {
        account, revision: current.revision, local, cloud: current.data, base,
        conflicts: mergeCloudSnapshots(base, local, current.data).conflicts, firstLink: !base
      } : null;
      throw new Error('Local or cloud data changed during review. Check the updated reconciliation preview.');
    }
    if (!current && baseline?.revision) throw new Error('The cloud save is unexpectedly missing. Saving is blocked; check recovery history.');
    if (!current && !hasSnapshotData(local)) {
      await db.syncMetadata.delete(`queue:${account}`);
      this.setStatus('pending', 'Ready to sync automatically when you add data.', 0);
      return this.status.message;
    }
    if (current && snapshotContent(local) === snapshotContent(current.data)) {
      this.review = null;
      return this.finish(account, current, local);
    }
    if (current && !base && !hasSnapshotData(local)) {
      this.review = null;
      return this.finish(account, current, local);
    }

    let data = local;
    if (current) {
      const firstLink = !base;
      if (!approved && this.review?.account === account && this.review.revision === current.revision &&
          snapshotContent(this.review.local) === snapshotContent(local)) {
        this.setStatus('attention', 'Reconciliation needs review in Settings. Both copies are preserved.');
        return this.status.message;
      }
      const merged = mergeCloudSnapshots(base, local, current.data, approved?.choices);
      if (merged.conflicts.length || (!approved && (firstLink || removedRecords(current.data, merged.data) > 0))) {
        this.review = { account, revision: current.revision, local, cloud: current.data, base, conflicts: merged.conflicts, firstLink };
        this.setStatus('attention', firstLink
          ? 'This device has existing data. Review reconciliation once; neither copy has been overwritten.'
          : 'Conflicting edits or local removals need review. Both copies are preserved.');
        return this.status.message;
      }
      data = merged.data;
    }
    this.review = null;
    if (current && snapshotContent(data) === snapshotContent(current.data)) return this.finish(account, current, local);

    // Keep the unsent local copy independently of the cloud's immutable versions.
    await db.recoverySnapshots.add({ id: uuid(), createdAt: new Date().toISOString(), data: local });
    const removalCount = current ? removedRecords(current.data, data) : 0;
    if (removalCount && !approved) throw new Error('Local removals require reconciliation review before cloud saving.');
    if (current && removalCount) {
      await db.syncMetadata.add({
        id: `deletion-approval:${uuid()}`, revision: current.revision,
        updatedAt: new Date().toISOString(), removals: snapshotRemovals(current.data, data)
      });
    }
    this.setStatus('saving', 'Saving changes to cloud...');
    const saved = this.parseVersion(await this.request('current', {
      expectedRevision: current?.revision ?? null, allowRemoval: removalCount > 0, data
    }));
    if (snapshotContent(saved.data) !== snapshotContent(data)) throw new Error('Server returned different data. Save not acknowledged; review cloud history.');
    // If edits arrive during the request, retain their local baseline separately
    // until incoming cloud changes can be applied. Never acknowledge newer edits.
    await this.remember(account, saved, local);
    return this.finish(account, saved, local);
  }

  public forceUpload(): Promise<SyncResult> { return this.run(() => this.synchronize()); }
  public async syncToCloud(): Promise<boolean> { return (await this.forceUpload()).success; }
  public resolveReview(choices: Record<string, ConflictChoice>, expectedReview = this.review): Promise<SyncResult> {
    const review = expectedReview;
    if (review !== this.review) return Promise.resolve({ success: false, message: 'The preview changed. Review the latest values before applying.' });
    if (!review) return Promise.resolve({ success: false, message: 'The review expired. Check for cloud changes again.' });
    if (review.conflicts.some(conflict => !choices[conflict.key])) return Promise.resolve({ success: false, message: 'Choose a version for every conflict.' });
    return this.run(async () => {
      this.applyingReviewed = true;
      try { return await this.synchronize({ review, choices }); }
      finally { this.applyingReviewed = false; }
    });
  }

  public forceDownload(revision?: string): Promise<SyncResult> {
    return this.run(async () => {
      const { current, account } = await this.current();
      await this.checkOwner(account);
      const version = revision ? this.parseVersion(await this.request(`version?revision=${encodeURIComponent(revision)}`)) : current;
      if (!version) throw new Error('No cloud data found. Local data was not changed.');
      this.stopSync(false);
      const { dataService } = await import('./dataService');
      await dataService.readyForPersistence();
      const before = await captureSnapshot();
      dataService.suspendPersistence();
      this.reloadRequired = true;
      await restoreSnapshot(version.data, before);
      // Restoring an older version is a new local edit against the current
      // head, not permission to overwrite it. Reconciliation resumes on reload.
      if (current) await this.remember(account, current);
      return 'Data restored. The previous local copy is retained in recovery snapshots. Reload to resume automatic reconciliation.';
    });
  }

  public async listVersions(cursor?: string): Promise<{ versions: Omit<CloudVersion, 'data'>[]; next: string | null }> {
    const result = await this.request(`versions${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!isRecord(result) || !Array.isArray(result.versions) || !(result.next === null || typeof result.next === 'string')) throw new Error('Invalid version history.');
    const versions = result.versions.map(value => {
      if (!isRecord(value) || typeof value.revision !== 'string' || typeof value.createdAt !== 'string' ||
          !(value.parent === null || typeof value.parent === 'string')) throw new Error('Invalid version metadata.');
      return { revision: value.revision, parent: value.parent, createdAt: value.createdAt };
    });
    return { versions, next: result.next };
  }

  private schedule = (): void => {
    this.changeGeneration++;
    this.lastChange = Date.now();
    if (this.stopped) return;
    if (this.debounce) clearTimeout(this.debounce);
    if (!this.busy) this.setStatus('pending', 'Changes saved on this device. Waiting for cloud confirmation.', 0);
    this.debounce = setTimeout(() => { void this.syncToCloud(); }, 2500);
  };
  private wake = (): void => { if (!this.stopped && document.visibilityState !== 'hidden') void this.syncToCloud(); };
  private offline = (): void => { this.setStatus('offline', 'Offline. Changes stay on this device and retry automatically.'); };
  private beforeUnload = (event: BeforeUnloadEvent): void => {
    if (this.status.phase !== 'saved' && (localStorage.getItem(dirtyKey) || this.status.pendingChanges > 0)) {
      event.preventDefault();
      event.returnValue = '';
    }
  };

  public async startSync(): Promise<void> {
    if (!this.isAvailable()) {
      this.setStatus('local-only', 'Saved on this device only. Cloud sync is unavailable in this session.');
      return;
    }
    if (this.timer) return;
    if (this.starting) return this.starting;
    this.stopped = false;
    this.starting = (async () => {
      // One editable tab per browser database prevents stale service caches in
      // another tab from replacing a reconciled snapshot.
      if (navigator.locks) {
        const acquired = await new Promise<boolean>((resolve, reject) => {
          void navigator.locks.request('mo-money-sync-editor', { ifAvailable: true }, async lock => {
            if (!lock) { resolve(false); return; }
            await new Promise<void>(release => { this.releaseTab = release; resolve(true); });
          }).catch(reject);
        });
        if (!acquired) {
          this.stopped = true;
          throw new Error('Mo Money is already open in another tab. Close that tab and reload here to avoid conflicting local edits.');
        }
      }
      if (this.stopped) { this.releaseTab?.(); this.releaseTab = null; return; }
      window.addEventListener(localChangeEvent, this.schedule);
      window.addEventListener('online', this.wake);
      window.addEventListener('focus', this.wake);
      window.addEventListener('offline', this.offline);
      window.addEventListener('beforeunload', this.beforeUnload);
      document.addEventListener('visibilitychange', this.wake);
      this.startup = true;
      try { await this.syncToCloud(); }
      finally { this.startup = false; }
      if (!this.stopped) this.timer = setInterval(() => { void this.syncToCloud(); }, 30000);
    })();
    try { await this.starting; }
    finally { this.starting = null; }
  }

  public stopSync(releaseTab = true): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.debounce) clearTimeout(this.debounce);
    this.timer = null;
    this.debounce = null;
    window.removeEventListener(localChangeEvent, this.schedule);
    window.removeEventListener('online', this.wake);
    window.removeEventListener('focus', this.wake);
    window.removeEventListener('offline', this.offline);
    window.removeEventListener('beforeunload', this.beforeUnload);
    document.removeEventListener('visibilitychange', this.wake);
    if (releaseTab) {
      this.releaseTab?.();
      this.releaseTab = null;
    }
  }

  public restoreLocalSnapshot(data: CloudSnapshot): Promise<SyncResult> {
    return this.run(async () => {
      validateSnapshot(data);
      const { dataService } = await import('./dataService');
      await dataService.readyForPersistence();
      const before = await captureSnapshot();
      this.stopSync(false);
      this.reloadRequired = true;
      dataService.suspendPersistence();
      await restoreSnapshot(data, before);
      return 'Local snapshot restored. Reload to resume guarded reconciliation.';
    });
  }

  public recoverLocalRestore(): Promise<SyncResult> {
    return this.run(async () => {
      if (!await db.syncMetadata.get('pending-restore')) throw new Error('No interrupted restore found. Reload before editing.');
      const { dataService } = await import('./dataService');
      this.stopSync(false);
      this.reloadRequired = true;
      dataService.suspendPersistence();
      await recoverInterruptedRestore();
      return 'The interrupted restore was recovered. Reload to resume guarded reconciliation.';
    });
  }
}

export const azureBlobService = new AzureBlobService();
