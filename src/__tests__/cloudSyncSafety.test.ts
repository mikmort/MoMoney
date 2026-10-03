import { webcrypto } from 'crypto';
import { AzureBlobService } from '../services/azureBlobService';
import { db } from '../services/db';
import { staticWebAppAuthService } from '../services/staticWebAppAuthService';
import { notificationService } from '../services/notificationService';
import {
  cloudSyncSnapshotService, decodeSnapshot, encodeSnapshot,
  snapshotContent, snapshotFingerprint
} from '../services/cloudSyncSnapshotService';
import type { ExportData } from '../services/simplifiedImportExportService';
import type { Transaction } from '../types';

jest.mock('../config/devConfig', () => ({ skipAuthentication: false }));
jest.mock('../services/staticWebAppAuthService', () => ({
  staticWebAppAuthService: { getUser: jest.fn() }
}));
jest.mock('../services/notificationService', () => ({
  notificationService: { showAlert: jest.fn(), showConfirmation: jest.fn() }
}));

const transaction = (id: string): Transaction => ({
  id, date: new Date('2026-01-01'), amount: -42, description: 'Imported transaction',
  category: 'Food', account: 'Checking', type: 'expense'
});
const snapshot = (ids: string[]): ExportData => ({
  version: '1.0', appVersion: '0.1.0', exportDate: '2026-01-01',
  transactions: ids.map(transaction), transactionHistory: [], preferences: null,
  accounts: [], categories: [], rules: [], budgets: []
});

describe('cloud sync data safety', () => {
  let service: AzureBlobService;
  let blobs: Map<string, { data: unknown; etag: string }>;
  let writes: string[];
  let revision: number;
  const head = 'account-one-money-save';
  const mockAuth = staticWebAppAuthService.getUser as jest.Mock;
  const mockConfirmation = notificationService.showConfirmation as jest.Mock;

  beforeAll(() => {
    Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    localStorage.clear();
    await db.clearAll();
    service = new AzureBlobService();
    blobs = new Map();
    writes = [];
    revision = 0;
    mockAuth.mockResolvedValue({ userId: 'account-one' });
    mockConfirmation.mockResolvedValue(false);
    global.fetch = jest.fn(async (url: RequestInfo | URL, options?: RequestInit) => {
      const name = String(url).split('/').pop()!;
      const stored = blobs.get(name);
      if (options?.method === 'POST' || options?.method === 'PUT') {
        const headers = options.headers as Record<string, string>;
        if ((headers['If-None-Match'] === '*' && stored) ||
            (headers['If-Match'] && headers['If-Match'] !== stored?.etag)) {
          return response(412);
        }
        writes.push(name);
        blobs.set(name, { data: JSON.parse(String(options.body)), etag: `"${++revision}"` });
        return response(200);
      }
      return stored ? response(200, stored.data, stored.etag) : response(404);
    });
  });

  afterEach(() => {
    service.stopSync();
    jest.restoreAllMocks();
  });

  function response(status: number, body: unknown = null, etag: string | null = null): Response {
    return {
      ok: status >= 200 && status < 300, status,
      headers: { get: (name: string) => name.toLowerCase() === 'etag' ? etag : null },
      json: async () => body
    } as Response;
  }

  function setCloud(data: ExportData) {
    blobs.set(head, { data: encodeSnapshot(data), etag: '"original"' });
  }

  async function seedLocal(data: ExportData) {
    await cloudSyncSnapshotService.restore(data, await cloudSyncSnapshotService.read());
  }

  async function setBaseline(data: ExportData) {
    localStorage.setItem('mo_money_sync_baseline_account-one', await snapshotFingerprint(data));
  }

  it('does not start any network or timer work on construction', () => {
    expect(fetch).not.toHaveBeenCalled();
  });

  it('roams data into a fresh browser even with a corrupt legacy timestamp', async () => {
    const cloud = { ...snapshot(['imported']), exportDate: 'not-a-date' };
    setCloud(cloud);
    expect(await service.synchronize()).toMatchObject({ success: true, restored: true });
    expect((await db.transactions.toArray()).map(row => row.id)).toEqual(['imported']);
    expect(writes).toEqual([]);
  });

  it('does not overwrite cloud data after the local database becomes empty', async () => {
    const cloud = snapshot(['important']);
    setCloud(cloud);
    await setBaseline(cloud);
    const result = await service.synchronize();
    expect(result.success).toBe(false);
    expect(result.message).toContain('remove');
    expect(writes).toEqual([]);
    expect(decodeSnapshot(blobs.get(head)!.data).transactions).toHaveLength(1);
    expect(notificationService.showAlert).toHaveBeenCalled();
  });

  it('detects partial loss by IDs, not just row count', async () => {
    const cloud = snapshot(['a', 'b']);
    setCloud(cloud);
    await setBaseline(cloud);
    await seedLocal(snapshot(['a', 'unrelated-new-import']));
    expect((await service.synchronize()).success).toBe(false);
    expect(writes).toEqual([]);
  });

  it('uploads newly imported transactions and verifies a recovery copy before the head', async () => {
    const old = snapshot(['a']);
    setCloud(old);
    await setBaseline(old);
    await seedLocal(snapshot(['a', 'new-import']));
    expect((await service.synchronize()).success).toBe(true);
    expect(writes).toHaveLength(3);
    expect(writes.slice(0, 2).every(name => name.startsWith(`${head}-recovery-`))).toBe(true);
    expect(writes[2]).toBe(head);
    expect(decodeSnapshot(blobs.get(head)!.data).transactions).toHaveLength(2);
    writes.length = 0;
    expect((await service.synchronize()).success).toBe(true);
    expect(writes).toEqual([]);
  });

  it('requires confirmation even for manual removal, and preserves both recovery copies', async () => {
    const cloud = snapshot(['a', 'b']);
    setCloud(cloud);
    await seedLocal(snapshot(['a']));
    expect((await service.forceUpload()).success).toBe(false);
    expect(writes).toEqual([]);
    mockConfirmation.mockResolvedValue(true);
    expect((await service.forceUpload()).success).toBe(true);
    expect(decodeSnapshot(blobs.get(writes[0])!.data).transactions).toHaveLength(2);
    expect(decodeSnapshot(blobs.get(head)!.data).transactions).toHaveLength(1);
  });

  it('pauses divergent offline edits rather than selecting the newest timestamp', async () => {
    setCloud(snapshot(['cloud-import']));
    await seedLocal(snapshot(['local-import']));
    expect((await service.synchronize()).message).toContain('shared baseline');
    expect(writes).toEqual([]);
    expect((await db.transactions.toArray())[0].id).toBe('local-import');
  });

  it('does not treat a read failure as an absent cloud copy', async () => {
    await seedLocal(snapshot(['a']));
    (fetch as jest.Mock).mockResolvedValue(response(500));
    expect((await service.forceUpload()).success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(writes).toEqual([]);
  });

  it('does not retry another route after an ambiguous network failure', async () => {
    (fetch as jest.Mock).mockRejectedValue(new Error('offline'));
    expect((await service.forceUpload()).success).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid cloud response before modifying local data', async () => {
    await seedLocal(snapshot(['a']));
    blobs.set(head, { data: { success: true, data: {} }, etag: '"bad"' });
    expect((await service.forceDownload()).success).toBe(false);
    expect((await db.transactions.toArray())[0].id).toBe('a');
    expect(writes).toEqual([]);
  });

  it('blocks uploads when stored local collections are corrupt', async () => {
    localStorage.setItem('mo-money-accounts', '{invalid');
    expect((await service.forceUpload()).success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exports inactive accounts rather than only the active-account cache', async () => {
    const accounts = [{ id: 'archived', name: 'Archived', currency: 'USD', isActive: false }];
    localStorage.setItem('mo-money-accounts', JSON.stringify(accounts));
    expect((await cloudSyncSnapshotService.read()).accounts).toEqual(accounts);
  });

  it('fails closed if the proxy does not expose ETags', async () => {
    setCloud(snapshot(['a']));
    await setBaseline(snapshot(['a']));
    await seedLocal(snapshot(['a', 'b']));
    blobs.get(head)!.etag = '';
    expect((await service.synchronize()).message).toContain('ETag');
    expect(writes).toEqual([]);
  });

  it('leaves the head alone if a recovery upload fails', async () => {
    setCloud(snapshot(['a']));
    await setBaseline(snapshot(['a']));
    await seedLocal(snapshot(['a', 'b']));
    (fetch as jest.Mock).mockImplementation(async (url, options) => {
      if (options?.method === 'POST') return response(500);
      return backendRead(url);
    });
    function backendRead(url: string) {
      const stored = blobs.get(url.split('/').pop()!);
      return Promise.resolve(stored ? response(200, stored.data, stored.etag) : response(404));
    }
    expect((await service.synchronize()).success).toBe(false);
    expect(writes).toEqual([]);
    expect(decodeSnapshot(blobs.get(head)!.data).transactions).toHaveLength(1);
  });

  it('does not fall back to an unconditional write after an ETag conflict', async () => {
    const old = snapshot(['a']);
    setCloud(old);
    await setBaseline(old);
    await seedLocal(snapshot(['a', 'local']));
    const backend = (fetch as jest.Mock).getMockImplementation()!;
    (fetch as jest.Mock).mockImplementation(async (url, options) => {
      if (String(url).endsWith(`/upload/${head}`)) {
        blobs.set(head, { data: encodeSnapshot(snapshot(['a', 'other-device'])), etag: '"newer"' });
      }
      return backend(url, options);
    });
    expect((await service.synchronize()).message).toContain('another device');
    expect(writes).toHaveLength(2);
    expect(writes).not.toContain(head);
    expect(decodeSnapshot(blobs.get(head)!.data).transactions.map(row => row.id)).toContain('other-device');
    expect(localStorage.getItem('mo_money_sync_baseline_account-one')).toBe(await snapshotFingerprint(old));
  });

  it('does not mark an upload successful when the server returns success without storing it', async () => {
    await seedLocal(snapshot(['a']));
    (fetch as jest.Mock).mockImplementation(async (_url, options) =>
      response(options?.method === 'POST' ? 200 : 404));
    expect((await service.forceUpload()).message).toContain('could not be verified');
    expect(localStorage.getItem('mo_money_sync_baseline_account-one')).toBeNull();
  });

  it('keeps a recovery copy of local imports before a manual download', async () => {
    await seedLocal(snapshot(['local-import']));
    setCloud(snapshot(['cloud-import']));
    expect(await service.forceDownload()).toMatchObject({ success: true, restored: true });
    expect(writes).toHaveLength(1);
    expect(decodeSnapshot(blobs.get(writes[0])!.data).transactions[0].id).toBe('local-import');
    expect((await db.transactions.toArray())[0].id).toBe('cloud-import');
    expect((await service.forceUpload()).message).toContain('Reload');
  });

  it('blocks uploads after a crash during local restoration', async () => {
    localStorage.setItem('mo_money_sync_restore_pending', 'interrupted');
    expect((await service.forceUpload()).message).toContain('interrupted');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not recreate a missing previously-synchronized cloud copy', async () => {
    await seedLocal(snapshot(['a']));
    await setBaseline(snapshot(['a']));
    expect((await service.synchronize()).message).toContain('missing');
    expect(writes).toEqual([]);
  });

  it('never syncs using anonymous or fallback account IDs', async () => {
    mockAuth.mockResolvedValue(null);
    expect((await service.forceUpload()).success).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('blocks a different signed-in account from uploading this browser cache', async () => {
    localStorage.setItem('mo_money_sync_owner', 'another-account');
    expect((await service.forceUpload()).message).toContain('another account');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('serializes manual uploads and downloads', async () => {
    let release!: (value: Response) => void;
    (fetch as jest.Mock).mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const running = service.forceUpload();
    while (!release) await new Promise(resolve => setTimeout(resolve, 0));
    expect((await service.forceDownload()).message).toContain('already running');
    release(response(500));
    await running;
  });

  it('rolls back transaction replacement if any insert fails', async () => {
    await seedLocal(snapshot(['original']));
    const before = await cloudSyncSnapshotService.read();
    jest.spyOn(db.transactions, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));
    await expect(cloudSyncSnapshotService.restore(snapshot(['replacement']), before)).rejects.toThrow('disk full');
    expect((await db.transactions.toArray())[0].id).toBe('original');
  });

  it('rolls back IndexedDB and localStorage if a localStorage write fails', async () => {
    await seedLocal(snapshot(['original']));
    const before = await cloudSyncSnapshotService.read();
    const originalSet = Storage.prototype.setItem;
    let fail = true;
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function(key, value) {
      if (key === 'mo-money-budgets' && fail) {
        fail = false;
        throw new Error('quota exceeded');
      }
      originalSet.call(this, key, value);
    });
    await expect(cloudSyncSnapshotService.restore(snapshot(['replacement']), before)).rejects.toThrow('quota exceeded');
    expect(snapshotContent(await cloudSyncSnapshotService.read())).toBe(snapshotContent(before));
  });

  it('rejects an import made while the download was in flight instead of clearing it', async () => {
    const before = await cloudSyncSnapshotService.read();
    await db.transactions.add(transaction('just-imported'));
    await expect(cloudSyncSnapshotService.restore(snapshot(['cloud']), before)).rejects.toThrow('changed during download');
    expect((await db.transactions.toArray())[0].id).toBe('just-imported');
  });

  it('rejects a single malformed transaction, duplicate ID, or missing collection', () => {
    expect(() => decodeSnapshot({ ...snapshot(['a', 'b']), transactions: [transaction('a'), { id: 'b' }] })).toThrow();
    expect(() => decodeSnapshot(snapshot(['a', 'a']))).toThrow('duplicate');
    expect(() => decodeSnapshot({ ...snapshot(['a']), transactions: undefined })).toThrow('transactions');
  });

  it('accepts wrapped legacy cloud data and ignores volatile export dates in comparisons', () => {
    const a = snapshot(['b', 'a']);
    const b = { ...snapshot(['a', 'b']), exportDate: '2030-01-01' };
    expect(snapshotContent(decodeSnapshot({ success: true, data: { content: JSON.stringify(encodeSnapshot(a)) } })))
      .toBe(snapshotContent(b));
  });
});
