import { webcrypto } from 'crypto';
import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { AzureBlobService } from '../services/azureBlobService';
import { captureSnapshot, restoreSnapshot } from '../services/cloudSnapshotService';
import { db } from '../services/db';
import { CloudSnapshot, CloudVersion } from '../utils/cloudSnapshot';
import { notifyLocalChange } from '../services/syncEvents';
import { dataService } from '../services/dataService';

jest.mock('../config/devConfig', () => ({ skipAuthentication: false }));
jest.mock('../services/cloudSnapshotService');
jest.mock('../services/dataService', () => ({ dataService: {
  readyForPersistence: jest.fn(), suspendPersistence: jest.fn(), reloadAfterCloudSync: jest.fn(),
  canApplyCloudSnapshot: jest.fn().mockResolvedValue(true)
} }));
jest.mock('../services/accountManagementService', () => ({ accountManagementService: { reloadFromStorage: jest.fn() } }));
jest.mock('../services/rulesService', () => ({ rulesService: { reloadFromStorage: jest.fn() } }));
jest.mock('../services/budgetService', () => ({ budgetService: { reloadFromStorage: jest.fn() } }));
jest.mock('../services/userPreferencesService', () => ({ userPreferencesService: { reloadFromStorage: jest.fn() } }));

const capture = jest.mocked(captureSnapshot);
const restore = jest.mocked(restoreSnapshot);
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
let service: AzureBlobService;
let local: CloudSnapshot;
let remote: CloudVersion | null;
let account: string;
let writes: number;

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
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (name: string) => name.toLowerCase() === 'x-momoney-storage' ? protocol : null },
    json: async () => body
  } as Response;
}
async function server(_url: RequestInfo | URL, options?: RequestInit): Promise<Response> {
  if (options?.method !== 'PUT') return response({ current: remote, account });
  const body = JSON.parse(String(options.body));
  if (body.expectedRevision !== (remote?.revision ?? null)) return response({ error: 'Cloud data changed.' }, 409);
  writes++;
  remote = { data: body.data, revision: `revision-${writes}`, parent: remote?.revision ?? null, createdAt: new Date().toISOString() };
  return response(remote);
}
async function link() {
  expect((await service.forceUpload()).success).toBe(true);
  expect(writes).toBe(1);
  fetchMock.mockClear();
}

beforeEach(async () => {
  jest.clearAllMocks();
  fetchMock.mockReset();
  global.fetch = fetchMock;
  Object.defineProperty(global, 'crypto', { configurable: true, value: webcrypto });
  process.env.REACT_APP_CLOUD_SYNC_ENABLED = 'true';
  await db.open();
  await db.syncMetadata.clear();
  await db.recoverySnapshots.clear();
  localStorage.clear();
  local = data();
  remote = null;
  account = 'alice';
  writes = 0;
  service = new AzureBlobService();
  capture.mockImplementation(async () => local);
  restore.mockImplementation(async snapshot => { local = snapshot; });
  jest.mocked(dataService.canApplyCloudSnapshot).mockResolvedValue(true);
  fetchMock.mockImplementation(server);
});
afterEach(() => service.stopSync());
afterAll(() => db.close());

test('disabled cloud configuration never sends financial data', async () => {
  process.env.REACT_APP_CLOUD_SYNC_ENABLED = 'false';
  expect((await service.forceUpload()).success).toBe(false);
  expect(writes).toBe(0);
});

test('a new account automatically gets its first conditional cloud save and durable baseline', async () => {
  await service.startSync();
  expect(writes).toBe(1);
  expect((await db.syncMetadata.get('cloud:alice'))?.data).toEqual(local);
  expect(service.getStatus()).toMatchObject({ phase: 'saved', pendingChanges: 0 });
});

test('an empty fresh browser loads existing cloud data without uploading an empty copy', async () => {
  local = data([]);
  remote = version();
  await service.startSync();
  expect(writes).toBe(0);
  expect(local.transactions.map(row => row.id)).toEqual(['one']);
  expect(restore).toHaveBeenCalled();
  expect(service.getStatus().phase).toBe('saved');
});

test('unrelated existing copies require a one-time union preview, not upload or download replacement', async () => {
  local = data(['local']);
  remote = version(data(['cloud']));
  await service.startSync();
  expect(writes).toBe(0);
  expect(restore).not.toHaveBeenCalled();
  expect(service.getReview()).toMatchObject({ firstLink: true, conflicts: [] });
  expect((await service.resolveReview({})).success).toBe(true);
  expect(local.transactions.map(row => row.id).sort()).toEqual(['cloud', 'local']);
  expect(remote?.data.transactions).toEqual(local.transactions);
});

test('HTTP, network, malformed and missing-protocol responses never fall back to a write', async () => {
  for (const result of [response({}, 403), response({}, 200, ''), response({}), response({ current: { data: null }, account: 'alice' })]) {
    fetchMock.mockResolvedValueOnce(result);
    expect((await service.forceUpload()).success).toBe(false);
  }
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  expect((await service.forceUpload()).success).toBe(false);
  expect(service.getStatus().phase).toBe('offline');
  expect(fetchMock.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
});

test('unchanged content is acknowledged without another upload', async () => {
  await link();
  await service.forceUpload();
  expect(writes).toBe(1);
  expect(service.getStatus().phase).toBe('saved');
});

test('independent device edits merge and hydrate the local cache automatically', async () => {
  await link();
  local = data(['one', 'local']);
  remote = version(data(['one', 'cloud']), 'other-device');
  expect((await service.forceUpload()).success).toBe(true);
  expect(local.transactions.map(row => row.id).sort()).toEqual(['cloud', 'local', 'one']);
  expect(writes).toBe(2);
});

test('missing local records never overwrite an existing cloud copy without reviewed deletion', async () => {
  await link();
  local = data([]);
  await service.forceUpload();
  expect(writes).toBe(1);
  expect(service.getStatus().phase).toBe('attention');
  const review = service.getReview()!;
  expect(review.conflicts).toHaveLength(1);
  expect((await service.resolveReview({ [review.conflicts[0].key]: 'local' })).success).toBe(true);
  expect(remote?.data.transactions).toEqual([]);
  const body = JSON.parse(String(fetchMock.mock.calls.find(([, options]) => options?.method === 'PUT')?.[1]?.body));
  expect(body.allowRemoval).toBe(true);
  expect(await db.recoverySnapshots.count()).toBeGreaterThan(0);
});

test('review approval is invalidated by newer local edits', async () => {
  await link();
  local = data([]);
  await service.forceUpload();
  const review = service.getReview()!;
  local = data(['new-edit']);
  const result = await service.resolveReview({ [review.conflicts[0].key]: 'local' });
  expect(result.success).toBe(false);
  expect(result.message).toMatch(/changed during review/);
  expect(writes).toBe(1);
});

test('review approval is invalidated by a newer cloud revision', async () => {
  await link();
  local = data([]);
  await service.forceUpload();
  const review = service.getReview()!;
  remote = version(data(['one', 'cloud-new']), 'newer');
  expect((await service.resolveReview({ [review.conflicts[0].key]: 'local' })).message).toMatch(/changed during review/);
  expect(writes).toBe(1);
});

test('edits made during an upload stay queued and are saved on the next pass', async () => {
  await link();
  local = data(['one', 'local']);
  remote = version(data(['one', 'cloud']), 'remote');
  fetchMock.mockImplementation(async (url, options) => {
    const result = await server(url, options);
    if (options?.method === 'PUT') local = data(['one', 'local', 'newer-local']);
    return result;
  });
  await service.forceUpload();
  expect(service.getStatus().phase).toBe('pending');
  expect((await db.syncMetadata.get('apply-base:alice'))?.data?.transactions.map(row => row.id)).toEqual(['one', 'local']);
  fetchMock.mockImplementation(server);
  await service.forceUpload();
  expect(service.getReview()).toBeNull();
  expect(local.transactions.map(row => row.id).sort()).toEqual(['cloud', 'local', 'newer-local', 'one']);
});

test('a stale conditional write never acknowledges the rejected revision', async () => {
  await link();
  local = data(['one', 'two']);
  const original = remote?.revision;
  fetchMock.mockImplementation(async (url, options) => options?.method === 'PUT' ? response({ error: 'conflict' }, 409) : server(url, options));
  expect((await service.forceUpload()).success).toBe(false);
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe(original);
  expect(writes).toBe(1);
});

test('another account cannot upload or download over the previous account local cache', async () => {
  await link();
  account = 'bob';
  remote = null;
  expect((await service.forceUpload()).message).toMatch(/another cloud account/);
  expect((await service.forceDownload()).message).toMatch(/another cloud account/);
  expect(writes).toBe(1);
  expect(restore).not.toHaveBeenCalled();
});

test('interrupted cloud loss blocks recreation over a previously linked baseline', async () => {
  await link();
  remote = null;
  expect((await service.forceUpload()).message).toMatch(/unexpectedly missing/);
  expect(writes).toBe(1);
});

test('imports do not publish partial datasets', async () => {
  service.setImportInProgress(true);
  await service.forceUpload();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(service.getStatus().phase).toBe('pending');
});

test('restoring an older version retains the current baseline and requires reload before saving', async () => {
  await link();
  expect((await service.forceDownload()).success).toBe(true);
  expect((await service.forceUpload()).message).toMatch(/Reload/);
  expect((await db.syncMetadata.get('cloud:alice'))?.revision).toBe(remote?.revision);
});

test('offline changes survive a service restart and reconcile against the persisted baseline', async () => {
  await link();
  local = data(['one', 'offline']);
  fetchMock.mockRejectedValueOnce(new TypeError('offline'));
  await service.forceUpload();
  service.stopSync();
  service = new AzureBlobService();
  remote = version(data(['one', 'other-device']), 'remote');
  await service.startSync();
  expect(local.transactions.map(row => row.id).sort()).toEqual(['offline', 'one', 'other-device']);
  expect(service.getStatus().phase).toBe('saved');
});

test('local save events automatically send queued changes without a toggle', async () => {
  await service.startSync();
  local = data(['one', 'new']);
  notifyLocalChange();
  expect(service.getStatus().phase).toBe('pending');
  await waitFor(() => expect(writes).toBe(2), { timeout: 4500 });
});

test('incoming updates wait for editable screens rather than discarding form drafts', async () => {
  await link();
  const { unmount } = render(React.createElement('input', { defaultValue: 'Unsaved draft' }));
  remote = version(data(['one', 'remote']), 'new-remote');
  await service.forceUpload();
  expect(local.transactions.map(row => row.id)).toEqual(['one']);
  expect(service.getStatus().phase).toBe('pending');
  unmount();
  await service.forceUpload();
  expect(local.transactions.map(row => row.id)).toEqual(['one', 'remote']);
  expect(service.getStatus().phase).toBe('saved');
});

test('leaving with unsynced edits warns, while a server-confirmed save permits navigation', async () => {
  await service.startSync();
  local = data(['one', 'pending']);
  notifyLocalChange();
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(false);
  await service.forceUpload();
  expect(service.getStatus().phase).toBe('saved');
  expect(window.dispatchEvent(new Event('beforeunload', { cancelable: true }))).toBe(true);
});
