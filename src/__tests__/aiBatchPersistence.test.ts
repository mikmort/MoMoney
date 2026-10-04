import { dataService } from '../services/dataService';
import { db } from '../services/db';
import { transferMatchingService } from '../services/transferMatchingService';

beforeEach(async () => { await dataService.clearAllData(); });
afterEach(() => { jest.restoreAllMocks(); });

it('persists a result batch once while retaining per-row history, undo and AI metadata', async () => {
  const rows = [];
  for (let index = 0; index < 20; index++) {
    rows.push(await dataService.addTransaction({
      description: `Spotify ${index}`, date: new Date(2026, 0, 15), amount: -12.99,
      category: 'Uncategorized', account: 'Checking', type: 'expense'
    }));
  }
  const save = jest.spyOn(db, 'robustBulkPut');
  const saved = await dataService.batchUpdateTransactions(rows.map(row => ({
    id: row.id, expectedTransaction: { ...row }, note: 'AI Re-run',
    updates: { category: 'Entertainment', subcategory: 'Streaming Services', confidence: 0.88, reasoning: 'Music streaming' }
  })), { source: 'ai' });
  expect(saved).toHaveLength(20);
  expect(save).toHaveBeenCalledTimes(1);
  for (const row of rows) {
    expect(await db.transactions.get(row.id)).toMatchObject({ category: 'Entertainment', confidence: 0.88, reasoning: 'Music streaming' });
    expect(await dataService.getTransactionHistory(row.id)).toEqual(expect.arrayContaining([
      expect.objectContaining({ note: 'AI Re-run', data: expect.objectContaining({ category: 'Uncategorized' }) })
    ]));
    expect(await dataService.getUndoRedoStatus(row.id)).toMatchObject({ canUndo: true });
  }
  await dataService.undoTransactionEdit(rows[0].id);
  expect(await dataService.getTransactionById(rows[0].id)).toMatchObject({ category: 'Uncategorized' });
});

it('rechecks stale results after an asynchronous history write before applying them', async () => {
  const row = await dataService.addTransaction({
    description: 'Spotify', date: new Date(2026, 0, 15), amount: -12.99,
    category: 'Uncategorized', account: 'Checking', type: 'expense'
  });
  const originalHistory = db.addHistoryEntry.bind(db);
  jest.spyOn(db, 'addHistoryEntry').mockImplementationOnce(async entry => {
    await dataService.updateTransaction(row.id, { category: 'Personal', isVerified: true });
    return originalHistory(entry);
  });
  const result = await dataService.batchUpdateTransactions([{
    id: row.id, expectedTransaction: { ...row }, updates: { category: 'Entertainment' }
  }], { source: 'ai' });
  expect(result).toHaveLength(0);
  expect(await db.transactions.get(row.id)).toMatchObject({ category: 'Personal', isVerified: true });
});

it('does not rerun transfer matching for unrelated expense classifications', async () => {
  await dataService.addTransaction({
    description: 'Transfer', date: new Date(2026, 0, 15), amount: -100,
    category: 'Internal Transfer', account: 'Checking', type: 'transfer'
  });
  const row = await dataService.addTransaction({
    description: 'Spotify', date: new Date(2026, 0, 15), amount: -12.99,
    category: 'Uncategorized', account: 'Checking', type: 'expense'
  });
  const match = jest.spyOn(transferMatchingService, 'autoMatchTransfers');
  await dataService.batchUpdateTransactions([{
    id: row.id, expectedTransaction: { ...row }, updates: { category: 'Entertainment' }
  }], { source: 'ai' });
  expect(match).not.toHaveBeenCalled();
});
