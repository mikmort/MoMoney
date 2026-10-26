import { CloudSnapshot, SnapshotRow, isRecord, snapshotContent, snapshotStorageKeys, validateSnapshot } from './cloudSnapshot';

export type ConflictChoice = 'local' | 'cloud';
export interface SyncConflict {
  key: string;
  collection: string;
  recordId: string;
  field: string;
  reason: string;
  local: unknown;
  cloud: unknown;
  allowLocal?: boolean;
  allowCloud?: boolean;
}
export interface MergeResult {
  data: CloudSnapshot;
  conflicts: SyncConflict[];
}

const transportFields = new Set(['lastModifiedDate', 'lastModified', 'addedDate', 'createdDate']);
const same = (left: unknown, right: unknown): boolean => snapshotContent(left) === snapshotContent(right);

export function countSnapshotChanges(before: CloudSnapshot, after: CloudSnapshot): number {
  let count = 0;
  const collections: Array<[SnapshotRow[], SnapshotRow[]]> = [
    [before.transactions, after.transactions], [before.transactionHistory, after.transactionHistory], [before.preferences, after.preferences]
  ];
  for (const key of snapshotStorageKeys) collections.push([JSON.parse(before.storage[key] || '[]'), JSON.parse(after.storage[key] || '[]')]);
  for (const [oldRows, newRows] of collections) {
    const previous = new Map(oldRows.map(row => [row.id, row]));
    const next = new Map(newRows.map(row => [row.id, row]));
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      if (!same(previous.get(id), next.get(id))) count++;
    }
  }
  return count;
}

/**
 * Absence on this device is never an implicit deletion. Local removals need a
 * reviewed choice; remote removals already passed the server's deletion guard.
 */
export function mergeCloudSnapshots(
  base: CloudSnapshot | undefined,
  local: CloudSnapshot,
  cloud: CloudSnapshot,
  choices: Record<string, ConflictChoice> = {}
): MergeResult {
  validateSnapshot(local);
  validateSnapshot(cloud);
  if (base) validateSnapshot(base);
  const conflicts: SyncConflict[] = [];

  const conflict = (collection: string, recordId: string, field: string, left: unknown, right: unknown, reason: string): unknown => {
    const key = JSON.stringify([collection, recordId, field]);
    if (!choices[key]) conflicts.push({ key, collection, recordId, field, local: left, cloud: right, reason });
    return choices[key] === 'cloud' ? right : left;
  };

  const mergeValue = (previous: unknown, left: unknown, right: unknown, collection: string, id: string, field: string): unknown => {
    if (same(left, right)) return left;
    if (same(left, previous)) return right;
    if (same(right, previous)) return left;
    if (isRecord(previous) && isRecord(left) && isRecord(right)) {
      return Object.fromEntries([...new Set([...Object.keys(previous), ...Object.keys(left), ...Object.keys(right)])]
        .map(key => [key, transportFields.has(key)
          ? right[key] ?? left[key]
          : mergeValue(previous[key], left[key], right[key], collection, id, field ? `${field}.${key}` : key)])
        .filter(([, value]) => value !== undefined));
    }
    return conflict(collection, id, field || 'record', left, right, 'Both copies changed this value.');
  };

  const mergeRows = (collection: string, previous: SnapshotRow[], left: SnapshotRow[], right: SnapshotRow[]): SnapshotRow[] => {
    const b = new Map(previous.map(row => [row.id, row]));
    const l = new Map(left.map(row => [row.id, row]));
    const r = new Map(right.map(row => [row.id, row]));
    const result = new Map<string, SnapshotRow>();
    for (const id of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
      const before = b.get(id);
      const localRow = l.get(id);
      const cloudRow = r.get(id);
      let row: unknown;
      if (!localRow && cloudRow && before) {
        row = conflict(collection, id, 'record', undefined, cloudRow, 'Missing locally. Delete only if this removal was intentional.');
      } else if (!cloudRow && localRow && before && !same(localRow, before)) {
        row = conflict(collection, id, 'record', localRow, undefined, 'Deleted in the cloud but edited on this device.');
      } else if (!localRow || !cloudRow) {
        row = before ? undefined : localRow ?? cloudRow;
      } else {
        row = mergeValue(before, localRow, cloudRow, collection, id, '');
      }
      if (isRecord(row) && typeof row.id === 'string') result.set(id, { ...row, id: row.id });
    }

    if (collection === 'transactions') {
      // A transfer match is a multi-record edit. Never combine half of one
      // device's match with half of another device's match.
      const edges = new Map<string, Set<string>>();
      for (const row of [...previous, ...left, ...right]) {
        if (row.type !== 'transfer') continue;
        for (const peer of [row.transferId, row.reimbursementId]) {
          if (typeof peer !== 'string') continue;
          if (!edges.has(row.id)) edges.set(row.id, new Set());
          if (!edges.has(peer)) edges.set(peer, new Set());
          edges.get(row.id)!.add(peer);
          edges.get(peer)!.add(row.id);
        }
      }
      const visited = new Set<string>();
      for (const start of edges.keys()) {
        if (visited.has(start)) continue;
        const ids: string[] = [];
        const pending = [start];
        while (pending.length) {
          const id = pending.pop()!;
          if (visited.has(id)) continue;
          visited.add(id);
          ids.push(id);
          pending.push(...edges.get(id) || []);
        }
        ids.sort();
        if (ids.length < 2) continue;
        const rows = (map: Map<string, SnapshotRow>) => ids.flatMap(id => map.has(id) ? [map.get(id)!] : []);
        const links = (map: Map<string, SnapshotRow>) => rows(map).map(row => ({
          id: row.id, transferId: row.transferId, reimbursementId: row.reimbursementId, type: row.type
        }));
        const localLinks = links(l);
        const cloudLinks = links(r);
        const localRemoval = rows(b).some(row => !l.has(row.id));
        if (same(localLinks, cloudLinks) || (!localRemoval &&
            (same(rows(l), rows(b)) || same(rows(r), rows(b))))) continue;
        const group = conflict(collection, ids.join(', '), 'transfer match', rows(l), rows(r), 'Conflicting transfer links. Keep the entire match together.');
        for (const id of ids) result.delete(id);
        if (Array.isArray(group)) {
          for (const row of group) if (isRecord(row) && typeof row.id === 'string') result.set(row.id, { ...row, id: row.id });
        }
        const groupIds = new Set(ids);
        for (let i = conflicts.length - 1; i >= 0; i--) {
          if (conflicts[i].collection === collection && groupIds.has(conflicts[i].recordId)) conflicts.splice(i, 1);
        }
      }
    }
    return [...result.values()];
  };

  const data: CloudSnapshot = {
    schemaVersion: 1,
    transactions: mergeRows('transactions', base?.transactions || [], local.transactions, cloud.transactions),
    transactionHistory: mergeRows('transactionHistory', base?.transactionHistory || [], local.transactionHistory, cloud.transactionHistory),
    preferences: mergeRows('preferences', base?.preferences || [], local.preferences, cloud.preferences),
    storage: { ...local.storage }
  };
  for (const key of snapshotStorageKeys) {
    const rows = mergeRows(key, JSON.parse(base?.storage[key] || '[]'), JSON.parse(local.storage[key] || '[]'), JSON.parse(cloud.storage[key] || '[]'));
    data.storage[key] = rows.length || local.storage[key] !== null || cloud.storage[key] !== null ? JSON.stringify(rows) : null;
  }
  const accountKey = 'mo-money-accounts';
  const localAccounts: SnapshotRow[] = JSON.parse(local.storage[accountKey] || '[]');
  const cloudAccounts: SnapshotRow[] = JSON.parse(cloud.storage[accountKey] || '[]');
  const sourceAccounts: SnapshotRow[] = [...JSON.parse(base?.storage[accountKey] || '[]'), ...localAccounts, ...cloudAccounts];
  const accounts = new Map<string, SnapshotRow>(
    (JSON.parse(data.storage[accountKey] || '[]') as SnapshotRow[]).map(account => [account.id, account])
  );
  data.transactions = data.transactions.map(row => {
    const byId = sourceAccounts.filter(account => account.id === row.account);
    const candidates = byId.length ? byId : sourceAccounts.filter(account => account.name === row.account);
    const ids = new Set(candidates.map(account => account.id));
    if (ids.size !== 1) return row;
    const id = candidates[0].id;
    if (!accounts.has(id)) {
      const left = localAccounts.find(account => account.id === id);
      const right = cloudAccounts.find(account => account.id === id);
      const key = JSON.stringify([accountKey, id, 'record']);
      const selected = choices[key] === 'local' ? left : choices[key] === 'cloud' ? right : undefined;
      if (!selected) {
        const existing = conflicts.findIndex(item => item.key === key);
        if (existing !== -1) conflicts.splice(existing, 1);
        conflicts.push({
          key, collection: accountKey, recordId: id, field: 'record', local: left, cloud: right,
          allowLocal: !!left, allowCloud: !!right,
          reason: 'Transactions still reference this account. Keep the account to preserve their links.'
        });
      }
      const account = selected || left || right;
      if (account) accounts.set(id, account);
    }
    const account = accounts.get(id);
    return account && row.account !== id && account.name !== row.account ? { ...row, account: account.name } : row;
  });
  if (sourceAccounts.length) data.storage[accountKey] = JSON.stringify([...accounts.values()]);
  // Conflict placeholders may temporarily reference a deleted account; wire
  // validation still guarantees that only structurally valid data can be saved.
  validateSnapshot(data);
  return { data, conflicts };
}
