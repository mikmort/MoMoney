import { rerunUncategorizedTransactions } from '../services/recategorizationService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { dataService } from '../services/dataService';
import { defaultCategories } from '../data/defaultCategories';
import { AIClassificationResponse, Transaction } from '../types';

jest.mock('../services/azureOpenAIService');
jest.mock('../services/dataService');
const classify = jest.mocked(azureOpenAIService.classifyTransactionsBatch);
const update = jest.mocked(dataService.batchUpdateTransactions);
const tx = (id: string, updates: Partial<Transaction> = {}): Transaction => ({
  id, description: 'Spotify', date: new Date('2026-01-15'), amount: -12.99,
  category: 'Uncategorized', type: 'expense', account: 'Checking', ...updates
});
const success: AIClassificationResponse = {
  categoryId: 'entertainment', subcategoryId: 'entertainment-streaming', confidence: 0.88, reasoning: 'Streaming'
};
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.resetAllMocks();
  update.mockImplementation(async updates => updates.map(item => tx(item.id, item.updates)));
});

it('saves a batch once, keeps history enabled, and reports accurate results', async () => {
  const rows = [tx('1'), tx('2'), tx('3'), tx('verified', { isVerified: true }), tx('categorized', { category: 'Entertainment' })];
  classify.mockResolvedValue([
    success,
    { categoryId: 'uncategorized', confidence: 0.2, reasoning: 'Unknown purpose' },
    { categoryId: 'uncategorized', confidence: 0.1, error: { code: 'rate_limit', message: 'Rate limited' } }
  ]);
  const progress = jest.fn();
  const summary = await rerunUncategorizedTransactions(rows, defaultCategories, progress);
  expect(classify.mock.calls[0][0]).toHaveLength(3);
  expect(summary).toMatchObject({ categorized: 1, unresolved: 1, failed: 1, notAttempted: 0 });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith([
    expect.objectContaining({ id: '1', expectedTransaction: rows[0], updates: expect.objectContaining({
      category: 'Entertainment', subcategory: 'Streaming Services', confidence: 0.88
    }) }),
    expect.objectContaining({ id: '2' }), expect.objectContaining({ id: '3' })
  ], { source: 'ai' });
  expect(dataService.updateTransaction).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ completed: 3, total: 3, saving: false }));
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ saving: true }));
});

it('counts rows rejected by the persistence-time edit guard as skipped', async () => {
  classify.mockResolvedValue([success]);
  update.mockResolvedValue([]);
  expect(await rerunUncategorizedTransactions([tx('1')], defaultCategories, jest.fn())).toMatchObject({ skipped: 1, categorized: 0 });
});

it('overlaps two requests, saves out-of-order results to the correct rows, and serializes saves', async () => {
  const rows = Array.from({ length: 60 }, (_, index) => tx(String(index)));
  const resolveRequests: Array<(results: AIClassificationResponse[]) => void> = [];
  classify.mockImplementation((_requests, progress) => {
    progress?.({ phase: 'processing' });
    return new Promise(resolve => resolveRequests.push(resolve));
  });
  let finishSave: (() => void) | undefined;
  update.mockImplementationOnce(updates => new Promise(resolve => {
    finishSave = () => resolve(updates.map(item => tx(item.id, item.updates)));
  }));
  const progress = jest.fn();
  const done = rerunUncategorizedTransactions(rows, defaultCategories, progress);
  await flush();
  expect(classify).toHaveBeenCalledTimes(2);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ processing: 2 }));
  const secondCount = classify.mock.calls[1][0].length;
  const firstCount = classify.mock.calls[0][0].length;
  resolveRequests[1](Array(secondCount).fill(success));
  await flush();
  resolveRequests[0](Array(firstCount).fill(success));
  await flush();
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0][0][0].id).toBe(String(firstCount));
  finishSave!();
  await flush();
  expect(update.mock.calls[1][0][0].id).toBe('0');
  for (let i = 2; i < resolveRequests.length; i++) {
    resolveRequests[i](Array(classify.mock.calls[i][0].length).fill(success));
    await flush();
  }
  expect(await done).toMatchObject({ categorized: 60, failed: 0 });
  expect(update.mock.calls.flatMap(([updates]) => updates.map(item => item.id)).sort())
    .toEqual(rows.map(row => row.id).sort());
});

it('stops undispatched batches after failure while accounting for the two already scheduled requests', async () => {
  const rows = Array.from({ length: 100 }, (_, index) => tx(String(index)));
  classify.mockImplementation(async requests => requests.map(() => ({
    categoryId: 'uncategorized', confidence: 0.1, error: { code: 'authentication', message: 'Sign in again' }
  })));
  const summary = await rerunUncategorizedTransactions(rows, defaultCategories, jest.fn());
  expect(classify).toHaveBeenCalledTimes(2);
  const attempted = classify.mock.calls.reduce((count, [requests]) => count + requests.length, 0);
  expect(summary).toMatchObject({ categorized: 0, failed: attempted, notAttempted: 100 - attempted });
});

it('reports quota and cooldown wait states supplied by the shared scheduler', async () => {
  classify.mockImplementation(async (_requests, progress) => {
    progress?.({ phase: 'quota', waitMs: 6000 });
    progress?.({ phase: 'cooldown', waitMs: 60000 });
    return [success];
  });
  const progress = jest.fn();
  await rerunUncategorizedTransactions([tx('1')], defaultCategories, progress);
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ waiting: 1, waitMs: 6000, cooldown: false }));
  expect(progress).toHaveBeenCalledWith(expect.objectContaining({ waiting: 1, waitMs: 60000, cooldown: true }));
});
