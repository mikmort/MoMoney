import Papa from 'papaparse';
import { FileSchemaMapping } from '../types';

export function detectCSVSchema(content: string): FileSchemaMapping | undefined {
  const parsed = Papa.parse<string[]>(content, { preview: 1, skipEmptyLines: true });
  const headers = parsed.data[0];
  if (!headers || parsed.errors.some(error => error.type === 'Quotes')) return undefined;
  const normalize = (header: string) => header.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  const find = (aliases: string[]) => {
    for (const alias of aliases) {
      const matches = headers.filter(header => normalize(header) === alias);
      if (matches.length > 1) return undefined;
      if (matches.length === 1) return matches[0];
    }
    return undefined;
  };
  const dateColumn = find(['transaction date', 'date', 'trade date', 'posted date', 'post date']);
  const descriptionColumn = find(['description', 'transaction description', 'merchant', 'payee']);
  const amountColumn = find(['amount', 'transaction amount', 'net amount']) ||
    (find(['debit']) && find(['credit']) ? 'Debit/Credit' : undefined) ||
    (find(['withdrawal']) && find(['deposit']) ? 'Withdrawal/Deposit' : undefined);
  if (!dateColumn || !descriptionColumn || !amountColumn) return undefined;
  return {
    hasHeaders: true, skipRows: 0, dateFormat: 'MM/DD/YYYY', amountFormat: 'negative for debits',
    dateColumn, descriptionColumn, amountColumn,
    notesColumn: find(['memo', 'notes']),
    categoryColumn: find(['category']),
    subcategoryColumn: find(['subcategory'])
  };
}

export function parseStatementAmount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  let text = value.trim();
  const parentheses = text.startsWith('(') && text.endsWith(')');
  if (parentheses) text = text.slice(1, -1).trim();
  text = text.replace(/^([+-]?)\s*[$€£]\s*/, '$1').replace(/\s+/g, '');
  if (parentheses && /^[+-]/.test(text)) return null;
  let normalized: string;
  if (/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text)) {
    normalized = text.replace(/,/g, '');
  } else if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(text)) {
    normalized = text.replace(/\./g, '').replace(',', '.');
  } else {
    return null;
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) ? (parentheses ? -amount : amount) : null;
}
