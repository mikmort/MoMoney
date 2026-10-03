import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BlobRepository, SnapshotStore, StorageError, StoredBlob } from '../src/snapshotStore';
import { CloudSnapshot, decodeLegacySnapshot, removedRecords, snapshotContent, validateSnapshot } from '../../src/utils/cloudSnapshot';

function data(ids = ['one', 'two']): CloudSnapshot {
  return {
    schemaVersion: 1,
    transactions: ids.map(id => ({ id, description: id, date: '2026-01-01', amount: -1, type: 'expense', category: 'Food', account: 'Checking' })),
    transactionHistory: [], preferences: [],
    storage: { 'mo-money-accounts': null, 'mo-money-categories': null, 'mo-money-category-rules': null, 'mo-money-budgets': null, 'mo-money-templates': null }
  };
}

class MemoryBlobs implements BlobRepository {
  rows = new Map<string, StoredBlob>();
  failCreate = false;
  failHead = false;
  async read(name: string) { return this.rows.get(name) ?? null; }
  async create(name: string, text: string) {
    if (this.failCreate) throw new Error('storage failed');
    assert(!this.rows.has(name), 'versions cannot be overwritten');
    this.rows.set(name, { text, etag: '1' });
  }
  async writeHead(name: string, text: string, etag: string | null) {
    if (this.failHead) throw new Error('head failed');
    const old = this.rows.get(name);
    if ((old?.etag ?? null) !== etag) throw new StorageError(409, 'conflict');
    this.rows.set(name, { text, etag: String(Number(old?.etag ?? 0) + 1) });
  }
}

test('an empty buggy client cannot erase the current cloud save', async () => {
  const store = new SnapshotStore(new MemoryBlobs(), 'alice');
  const first = await store.save(data(), null, false);
  await assert.rejects(store.save(data([]), first.revision, false), { status: 422 });
  assert.equal((await store.current()).version?.revision, first.revision);
  assert.equal((await store.version(first.revision)).data.transactions.length, 2);
});

test('confirming deletions retains the populated recovery version', async () => {
  const store = new SnapshotStore(new MemoryBlobs(), 'alice');
  const first = await store.save(data(), null, false);
  const second = await store.save(data([]), first.revision, true);
  assert.equal(second.parent, first.revision);
  assert.equal((await store.version(first.revision)).data.transactions.length, 2);
  assert.equal((await store.history()).versions.length, 2);
});

test('concurrent saves accept exactly one head update and preserve previous versions', async () => {
  const blobs = new MemoryBlobs();
  const a = new SnapshotStore(blobs, 'alice');
  const b = new SnapshotStore(blobs, 'alice');
  const first = await a.save(data(), null, false);
  const result = await Promise.allSettled([
    a.save(data(['one', 'two', 'a']), first.revision, false),
    b.save(data(['one', 'two', 'b']), first.revision, false)
  ]);
  assert.equal(result.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await a.version(first.revision)).data.transactions.length, 2);
  assert.equal((await a.history()).versions.length, 2);
});

test('stale clients cannot bypass concurrency by confirming deletions', async () => {
  const store = new SnapshotStore(new MemoryBlobs(), 'alice');
  const first = await store.save(data(), null, false);
  await store.save(data(['one', 'two', 'three']), first.revision, false);
  await assert.rejects(store.save(data([]), first.revision, true), { status: 409 });
  await assert.rejects(store.save(data([]), null, true), { status: 409 });
});

test('failed version creation or head commit leaves the current save intact', async () => {
  const blobs = new MemoryBlobs();
  const store = new SnapshotStore(blobs, 'alice');
  const first = await store.save(data(), null, false);
  blobs.failCreate = true;
  await assert.rejects(store.save(data(), first.revision, false));
  blobs.failCreate = false;
  blobs.failHead = true;
  await assert.rejects(store.save(data(), first.revision, false));
  assert.equal((await store.current()).version?.revision, first.revision);
  assert.equal((await store.history()).versions.length, 1);
});

test('user namespaces isolate reads and writes', async () => {
  const blobs = new MemoryBlobs();
  const a = new SnapshotStore(blobs, 'alice');
  const b = new SnapshotStore(blobs, 'bob');
  const version = await a.save(data(), null, false);
  assert.equal((await b.current()).version, null);
  await assert.rejects(b.version(version.revision), { status: 404 });
});

test('history can page through more than 25 retained versions', async () => {
  const store = new SnapshotStore(new MemoryBlobs(), 'alice');
  let revision: string | null = null;
  for (let i = 0; i < 27; i++) revision = (await store.save(data(), revision, false)).revision;
  const page = await store.history();
  assert.equal(page.versions.length, 25);
  assert(page.next);
  assert.equal((await store.history(page.next)).versions.length, 2);
});

test('malformed snapshots fail before any persistent write', async () => {
  const blobs = new MemoryBlobs();
  const store = new SnapshotStore(blobs, 'alice');
  const bad = data();
  bad.transactions[0].date = 'not-a-date';
  await assert.rejects(store.save(bad, null, false));
  assert.equal(blobs.rows.size, 0);
  assert.throws(() => validateSnapshot({ ...data(), transactions: null }));
  assert.throws(() => validateSnapshot(data(['same', 'same'])));
});

test('canonical comparisons ignore order; replaced IDs still count as deletions', () => {
  assert.equal(snapshotContent(data()), snapshotContent(data(['two', 'one'])));
  assert.equal(removedRecords(data(), data(['one', 'replacement'])), 1);
});

test('legacy string fields and proxy envelopes are decoded without silent empty defaults', () => {
  const legacy = { transactions: JSON.stringify(data().transactions), accounts: '[]', categories: '[]', rules: '[]', budgets: '[]' };
  assert.equal(decodeLegacySnapshot({ success: true, data: { content: JSON.stringify(legacy) } }).transactions.length, 2);
  assert.throws(() => decodeLegacySnapshot({ ...legacy, transactions: null }));
  assert.throws(() => decodeLegacySnapshot({ success: true, data: {} }));
});
