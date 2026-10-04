import { Category, Transaction } from '../types';
import { azureOpenAIService } from './azureOpenAIService';
import { dataService } from './dataService';

export const canRerunAI = (transaction: Transaction) =>
  transaction.category.toLowerCase() === 'uncategorized' && !transaction.isVerified &&
  !transaction.isSplit && !transaction.splits?.length;

export async function rerunUncategorizedTransactions(
  transactions: Transaction[],
  categories: Category[],
  onProgress: (completed: number, total: number) => void
) {
  const candidates = transactions.filter(canRerunAI);
  const summary = { categorized: 0, unresolved: 0, failed: 0, skipped: 0, notAttempted: 0, errors: [] as string[] };
  onProgress(0, candidates.length);
  for (let offset = 0; offset < candidates.length; offset += 12) {
    const batch = candidates.slice(offset, offset + 12);
    const results = await azureOpenAIService.classifyTransactionsBatch(batch.map(transaction => ({
      transactionText: transaction.description, amount: transaction.amount,
      date: transaction.date.toISOString(), availableCategories: categories
    })));
    let requestFailed = false;
    for (let index = 0; index < batch.length; index++) {
      const original = batch[index];
      const result = results[index];
      try {
        const current = await dataService.getTransactionById(original.id);
        if (!current || !canRerunAI(current) ||
            current.lastModifiedDate?.getTime() !== original.lastModifiedDate?.getTime() ||
            current.description !== original.description || current.amount !== original.amount ||
            current.account !== original.account || current.date.getTime() !== original.date.getTime()) {
          summary.skipped++;
          continue;
        }
        const category = categories.find(item => item.id === result?.categoryId);
        const subcategory = category?.subcategories.find(item => item.id === result?.subcategoryId);
        if (!result || result.error) {
          const message = result?.error?.message || 'AI returned no classification for this transaction.';
          requestFailed = true;
          if (!summary.errors.includes(message)) summary.errors.push(message);
          const saved = await dataService.updateTransaction(original.id, { reasoning: message }, 'AI re-run failed');
          if (!saved) throw new Error('Transaction could not be updated.');
          summary.failed++;
        } else if (!category || category.id === 'uncategorized' || (result.subcategoryId && !subcategory)) {
          const saved = await dataService.updateTransaction(original.id, {
            reasoning: result.reasoning || 'AI could not determine a category.', confidence: result.confidence
          }, 'AI re-run: still uncategorized');
          if (!saved) throw new Error('Transaction could not be updated.');
          summary.unresolved++;
        } else {
          const saved = await dataService.updateTransaction(original.id, {
            category: category.name, subcategory: subcategory?.name, type: category.type,
            confidence: result.confidence, reasoning: result.reasoning,
            aiProxyMetadata: result.proxyMetadata, isVerified: false
          }, `AI Re-run: Uncategorized -> ${category.name}${subcategory ? ` > ${subcategory.name}` : ''}`);
          if (!saved) throw new Error('Transaction could not be updated.');
          summary.categorized++;
        }
      } catch (error) {
        console.error('Failed to save AI re-run result:', error);
        summary.failed++;
        if (!summary.errors.includes('Some results could not be saved.')) summary.errors.push('Some results could not be saved.');
      } finally {
        onProgress(offset + index + 1, candidates.length);
      }
    }
    if (requestFailed) {
      summary.notAttempted = candidates.length - offset - batch.length;
      break;
    }
  }
  return summary;
}
