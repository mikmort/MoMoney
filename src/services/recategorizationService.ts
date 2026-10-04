import { AIClassificationResponse, Category, Transaction } from '../types';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';
import { AI_MAX_CONCURRENT_REQUESTS, AIRequestProgress } from './aiRequestScheduler';
import { planClassificationBatches } from '../utils/classificationPrompt';

export const canRerunAI = (transaction: Transaction) =>
  transaction.category.toLowerCase() === 'uncategorized' && !transaction.isVerified &&
  !transaction.isSplit && !transaction.splits?.length;

export interface AIRerunProgress {
  completed: number;
  total: number;
  processing: number;
  saving: boolean;
  waiting: number;
  waitMs: number;
  cooldown: boolean;
}

export async function rerunUncategorizedTransactions(
  transactions: Transaction[],
  categories: Category[],
  onProgress: (progress: AIRerunProgress) => void
) {
  // Freeze the pre-request state; later edits must never be overwritten.
  const candidates = transactions.filter(canRerunAI).map(transaction => ({
    ...transaction, date: new Date(transaction.date),
    lastModifiedDate: transaction.lastModifiedDate && new Date(transaction.lastModifiedDate)
  }));
  const requests = candidates.map(transaction => ({
    transactionText: transaction.description, amount: transaction.amount,
    date: transaction.date.toISOString(), availableCategories: categories
  }));
  const batches = planClassificationBatches(requests);
  const summary = { categorized: 0, unresolved: 0, failed: 0, skipped: 0, notAttempted: 0, errors: [] as string[] };
  let completed = 0;
  let nextBatch = 0;
  let nextOffset = 0;
  let stopped = false;
  let saving = false;
  let saveQueue = Promise.resolve();
  const states = new Map<number, AIRequestProgress>();
  const report = () => {
    const statuses = Array.from(states.values());
    onProgress({
      completed, total: candidates.length, saving,
      processing: statuses.filter(state => state.phase === 'processing').length,
      waiting: statuses.filter(state => state.phase !== 'processing').length,
      waitMs: Math.max(0, ...statuses.map(state => state.waitMs || 0)),
      cooldown: statuses.some(state => state.phase === 'cooldown')
    });
  };
  const addError = (message: string) => {
    if (!summary.errors.includes(message)) summary.errors.push(message);
  };

  const saveResults = async (rows: Transaction[], results: AIClassificationResponse[]) => {
    saving = true;
    report();
    const outcomes = new Map<string, 'categorized' | 'unresolved' | 'failed'>();
    const updates = rows.map((original, index) => {
      const result = results[index];
      const category = categories.find(item => item.id === result?.categoryId);
      const subcategory = category?.subcategories.find(item => item.id === result?.subcategoryId);
      let changes: Partial<Transaction>;
      let note: string;
      if (!result || result.error) {
        const message = result?.error?.message || 'AI returned no classification for this transaction.';
        addError(message);
        outcomes.set(original.id, 'failed');
        changes = { reasoning: message };
        note = 'AI re-run failed';
      } else if (!category || category.id === 'uncategorized' || (result.subcategoryId && !subcategory)) {
        outcomes.set(original.id, 'unresolved');
        changes = { reasoning: result.reasoning || 'AI could not determine a category.', confidence: result.confidence };
        note = 'AI re-run: still uncategorized';
      } else {
        outcomes.set(original.id, 'categorized');
        changes = {
          category: category.name, subcategory: subcategory?.name, type: category.type,
          confidence: result.confidence, reasoning: result.reasoning,
          aiProxyMetadata: result.proxyMetadata, isVerified: false
        };
        note = `AI Re-run: Uncategorized -> ${category.name}${subcategory ? ` > ${subcategory.name}` : ''}`;
      }
      return { id: original.id, updates: changes, note, expectedTransaction: original };
    });
    try {
      const saved = await dataService.batchUpdateTransactions(updates, { source: 'ai' });
      const savedIds = new Set(saved.map(transaction => transaction.id));
      for (const row of rows) {
        if (!savedIds.has(row.id)) summary.skipped++;
        else summary[outcomes.get(row.id)!]++;
      }
    } catch (error) {
      console.error('Failed to save AI re-run batch:', error);
      summary.failed += rows.length;
      addError('Some results could not be saved.');
      stopped = true;
    } finally {
      completed += rows.length;
      saving = false;
      report();
    }
  };

  const worker = async () => {
    while (!stopped && nextBatch < batches.length) {
      const id = nextBatch++;
      const batch = batches[id];
      const rows = candidates.slice(nextOffset, nextOffset + batch.length);
      nextOffset += batch.length;
      states.set(id, { phase: 'queued' });
      report();
      let results: AIClassificationResponse[];
      try {
        results = await azureOpenAIService.classifyTransactionsBatch(batch, state => {
          states.set(id, state);
          report();
        });
      } catch (error) {
        console.error('AI re-run request failed:', error);
        results = [];
      }
      states.delete(id);
      if (results.length !== batch.length || results.some(result => result.error)) stopped = true;
      // AI requests may overlap, but database mutation and undo history must not.
      saveQueue = saveQueue.then(() => saveResults(rows, results));
      await saveQueue;
    }
  };
  report();
  await Promise.all(Array.from({ length: Math.min(AI_MAX_CONCURRENT_REQUESTS, batches.length) }, () => worker()));
  summary.notAttempted = candidates.length - nextOffset;
  report();
  return summary;
}
