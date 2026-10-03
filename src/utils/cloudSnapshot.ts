export const snapshotStorageKeys = [
  'mo-money-accounts', 'mo-money-categories', 'mo-money-category-rules', 'mo-money-budgets', 'mo-money-templates'
] as const;

export interface SnapshotRow {
  id: string;
  [key: string]: unknown;
}

export interface CloudSnapshot {
  schemaVersion: 1;
  transactions: SnapshotRow[];
  transactionHistory: SnapshotRow[];
  preferences: SnapshotRow[];
  storage: Record<typeof snapshotStorageKeys[number], string | null>;
}

export interface CloudVersion {
  revision: string;
  parent: string | null;
  createdAt: string;
  data: CloudSnapshot;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateRows(value: unknown, name: string): asserts value is SnapshotRow[] {
  if (!Array.isArray(value)) throw new Error(`${name} must be an array, not missing or null.`);
  const ids = new Set<string>();
  for (const row of value) {
    if (!isRecord(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
      throw new Error(`${name} contains a missing or duplicate ID.`);
    }
    ids.add(row.id);
  }
}

function validateTransaction(row: Record<string, unknown>): void {
  if (typeof row.amount !== 'number' || !Number.isFinite(row.amount) ||
      typeof row.description !== 'string' || typeof row.category !== 'string' ||
      typeof row.account !== 'string' ||
      !['income', 'expense', 'transfer', 'asset-allocation'].includes(String(row.type))) {
    throw new Error('Invalid transaction fields. No data was replaced.');
  }
  for (const key of ['date', 'addedDate', 'lastModifiedDate']) {
    if (key !== 'date' && row[key] === undefined) continue;
    if (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(String(row[key])))) {
      throw new Error(`Invalid transaction ${key}. No data was replaced.`);
    }
  }
}

function validateStorageRows(key: string, rows: SnapshotRow[]): void {
  for (const row of rows) {
    if (typeof row.name !== 'string') throw new Error(`Invalid name in ${key}.`);
    if (key === 'mo-money-accounts' && (
      typeof row.currency !== 'string' || typeof row.institution !== 'string' ||
      typeof row.isActive !== 'boolean' || !['checking', 'savings', 'credit', 'investment', 'cash'].includes(String(row.type))
    )) throw new Error('Invalid account data.');
    if (key === 'mo-money-categories') {
      validateRows(row.subcategories, 'Subcategories');
      if (!['income', 'expense', 'transfer', 'asset-allocation'].includes(String(row.type))) throw new Error('Invalid category type.');
    }
    if (key === 'mo-money-category-rules' && (
      !Array.isArray(row.conditions) || !isRecord(row.action) || typeof row.action.categoryId !== 'string' ||
      typeof row.priority !== 'number' || typeof row.isActive !== 'boolean'
    )) throw new Error('Invalid rule data.');
    if (key === 'mo-money-budgets' && (
      typeof row.amount !== 'number' || !Number.isFinite(row.amount) ||
      typeof row.startDate !== 'string' || !Number.isFinite(Date.parse(row.startDate)) ||
      typeof row.isActive !== 'boolean'
    )) throw new Error('Invalid budget data.');
    if (key === 'mo-money-templates' && (
      typeof row.amount !== 'number' || !Number.isFinite(row.amount) ||
      typeof row.description !== 'string' || typeof row.account !== 'string' || typeof row.category !== 'string'
    )) throw new Error('Invalid transaction template.');
  }
}

export function validateSnapshot(value: unknown): asserts value is CloudSnapshot {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isRecord(value.storage)) {
    throw new Error('Unsupported or incomplete cloud snapshot.');
  }
  validateRows(value.transactions, 'Transactions');
  validateRows(value.transactionHistory, 'Transaction history');
  validateRows(value.preferences, 'Preferences');
  value.transactions.forEach(validateTransaction);
  for (const row of value.transactionHistory) {
    if (typeof row.transactionId !== 'string' || typeof row.timestamp !== 'string' ||
        !Number.isFinite(Date.parse(row.timestamp)) || !isRecord(row.data)) {
      throw new Error('Invalid transaction history.');
    }
    validateTransaction(row.data);
  }
  if (value.preferences.length > 1 || value.preferences.some(row => row.id !== 'default')) {
    throw new Error('Invalid preferences identity.');
  }
  for (const prefs of value.preferences) {
    if (typeof prefs.currency !== 'string' || typeof prefs.dateFormat !== 'string' ||
        !['light', 'dark', 'auto'].includes(String(prefs.theme))) throw new Error('Invalid preferences data.');
  }
  if (Object.keys(value.storage).length !== snapshotStorageKeys.length) {
    throw new Error('Incomplete snapshot storage.');
  }
  for (const key of snapshotStorageKeys) {
    const stored = value.storage[key];
    if (stored === null) continue;
    if (typeof stored !== 'string') throw new Error(`Missing snapshot field: ${key}`);
    const rows: unknown = JSON.parse(stored);
    validateRows(rows, key);
    validateStorageRows(key, rows);
  }
}

// Canonical content excludes timestamps added by transport, and ignores row/key ordering.
export function snapshotContent(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) {
      const rows = item.map(canonical);
      return item.every(row => isRecord(row) && typeof row.id === 'string')
        ? rows.sort((a, b) => String((a as SnapshotRow).id).localeCompare(String((b as SnapshotRow).id)))
        : rows;
    }
    if (isRecord(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => {
        const value = item[key];
        const isDate = ['date', 'addedDate', 'lastModifiedDate', 'lastModified', 'createdDate', 'startDate', 'endDate', 'lastSyncDate', 'historicalBalanceDate'].includes(key);
        return [key, isDate && typeof value === 'string' && Number.isFinite(Date.parse(value))
          ? new Date(value).toISOString() : canonical(value)];
      }));
    }
    return item;
  }
  if (isRecord(value) && isRecord(value.storage)) {
    value = { ...value, storage: Object.fromEntries(Object.entries(value.storage).map(
      ([key, stored]) => [key, typeof stored === 'string' ? JSON.parse(stored) : stored]
    )) };
  }
  return JSON.stringify(canonical(value));
}

export function removedRecords(previous: CloudSnapshot, next: CloudSnapshot): number {
  const removed = (before: SnapshotRow[], after: SnapshotRow[]) => {
    const ids = new Set(after.map(row => row.id));
    return before.filter(row => !ids.has(row.id)).length;
  };
  let count = removed(previous.transactions, next.transactions) +
    removed(previous.transactionHistory, next.transactionHistory) +
    removed(previous.preferences, next.preferences);
  for (const key of snapshotStorageKeys) {
    count += removed(JSON.parse(previous.storage[key] || '[]'), JSON.parse(next.storage[key] || '[]'));
  }
  return count;
}

export function hasSnapshotData(data: CloudSnapshot): boolean {
  return data.transactions.length > 0 || data.preferences.length > 0 ||
    snapshotStorageKeys.some(key => JSON.parse(data.storage[key] || '[]').length > 0);
}

export function decodeLegacySnapshot(input: unknown): CloudSnapshot {
  let value = input;
  if (isRecord(value) && value.success === true && isRecord(value.data)) value = value.data.content;
  if (typeof value === 'string') value = JSON.parse(value);
  if (!isRecord(value)) throw new Error('Invalid legacy cloud data.');
  if (value.schemaVersion === 1) {
    validateSnapshot(value);
    return value;
  }
  const record = value;
  const field = (key: string) => {
    const item = record[key];
    return typeof item === 'string' ? JSON.parse(item) : item;
  };
  const prefs = field('preferences');
  const data: unknown = {
    schemaVersion: 1,
    transactions: field('transactions'),
    transactionHistory: field('transactionHistory') ?? [],
    preferences: prefs && isRecord(prefs) && Object.keys(prefs).length ? [{ ...prefs, id: 'default' }] : [],
    storage: {
      'mo-money-accounts': JSON.stringify(field('accounts')),
      'mo-money-categories': JSON.stringify(field('categories')),
      'mo-money-category-rules': JSON.stringify(field('rules')),
      'mo-money-budgets': JSON.stringify(field('budgets')),
      'mo-money-templates': null
    }
  };
  validateSnapshot(data);
  return data;
}
