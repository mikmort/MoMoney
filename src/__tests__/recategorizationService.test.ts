import { rerunUncategorizedTransactions } from '../services/recategorizationService';
import { azureOpenAIService } from '../services/azureOpenAIService';
import { dataService } from '../services/dataService';
import { defaultCategories } from '../data/defaultCategories';
import { Transaction } from '../types';

jest.mock('../services/azureOpenAIService');
jest.mock('../services/dataService');
const classify = azureOpenAIService.classifyTransactionsBatch as jest.MockedFunction<typeof azureOpenAIService.classifyTransactionsBatch>;
const get = dataService.getTransactionById as jest.MockedFunction<typeof dataService.getTransactionById>;
const update = dataService.updateTransaction as jest.MockedFunction<typeof dataService.updateTransaction>;
const tx = (id: string, updates: Partial<Transaction> = {}): Transaction => ({
  id, description: 'Spotify', date: new Date('2026-01-15'), amount: -12.99,
  category: 'Uncategorized', type: 'expense', account: 'Checking', ...updates
});

beforeEach(() => {
  jest.resetAllMocks();
  update.mockImplementation(async (id, updates) => tx(id, updates));
});

it('batches only eligible rows and reports successes, unresolved results and failures accurately', async () => {
  const rows = [tx('1'), tx('2'), tx('3'), tx('verified', { isVerified: true }), tx('categorized', { category: 'Entertainment' })];
  get.mockImplementation(async id => rows.find(row => row.id === id) || null);
  classify.mockResolvedValue([
    { categoryId: 'entertainment', subcategoryId: 'entertainment-streaming', confidence: 0.88 },
    { categoryId: 'uncategorized', confidence: 0.2, reasoning: 'Unknown purpose' },
    { categoryId: 'uncategorized', confidence: 0.1, error: { code: 'rate_limit', message: 'Rate limited' } }
  ]);
  const progress = jest.fn();
  const summary = await rerunUncategorizedTransactions(rows, defaultCategories, progress);
  expect(classify.mock.calls[0][0]).toHaveLength(3);
  expect(summary).toMatchObject({ categorized: 1, unresolved: 1, failed: 1, notAttempted: 0 });
  expect(update).toHaveBeenCalledWith('1', expect.objectContaining({
    category: 'Entertainment', subcategory: 'Streaming Services', type: 'expense'
  }), expect.any(String));
  expect(update).not.toHaveBeenCalledWith('verified', expect.anything(), expect.anything());
  expect(progress).toHaveBeenLastCalledWith(3, 3);
});

it('preserves transactions edited or verified while the AI request was running', async () => {
  classify.mockResolvedValue([{ categoryId: 'entertainment', confidence: 0.9 }]);
  get.mockResolvedValue(tx('1', { category: 'Shopping', isVerified: true }));
  expect(await rerunUncategorizedTransactions([tx('1')], defaultCategories, jest.fn())).toMatchObject({ skipped: 1 });
  expect(update).not.toHaveBeenCalled();
});

it('stops submitting later batches after an API failure and reports them as not attempted', async () => {
  const rows = Array.from({ length: 25 }, (_, index) => tx(String(index)));
  get.mockImplementation(async id => rows.find(row => row.id === id) || null);
  classify.mockImplementation(async requests => requests.map(() => ({
    categoryId: 'uncategorized', confidence: 0.1, error: { code: 'authentication', message: 'Sign in again' }
  })));
  const summary = await rerunUncategorizedTransactions(rows, defaultCategories, jest.fn());
  expect(classify).toHaveBeenCalledTimes(1);
  expect(summary).toMatchObject({ categorized: 0, failed: 12, notAttempted: 13 });
});
