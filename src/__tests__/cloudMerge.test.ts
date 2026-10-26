import { CloudSnapshot, SnapshotRow } from '../utils/cloudSnapshot';
import { countSnapshotChanges, mergeCloudSnapshots } from '../utils/cloudMerge';

function row(id: string, updates: Record<string, unknown> = {}): SnapshotRow {
  return { id, date: '2026-01-01', amount: -25, description: id, category: 'Food', account: 'Checking', type: 'expense', ...updates };
}
function snapshot(transactions: SnapshotRow[] = [row('one')]): CloudSnapshot {
  return {
    schemaVersion: 1, transactions, transactionHistory: [], preferences: [],
    storage: { 'mo-money-accounts': null, 'mo-money-categories': null, 'mo-money-category-rules': null, 'mo-money-budgets': null, 'mo-money-templates': null }
  };
}

test('merges additions from both devices without duplicates', () => {
  const result = mergeCloudSnapshots(snapshot(), snapshot([row('one'), row('local')]), snapshot([row('one'), row('cloud')]));
  expect(result.conflicts).toEqual([]);
  expect(result.data.transactions.map(t => t.id).sort()).toEqual(['cloud', 'local', 'one']);
});

test('merges independent field edits without using modification timestamps as winners', () => {
  const local = snapshot([row('one', { category: 'Travel', lastModifiedDate: '2099-01-01' })]);
  const cloud = snapshot([row('one', { notes: 'remote', lastModifiedDate: '2000-01-01' })]);
  const result = mergeCloudSnapshots(snapshot(), local, cloud);
  expect(result.conflicts).toEqual([]);
  expect(result.data.transactions[0]).toMatchObject({ category: 'Travel', notes: 'remote' });
});

test('preserves both versions of a conflicting field until explicitly chosen', () => {
  const local = snapshot([row('one', { amount: -10 })]);
  const cloud = snapshot([row('one', { amount: -20 })]);
  const result = mergeCloudSnapshots(snapshot(), local, cloud);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0]).toMatchObject({ field: 'amount', local: -10, cloud: -20 });
  const resolved = mergeCloudSnapshots(snapshot(), local, cloud, { [result.conflicts[0].key]: 'cloud' });
  expect(resolved.conflicts).toEqual([]);
  expect(resolved.data.transactions[0].amount).toBe(-20);
});

test('missing local data never automatically deletes an existing cloud transaction', () => {
  const result = mergeCloudSnapshots(snapshot(), snapshot([]), snapshot());
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].reason).toMatch(/Missing locally/);
  const keep = mergeCloudSnapshots(snapshot(), snapshot([]), snapshot(), { [result.conflicts[0].key]: 'cloud' });
  expect(keep.data.transactions).toHaveLength(1);
});

test('approved local deletion removes only the reviewed record', () => {
  const local = snapshot([]);
  const cloud = snapshot([row('one'), row('new-remote')]);
  const result = mergeCloudSnapshots(snapshot(), local, cloud);
  const resolved = mergeCloudSnapshots(snapshot(), local, cloud, { [result.conflicts[0].key]: 'local' });
  expect(resolved.conflicts).toEqual([]);
  expect(resolved.data.transactions.map(t => t.id)).toEqual(['new-remote']);
});

test('remote deletion applies to unchanged local data but conflicts with a local edit', () => {
  expect(mergeCloudSnapshots(snapshot(), snapshot(), snapshot([])).data.transactions).toEqual([]);
  const result = mergeCloudSnapshots(snapshot(), snapshot([row('one', { notes: 'unsaved edit' })]), snapshot([]));
  expect(result.conflicts[0].reason).toMatch(/Deleted in the cloud/);
});

test('unrelated copies never infer which record version is newer', () => {
  const result = mergeCloudSnapshots(undefined, snapshot([row('one', { amount: -10 })]), snapshot([row('one', { amount: -20 })]));
  expect(result.conflicts[0]).toMatchObject({ field: 'record' });
});

test('merges every persisted collection, including accounts and nested rule actions', () => {
  const base = snapshot();
  base.storage['mo-money-category-rules'] = JSON.stringify([{ id: 'rule', name: 'Rule', priority: 1, isActive: true, conditions: [], action: { categoryId: 'food' } }]);
  const local = JSON.parse(JSON.stringify(base)) as CloudSnapshot;
  const cloud = JSON.parse(JSON.stringify(base)) as CloudSnapshot;
  const localRules = JSON.parse(local.storage['mo-money-category-rules']!);
  localRules[0].priority = 10;
  local.storage['mo-money-category-rules'] = JSON.stringify(localRules);
  const cloudRules = JSON.parse(cloud.storage['mo-money-category-rules']!);
  cloudRules[0].action.subcategoryId = 'groceries';
  cloud.storage['mo-money-category-rules'] = JSON.stringify(cloudRules);
  const result = mergeCloudSnapshots(base, local, cloud);
  expect(result.conflicts).toEqual([]);
  expect(JSON.parse(result.data.storage['mo-money-category-rules']!)[0]).toMatchObject({ priority: 10, action: { categoryId: 'food', subcategoryId: 'groceries' } });
});

test('conflicting transfer matches are resolved together, never as mixed half-pairs', () => {
  const tx = (id: string, peer?: string) => row(id, { type: 'transfer', ...(peer ? { transferId: peer, reimbursementId: peer } : {}) });
  const base = snapshot([tx('a'), tx('b'), tx('c')]);
  const local = snapshot([tx('a', 'b'), tx('b', 'a'), tx('c')]);
  const cloud = snapshot([tx('a', 'c'), tx('b'), tx('c', 'a')]);
  const result = mergeCloudSnapshots(base, local, cloud);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].field).toBe('transfer match');
  const resolved = mergeCloudSnapshots(base, local, cloud, { [result.conflicts[0].key]: 'cloud' });
  expect(resolved.conflicts).toEqual([]);
  expect(resolved.data.transactions).toEqual(cloud.transactions);
});

test('remote transfer deletion conflicts with local edits to the pair', () => {
  const a = row('a', { type: 'transfer', reimbursementId: 'b', transferId: 'b' });
  const b = row('b', { type: 'transfer', reimbursementId: 'a', transferId: 'a' });
  const base = snapshot([a, b]);
  const local = snapshot([{ ...a, notes: 'keep this edit' }, b]);
  const cloud = snapshot([]);
  const result = mergeCloudSnapshots(base, local, cloud);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].field).toBe('transfer match');
  const resolved = mergeCloudSnapshots(base, local, cloud, { [result.conflicts[0].key]: 'local' });
  expect(resolved.data.transactions).toEqual(local.transactions);
});

test('keeping a deleted transfer counterpart restores the whole pair, not an orphaned half-match', () => {
  const a = row('a', { type: 'transfer', reimbursementId: 'b', transferId: 'b' });
  const b = row('b', { type: 'transfer', reimbursementId: 'a', transferId: 'a' });
  const base = snapshot([a, b]);
  const local = snapshot([row('a', { type: 'transfer' })]);
  const result = mergeCloudSnapshots(base, local, base);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0].field).toBe('transfer match');
  const restored = mergeCloudSnapshots(base, local, base, { [result.conflicts[0].key]: 'cloud' });
  expect(restored.data.transactions).toEqual(base.transactions);
  const deleted = mergeCloudSnapshots(base, local, base, { [result.conflicts[0].key]: 'local' });
  expect(deleted.data.transactions).toEqual(local.transactions);
});

test('account renames also update new transactions arriving from another device', () => {
  const base = snapshot([]);
  const account = { id: 'checking', name: 'Checking', type: 'checking', currency: 'USD', isActive: true, institution: 'Test' };
  base.storage['mo-money-accounts'] = JSON.stringify([account]);
  const local = { ...base, storage: { ...base.storage, 'mo-money-accounts': JSON.stringify([{ ...account, name: 'Renamed' }]) } };
  const cloud = { ...base, transactions: [row('new-remote')] };
  const result = mergeCloudSnapshots(base, local, cloud);
  expect(result.conflicts).toEqual([]);
  expect(result.data.transactions[0].account).toBe('Renamed');
  expect(cloud.transactions[0].account).toBe('Checking');
});

test('an account deletion cannot strand transactions added on another device', () => {
  const base = snapshot([]);
  const account = { id: 'checking', name: 'Checking', type: 'checking', currency: 'USD', isActive: true, institution: 'Test' };
  base.storage['mo-money-accounts'] = JSON.stringify([account]);
  const local = { ...base, transactions: [row('new-local')] };
  const cloud = { ...base, storage: { ...base.storage, 'mo-money-accounts': '[]' } };
  const result = mergeCloudSnapshots(base, local, cloud);
  expect(result.conflicts).toHaveLength(1);
  expect(result.conflicts[0]).toMatchObject({ allowLocal: true, allowCloud: false });
  const deleted = mergeCloudSnapshots(base, local, cloud, { [result.conflicts[0].key]: 'cloud' });
  expect(deleted.conflicts).toHaveLength(1);
  const kept = mergeCloudSnapshots(base, local, cloud, { [result.conflicts[0].key]: 'local' });
  expect(kept.conflicts).toEqual([]);
  expect(JSON.parse(kept.data.storage['mo-money-accounts']!)).toEqual([account]);
});

test('counts changed records rather than array ordering or object key order', () => {
  expect(countSnapshotChanges(snapshot([row('a'), row('b')]), snapshot([row('b'), row('a')]))).toBe(0);
  expect(countSnapshotChanges(snapshot(), snapshot([row('one', { amount: -50 }), row('new')]))).toBe(2);
});
