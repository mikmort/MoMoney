import { db } from '../services/db';
import { captureSnapshot, recoverInterruptedRestore, restoreSnapshot } from '../services/cloudSnapshotService';
import { CloudSnapshot, snapshotContent } from '../utils/cloudSnapshot';

function snapshot(id: string): CloudSnapshot {
  return {
    schemaVersion: 1,
    transactions: [{ id, date: '2026-01-01', amount: -12.34, description: id, category: 'Food', account: 'Checking', type: 'expense' }],
    transactionHistory: [], preferences: [],
    storage: {
      'mo-money-accounts': JSON.stringify([{ id: `account-${id}`, name: id, isActive: false, type: 'checking', currency: 'USD', institution: 'Test' }]),
      'mo-money-categories': '[]', 'mo-money-category-rules': '[]', 'mo-money-budgets': '[]', 'mo-money-templates': '[]'
    }
  };
}

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map(table => table.clear()));
  localStorage.clear();
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => db.close());

test('round trips persisted data, including inactive accounts, with a pre-restore snapshot', async () => {
  const data = snapshot('old');
  await restoreSnapshot(data);
  expect(snapshotContent(await captureSnapshot())).toBe(snapshotContent(data));
  await restoreSnapshot(snapshot('new'));
  const backups = await db.recoverySnapshots.toArray();
  expect(backups.some(backup => backup.data.transactions[0]?.id === 'old')).toBe(true);
  expect((await db.transactions.get('new'))?.amount).toBe(-12.34);
  expect(await db.syncMetadata.get('pending-restore')).toBeUndefined();
});

test('invalid data never clears the previous database', async () => {
  await restoreSnapshot(snapshot('old'));
  const invalid = snapshot('new');
  invalid.transactions[0].amount = 'invalid';
  await expect(restoreSnapshot(invalid)).rejects.toThrow();
  expect((await db.transactions.toArray()).map(row => row.id)).toEqual(['old']);
});

test('a failed localStorage write rolls back IndexedDB and restores all local storage', async () => {
  await restoreSnapshot(snapshot('old'));
  const before = await captureSnapshot();
  const original = Storage.prototype.setItem;
  let failed = false;
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (!failed && key === 'mo-money-category-rules') { failed = true; throw new Error('quota'); }
    original.call(this, key, value);
  });
  await expect(restoreSnapshot(snapshot('new'))).rejects.toThrow('quota');
  expect(snapshotContent(await captureSnapshot())).toBe(snapshotContent(before));
});

test('an interrupted restore blocks upload and can recover the durable previous snapshot', async () => {
  await restoreSnapshot(snapshot('old'));
  const before = await captureSnapshot();
  await db.recoverySnapshots.add({ id: 'recovery', createdAt: new Date().toISOString(), data: before });
  await db.syncMetadata.put({ id: 'pending-restore', recoveryId: 'recovery' });
  await db.transactions.clear();
  localStorage.setItem('mo-money-accounts', '[]');
  await expect(captureSnapshot()).rejects.toThrow('interrupted restore');
  expect(await recoverInterruptedRestore()).toBe(true);
  expect(snapshotContent(await captureSnapshot())).toBe(snapshotContent(before));
});

test('corrupt local storage fails export instead of exporting an empty array', async () => {
  localStorage.setItem('mo-money-accounts', 'broken json');
  await expect(captureSnapshot()).rejects.toThrow();
});
