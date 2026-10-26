import { v4 as uuid } from 'uuid';
import { db } from './db';
import { CloudSnapshot, isRecord, snapshotContent, snapshotStorageKeys, validateSnapshot } from '../utils/cloudSnapshot';

class SnapshotChangedError extends Error {}

export async function captureSnapshot(): Promise<CloudSnapshot> {
  if (await db.syncMetadata.get('pending-restore')) {
    throw new Error('An interrupted restore needs recovery. Open Settings and recover the saved local snapshot before syncing.');
  }
  const data: unknown = await db.transaction('r', db.transactions, db.transactionHistory, db.userPreferences, async () => ({
    schemaVersion: 1,
    transactions: await db.transactions.toArray(),
    transactionHistory: await db.transactionHistory.toArray(),
    preferences: await db.userPreferences.toArray(),
    storage: Object.fromEntries(snapshotStorageKeys.map(key => [key, localStorage.getItem(key)]))
  }));
  // Use the same wire representation for validation, comparison, and restoration.
  const serialized: unknown = JSON.parse(JSON.stringify(data));
  validateSnapshot(serialized);
  if (await db.syncMetadata.get('pending-restore')) throw new Error('A restore started while reading local data. Saving is blocked.');
  return serialized;
}

function datedTransaction(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    date: new Date(String(row.date)),
    ...(row.addedDate ? { addedDate: new Date(String(row.addedDate)) } : {}),
    ...(row.lastModifiedDate ? { lastModifiedDate: new Date(String(row.lastModifiedDate)) } : {})
  };
}

async function applySnapshot(data: CloudSnapshot, expected?: CloudSnapshot): Promise<void> {
  validateSnapshot(data);
  await db.transaction('rw', db.transactions, db.transactionHistory, db.userPreferences, async () => {
    if (expected) {
      const actual = JSON.parse(JSON.stringify({
        schemaVersion: 1,
        transactions: await db.transactions.toArray(),
        transactionHistory: await db.transactionHistory.toArray(),
        preferences: await db.userPreferences.toArray(),
        storage: Object.fromEntries(snapshotStorageKeys.map(key => [key, localStorage.getItem(key)]))
      }));
      if (snapshotContent(actual) !== snapshotContent(expected)) throw new SnapshotChangedError('Local data changed during reconciliation. Retrying will preserve the new edits.');
    }
    await db.transactions.clear();
    await db.transactionHistory.clear();
    await db.userPreferences.clear();
    await db.table<Record<string, unknown>, string>('transactions').bulkAdd(data.transactions.map(datedTransaction));
    await db.table<Record<string, unknown>, string>('transactionHistory').bulkAdd(data.transactionHistory.map(row => {
      if (!isRecord(row.data)) throw new Error('Invalid history data.');
      return { ...row, data: datedTransaction(row.data) };
    }));
    await db.table<Record<string, unknown>, string>('userPreferences').bulkAdd(data.preferences.map(row => ({
      ...row, ...(row.lastModified ? { lastModified: new Date(String(row.lastModified)) } : {})
    })));
    for (const key of snapshotStorageKeys) {
      const value = data.storage[key];
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
  });
}

export async function restoreSnapshot(data: CloudSnapshot, expected?: CloudSnapshot): Promise<void> {
  validateSnapshot(data);
  const before = await captureSnapshot();
  if (expected && snapshotContent(before) !== snapshotContent(expected)) {
    throw new Error('Local data changed during reconciliation. Review the latest changes before applying.');
  }
  const id = uuid();
  // Keep this journal until BOTH storage systems commit. A crash cannot masquerade as an empty client.
  await db.transaction('rw', db.recoverySnapshots, db.syncMetadata, async () => {
    if (await db.syncMetadata.get('pending-restore')) throw new Error('Another restore is in progress.');
    await db.recoverySnapshots.add({ id, createdAt: new Date().toISOString(), data: before });
    await db.syncMetadata.put({ id: 'pending-restore', recoveryId: id });
  });
  try {
    await applySnapshot(data, before);
    await db.syncMetadata.delete('pending-restore');
  } catch (error) {
    if (error instanceof SnapshotChangedError) {
      await db.syncMetadata.delete('pending-restore');
      throw error;
    }
    try {
      await applySnapshot(before);
      await db.syncMetadata.delete('pending-restore');
    } catch (rollbackError) {
      console.error('[Cloud] Restore rollback requires recovery', rollbackError);
    }
    throw error;
  }
}

export async function recoverInterruptedRestore(): Promise<boolean> {
  const pending = await db.syncMetadata.get('pending-restore');
  if (!pending) return false;
  const snapshot = pending.recoveryId ? await db.recoverySnapshots.get(pending.recoveryId) : undefined;
  if (!snapshot) throw new Error('Restore recovery snapshot is missing. Cloud saves remain blocked.');
  await applySnapshot(snapshot.data);
  await db.syncMetadata.delete('pending-restore');
  return true;
}
