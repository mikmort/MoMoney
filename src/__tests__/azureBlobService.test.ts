import { webcrypto } from 'crypto';
import { AzureBlobService } from '../services/azureBlobService';
import { captureSnapshot, restoreSnapshot } from '../services/cloudSnapshotService';
import { notificationService } from '../services/notificationService';
import { db } from '../services/db';
import { CloudSnapshot, CloudVersion } from '../utils/cloudSnapshot';
import { mockUser } from '../config/devConfig';
import { defaultCategories } from '../data/defaultCategories';

jest.mock('../config/devConfig', () => ({ ...jest.requireActual('../config/devConfig'), skipAuthentication: false }));
jest.mock('../services/cloudSnapshotService');
jest.mock('../services/dataService', () => ({ dataService: { readyForPersistence: jest.fn(), suspendPersistence: jest.fn() } }));
jest.mock('../services/notificationService', () => ({ notificationService: { showConfirmation: jest.fn(), showAlert: jest.fn() } }));

const capture = jest.mocked(captureSnapshot);
const restore = jest.mocked(restoreSnapshot);
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let service: AzureBlobService;

function data(ids = ['one']): CloudSnapshot {
  return {
    schemaVersion: 1,
    transactions: ids.map(id => ({ id, date: '2026-01-01', amount: 5, description: id, category: 'Salary', account: 'Checking', type: 'income' })),
    transactionHistory: [], preferences: [],
    storage: { 'mo-money-accounts': null, 'mo-money-categories': null, 'mo-money-category-rules': null, 'mo-money-budgets': null, 'mo-money-templates': null }
  };
}
function version(snapshot = data(), revision = 'first'): CloudVersion {
  return { data: snapshot, revision, parent: null, createdAt: '2026-01-01T00:00:00Z' };
}
function response(body: unknown, status = 200, protocol = '1'): Response {
  const values = new Map([['x-momoney-storage', protocol]]);
  const headers: Headers = {
    get: name => values.get(name.toLowerCase()) ?? null,
    has: name => values.has(name.toLowerCase()),
    set: (name, value) => { values.set(name.toLowerCase(), value); },
    append: (name, value) => { values.set(name.toLowerCase(), value); },
    delete: name => { values.delete(name.toLowerCase()); },
    forEach: (callback, thisArg) => values.forEach((value, name) => callback.call(thisArg, value, name, headers)),
    entries: () => values.entries(),
    keys: () => values.keys(),
    values: () => values.values(),
    [Symbol.iterator]: () => values.entries()
  };
  return {
    ok: status >= 200 && status < 300, status, statusText: '', url: '', type: 'basic',
    redirected: false, body: null, bodyUsed: false,
    headers,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone: () => response(body, status, protocol),
    arrayBuffer: async () => { throw new Error('Unexpected binary response'); },
    blob: async () => { throw new Error('Unexpected blob response'); },
    formData: async () => { throw new Error('Unexpected form response'); }
  };
}
function current(snapshot: CloudVersion | null) {
  return response({ current: snapshot, account: 'alice' });
}
async function link(snapshot = data()) {
  capture.mockResolvedValue(snapshot);
  fetchMock.mockResolvedValueOnce(current(null)).mockResolvedValueOnce(response(version(snapshot)));
  expect((await service.forceUpload()).success).toBe(true);
  fetchMock.mockReset();
}

beforeEach(async () => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  process.env.REACT_APP_CLOUD_SYNC_ENABLED = 'true';
  await db.open();
  await db.syncMetadata.clear();
  localStorage.clear();
  service = new AzureBlobService();
  capture.mockResolvedValue(data());
});
afterEach(() => { service.stopSync(); });
afterAll(() => db.close());

test('construction and disabled cloud configuration never send data', async () => {
  expect(fetchMock).not.toHaveBeenCalled();
  process.env.REACT_APP_CLOUD_SYNC_ENABLED = 'false';
  expect((await service.forceUpload()).success).toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

test('initial upload reads first and uses an explicit null base revision', async () => {
  await link();
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe('first');
});

test('empty new client cannot overwrite existing cloud data, even with manual upload', async () => {
  capture.mockResolvedValue(data([]));
  fetchMock.mockResolvedValue(current(version()));
  const result = await service.forceUpload();
  expect(result.success).toBe(false);
  expect(result.message).toMatch(/differs/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(restore).not.toHaveBeenCalled();
});

test('HTTP, network, malformed and missing-protocol responses never trigger a write fallback', async () => {
  for (const result of [response({}, 403), response({}, 200, ''), response({}), response({ current: { data: null }, account: 'alice' })]) {
    fetchMock.mockResolvedValueOnce(result);
    expect((await service.forceUpload()).success).toBe(false);
  }
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect((await service.forceUpload()).success).toBe(false);
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

test('unchanged content is not uploaded again and newer cloud revisions block stale clients', async () => {
  await link();
  fetchMock.mockResolvedValueOnce(current(version()));
  expect((await service.forceUpload()).success).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  capture.mockResolvedValue(data(['one', 'local']));
  fetchMock.mockResolvedValueOnce(current(version(data(['one', 'remote']), 'second')));
  expect((await service.forceUpload()).success).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('automatic empty save is blocked; intentional deletion requires confirmation', async () => {
  await link();
  capture.mockResolvedValue(data([]));
  fetchMock.mockResolvedValue(current(version()));
  await service.startSync();
  expect(await service.syncToCloud()).toBe(false);
  expect(jest.mocked(notificationService.showConfirmation)).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  jest.mocked(notificationService.showConfirmation).mockResolvedValue(true);
  fetchMock.mockReset();
  fetchMock.mockResolvedValueOnce(current(version())).mockResolvedValueOnce(response(version(data([]), 'second')));
  expect((await service.forceUpload()).success).toBe(true);
  const body = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
  expect(body).toMatchObject({ expectedRevision: 'first', allowRemoval: true });
});

test('editing during deletion confirmation invalidates the reviewed save', async () => {
  await link();
  capture.mockResolvedValueOnce(data([])).mockResolvedValueOnce(data(['changed']));
  fetchMock.mockResolvedValueOnce(current(version()));
  jest.mocked(notificationService.showConfirmation).mockResolvedValue(true);
  expect((await service.forceUpload()).message).toMatch(/changed during confirmation/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('failed conditional upload does not acknowledge a revision or retry unconditionally', async () => {
  await link();
  capture.mockResolvedValue(data(['one', 'two']));
  fetchMock.mockResolvedValueOnce(current(version())).mockResolvedValueOnce(response({ error: 'conflict' }, 409));
  expect((await service.forceUpload()).success).toBe(false);
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe('first');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('cloud restore requires a reload and disables auto-save', async () => {
  fetchMock.mockResolvedValue(current(version()));
  expect((await service.forceDownload()).success).toBe(true);
  expect(restore).toHaveBeenCalledWith(data());
  expect(localStorage.getItem('mo_money_autosave_enabled')).toBe('false');
  expect((await service.forceUpload()).message).toMatch(/Reload/);
});

test('switching accounts cannot upload the previous account local cache', async () => {
  await link();
  fetchMock.mockResolvedValue(response({ current: null, account: 'bob' }));
  expect((await service.forceUpload()).message).toMatch(/another cloud account/);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('startup restores a new device including accounts without uploading or suspending caches', async () => {
  const remote = data();
  remote.storage['mo-money-accounts'] = JSON.stringify([
    { id: 'checking', name: 'My Checking', institution: 'Bank', currency: 'USD', type: 'checking', isActive: true }
  ]);
  capture.mockResolvedValue(data([]));
  fetchMock.mockResolvedValue(current(version(remote)));
  expect(await service.loadOnStartup()).toBe(true);
  expect(restore).toHaveBeenCalledWith(remote);
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe('first');
  expect((await db.syncMetadata.get('owner'))?.fingerprint).toBe('alice');
  expect(localStorage.getItem('mo_money_autosave_enabled')).toBeNull();
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  const { dataService } = await import('../services/dataService');
  expect(dataService.suspendPersistence).not.toHaveBeenCalled();
});

test('default preferences and categories from an earlier empty boot do not block startup loading', async () => {
  const local = data([]);
  local.preferences = [{ id: 'default', ...mockUser.preferences, lastModified: '2026-01-01' }];
  local.storage['mo-money-categories'] = JSON.stringify(defaultCategories);
  capture.mockResolvedValue(local);
  fetchMock.mockResolvedValue(current(version()));
  expect(await service.loadOnStartup()).toBe(true);
});

test.each(['accounts', 'preferences', 'history', 'categories', 'transactions'])(
  'startup preserves unlinked custom %s rather than assuming no accounts means no data', async kind => {
    const local = data([]);
    if (kind === 'accounts') local.storage['mo-money-accounts'] = JSON.stringify([{ id: 'local' }]);
    if (kind === 'preferences') local.preferences = [{ id: 'default', ...mockUser.preferences, currency: 'EUR' }];
    if (kind === 'history') local.transactionHistory = [{ id: 'history' }];
    if (kind === 'categories') local.storage['mo-money-categories'] = JSON.stringify([{ id: 'custom' }]);
    if (kind === 'transactions') local.transactions = data().transactions;
    capture.mockResolvedValue(local);
    fetchMock.mockResolvedValue(current(version(data(['remote']))));
    await expect(service.loadOnStartup()).rejects.toThrow('unsaved local data');
    expect(restore).not.toHaveBeenCalled();
  }
);

test('startup refreshes an unchanged linked device when a newer cloud revision exists', async () => {
  await link();
  fetchMock.mockResolvedValue(current(version(data(['one', 'remote']), 'second')));
  expect(await service.loadOnStartup()).toBe(true);
  expect(restore).toHaveBeenCalledWith(data(['one', 'remote']));
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe('second');
});

test('startup does not discard local deletions or edits when the cloud advances', async () => {
  await link();
  fetchMock.mockResolvedValue(current(version(data(['one', 'remote']), 'second')));
  for (const local of [data([]), data(['one', 'local'])]) {
    capture.mockResolvedValue(local);
    await expect(service.loadOnStartup()).rejects.toThrow('unsaved local data');
  }
  expect(restore).not.toHaveBeenCalled();
});

test('startup keeps edits against the current revision for subsequent guarded autosave', async () => {
  await link();
  capture.mockResolvedValue(data(['one', 'local']));
  fetchMock.mockResolvedValue(current(version()));
  expect(await service.loadOnStartup()).toBe(false);
  expect(restore).not.toHaveBeenCalled();
});

test('startup links matching data without restoring and does nothing for a new cloud account', async () => {
  fetchMock.mockResolvedValueOnce(current(null)).mockResolvedValueOnce(current(version()));
  expect(await service.loadOnStartup()).toBe(false);
  expect(await db.syncMetadata.get('owner')).toBeUndefined();
  expect(await service.loadOnStartup()).toBe(false);
  expect((await db.syncMetadata.get('owner'))?.fingerprint).toBe('alice');
  expect(restore).not.toHaveBeenCalled();
});

test('startup rejects account switches and unexpectedly missing saves', async () => {
  await link();
  fetchMock.mockResolvedValueOnce(response({ current: version(), account: 'bob' }));
  await expect(service.loadOnStartup()).rejects.toThrow('another cloud account');
  fetchMock.mockResolvedValueOnce(current(null));
  await expect(service.loadOnStartup()).rejects.toThrow('unexpectedly missing');
  expect(restore).not.toHaveBeenCalled();
});

test('startup reports offline, invalid responses, and interrupted restores without uploading', async () => {
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  await expect(service.loadOnStartup()).rejects.toThrow('offline');
  fetchMock.mockResolvedValueOnce(response({}));
  await expect(service.loadOnStartup()).rejects.toThrow('Incomplete cloud response');
  capture.mockRejectedValueOnce(new Error('An interrupted restore needs recovery'));
  fetchMock.mockResolvedValueOnce(current(version()));
  await expect(service.loadOnStartup()).rejects.toThrow('interrupted restore');
  expect(restore).not.toHaveBeenCalled();
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

test('startup preserves legacy data and rejects local edits made during the cloud read', async () => {
  capture.mockResolvedValue(data([]));
  fetchMock.mockResolvedValue(current(version()));
  localStorage.setItem('mo-money-transactions', '[{"id":"legacy"}]');
  await expect(service.loadOnStartup()).rejects.toThrow('Legacy local data');
  localStorage.removeItem('mo-money-transactions');
  capture.mockResolvedValueOnce(data([])).mockResolvedValueOnce(data(['new-edit']));
  await expect(service.loadOnStartup()).rejects.toThrow('Local data changed');
  expect(restore).not.toHaveBeenCalled();
});

test('failed startup restore does not acknowledge the remote version', async () => {
  capture.mockResolvedValue(data([]));
  fetchMock.mockResolvedValue(current(version()));
  restore.mockRejectedValueOnce(new Error('Storage full'));
  await expect(service.loadOnStartup()).rejects.toThrow('Storage full');
  expect(await db.syncMetadata.get('cloud:alice')).toBeUndefined();
});

test('a deliberate older recovery version is not replaced on next startup', async () => {
  const remote = data(['one', 'two']);
  fetchMock.mockResolvedValueOnce(current(version(remote, 'second')))
    .mockResolvedValueOnce(response(version(data(), 'first')));
  expect((await service.forceDownload('first')).success).toBe(true);
  restore.mockClear();
  service = new AzureBlobService();
  capture.mockResolvedValue(data());
  fetchMock.mockResolvedValue(current(version(data(['one', 'two', 'three']), 'third')));
  await expect(service.loadOnStartup()).rejects.toThrow('unsaved local data');
  expect(restore).not.toHaveBeenCalled();
});
