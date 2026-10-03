import { db, TransactionHistoryEntry } from './db';
import type { ExportData } from './simplifiedImportExportService';
import type { Transaction } from '../types';
import { defaultCategories } from '../data/defaultCategories';

const storageKeys = {
  accounts: 'mo-money-accounts',
  categories: 'mo-money-categories',
  budgets: 'mo-money-budgets',
  rules: 'mo-money-category-rules'
} as const;

type StoredCollection = keyof typeof storageKeys;
const collections = ['transactions', 'transactionHistory', 'accounts', 'categories', 'budgets', 'rules'] as const;
const restorePendingKey = 'mo_money_sync_restore_pending';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parse(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function validateTransaction(value: unknown): asserts value is Transaction {
  if (!isRecord(value) || typeof value.id !== 'string' || !value.id ||
      typeof value.description !== 'string' ||
      typeof value.amount !== 'number' || !Number.isFinite(value.amount) ||
      !value.date || !Number.isFinite(new Date(String(value.date)).getTime())) {
    throw new Error('Invalid transaction in sync data. No data was replaced.');
  }
}

// Accept both the original string-valued cloud format and JSON file exports.
export function decodeSnapshot(value: unknown): ExportData {
  let source = parse(value);
  if (isRecord(source) && source.success === true && isRecord(source.data)) {
    source = parse(source.data.content);
  }
  if (!isRecord(source) || source.version !== '1.0') {
    throw new Error('Unsupported or invalid cloud backup. No data was replaced.');
  }
  const decoded: Record<string, unknown> = { ...source };
  for (const name of collections) {
    const rows = parse(source[name]);
    if (!Array.isArray(rows)) {
      throw new Error(`Missing or invalid ${name} in sync data. No data was replaced.`);
    }
    const ids = new Set<string>();
    for (const row of rows) {
      if (!isRecord(row) || typeof row.id !== 'string' || !row.id || ids.has(row.id)) {
        throw new Error(`Invalid or duplicate ID in ${name}. No data was replaced.`);
      }
      ids.add(row.id);
      if (name === 'transactions') validateTransaction(row);
      if (name === 'accounts' && (typeof row.name !== 'string' ||
          typeof row.currency !== 'string' || typeof row.isActive !== 'boolean')) {
        throw new Error('Invalid account in sync data.');
      }
      if (name === 'categories' && (typeof row.name !== 'string' || !Array.isArray(row.subcategories))) {
        throw new Error('Invalid category in sync data.');
      }
      if (name === 'budgets' && (typeof row.name !== 'string' ||
          typeof row.amount !== 'number' || !Number.isFinite(row.amount) ||
          !row.startDate || !Number.isFinite(new Date(String(row.startDate)).getTime()))) {
        throw new Error('Invalid budget in sync data.');
      }
      if (name === 'rules' && (typeof row.name !== 'string' ||
          !Array.isArray(row.conditions) || !isRecord(row.action))) {
        throw new Error('Invalid rule in sync data.');
      }
      if (name === 'transactionHistory') {
        validateTransaction(row.data);
        if (typeof row.transactionId !== 'string' || !row.timestamp ||
            !Number.isFinite(new Date(String(row.timestamp)).getTime())) {
          throw new Error('Invalid transaction history. No data was replaced.');
        }
      }
    }
    decoded[name] = rows;
  }
  decoded.preferences = parse(source.preferences);
  if (decoded.preferences !== null && !isRecord(decoded.preferences)) {
    throw new Error('Missing or invalid preferences. No data was replaced.');
  }
  for (const name of ['balanceHistory', 'currencyRates', 'transferMatches']) {
    const rows = source[name] === undefined ? [] : parse(source[name]);
    if (!Array.isArray(rows)) throw new Error(`Invalid ${name} in sync data.`);
    decoded[name] = rows;
  }
  // All persisted collections and transactions have been checked above.
  return {
    ...decoded,
    version: '1.0',
    exportDate: String(source.exportDate || source.timestamp || ''),
    appVersion: '0.1.0'
  } as ExportData;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function snapshotContent(data: ExportData): string {
  const content: Record<string, unknown> = { preferences: data.preferences };
  for (const name of collections) {
    content[name] = [...(data[name] ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id));
  }
  return canonical(content);
}

export async function snapshotFingerprint(data: ExportData): Promise<string> {
  const bytes = new TextEncoder().encode(snapshotContent(data));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function removedRecords(before: ExportData, after: ExportData): string[] {
  return collections.flatMap(name => {
    const oldRows: Array<{ id: string }> = before[name] ?? [];
    const newIds = new Set((after[name] ?? []).map(row => row.id));
    const count = oldRows.filter(row => !newIds.has(row.id)).length;
    return count ? [`${count} ${name}`] : [];
  });
}

export function hasUserData(data: ExportData): boolean {
  const categories = [...(data.categories ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const defaults = [...defaultCategories].sort((a, b) => a.id.localeCompare(b.id));
  return data.transactions.length > 0 || !!data.accounts?.length ||
    !!data.rules?.length || !!data.budgets?.length ||
    (categories.length > 0 && canonical(categories) !== canonical(defaults)) ||
    data.transactionHistory.length > 0 || data.preferences !== null;
}

export function encodeSnapshot(data: ExportData): Record<string, unknown> {
  const content: Record<string, unknown> = { version: '1.0', timestamp: data.exportDate };
  for (const name of [...collections, 'preferences', 'balanceHistory', 'currencyRates', 'transferMatches']) {
    content[name] = JSON.stringify(data[name as keyof ExportData] ?? []);
  }
  content.preferences = JSON.stringify(data.preferences);
  return content;
}

class CloudSyncSnapshotService {
  async read(): Promise<ExportData> {
    if (localStorage.getItem(restorePendingKey)) {
      throw new Error('A previous cloud restore was interrupted. Sync is blocked to protect your cloud data. Recover from the cloud in a fresh browser profile.');
    }
    return db.transaction('r', [db.transactions, db.transactionHistory, db.userPreferences], async () => {
      if (localStorage.getItem('mo-money-transactions')) {
        throw new Error('Legacy local data needs migration before cloud sync. Export a local backup first.');
      }
      const stored = Object.fromEntries(Object.entries(storageKeys).map(([name, key]) => [
        name, JSON.parse(localStorage.getItem(key) ?? JSON.stringify(name === 'categories' ? defaultCategories : []))
      ]));
      return decodeSnapshot({
        version: '1.0',
        exportDate: new Date().toISOString(),
        transactions: await db.transactions.toArray(),
        transactionHistory: await db.transactionHistory.toArray(),
        preferences: await db.getUserPreferences(),
        ...stored
      });
    });
  }

  async restore(data: ExportData, expected: ExportData): Promise<void> {
    const validated = decodeSnapshot(data);
    const previous = new Map(Object.values(storageKeys).map(key => [key, localStorage.getItem(key)]));
    let storageTouched = false;
    const convertDates = (transaction: Transaction): Transaction => ({
      ...transaction,
      date: new Date(transaction.date),
      addedDate: transaction.addedDate ? new Date(transaction.addedDate) : undefined,
      lastModifiedDate: transaction.lastModifiedDate ? new Date(transaction.lastModifiedDate) : undefined
    });
    try {
      await db.transaction('rw', [db.transactions, db.transactionHistory, db.userPreferences], async () => {
        if (snapshotContent(await this.read()) !== snapshotContent(expected)) {
          throw new Error('Local data changed during download. Retry sync; your changes were not replaced.');
        }
        localStorage.setItem(restorePendingKey, new Date().toISOString());
        await db.transactions.clear();
        await db.transactionHistory.clear();
        await db.userPreferences.clear();
        await db.transactions.bulkAdd(validated.transactions.map(convertDates));
        await db.transactionHistory.bulkAdd(validated.transactionHistory.map((entry: TransactionHistoryEntry) => ({
          ...entry, data: convertDates(entry.data)
        })));
        if (validated.preferences) await db.saveUserPreferences(validated.preferences);
        for (const [name, key] of Object.entries(storageKeys)) {
          storageTouched = true;
          localStorage.setItem(key, JSON.stringify(validated[name as StoredCollection]));
        }
      });
      localStorage.removeItem(restorePendingKey);
    } catch (error) {
      // IndexedDB rolls back automatically; restore the small localStorage collections too.
      if (storageTouched) {
        for (const [key, value] of previous) {
          if (value === null) localStorage.removeItem(key);
          else localStorage.setItem(key, value);
        }
      }
      localStorage.removeItem(restorePendingKey);
      throw error;
    }
  }
}

export const cloudSyncSnapshotService = new CloudSyncSnapshotService();
