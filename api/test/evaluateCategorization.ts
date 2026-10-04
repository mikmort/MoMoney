import { buildClassificationMessages } from '../../src/utils/classificationPrompt';
import { defaultCategories } from '../../src/data/defaultCategories';
import { isRecord } from '../../src/utils/cloudSnapshot';
import { completeWithAzure } from '../src/functions/openai';

// Synthetic, labeled examples only; never load a user's financial records here.
export const cases = [
  { description: 'Spotify', amount: -12.99, categoryId: 'entertainment', subcategoryId: 'entertainment-streaming' },
  { description: 'Shell', amount: -58.40, categoryId: 'transportation', subcategoryId: 'transport-fuel' },
  { description: 'Restaurant Krebsegaa', amount: -82.50, categoryId: 'food', subcategoryId: 'food-restaurants' },
  { description: 'ACH DEBIT SPOTIFY USA', amount: -12.99, categoryId: 'entertainment', subcategoryId: 'entertainment-streaming' },
  { description: 'AUTOMATIC PAYMENT NETFLIX', amount: -15.49, categoryId: 'entertainment', subcategoryId: 'entertainment-streaming' },
  { description: 'WITHDRAWAL SHELL GAS STATION', amount: -54.20, categoryId: 'transportation', subcategoryId: 'transport-fuel' },
  { description: 'ZELLE PAYMENT RESTAURANT KREBSEGAA', amount: -82.50, categoryId: 'food', subcategoryId: 'food-restaurants' },
  { description: 'ACH CREDIT PAYROLL PRIMARY EMPLOYER', amount: 2500, categoryId: 'salary', subcategoryId: 'salary-primary' },
  { description: 'TRANSFER TO MY SAVINGS ACCOUNT', amount: -500, categoryId: 'internal-transfer', subcategoryId: 'transfer-between-accounts' },
  { description: 'WIRE TRANSFER FEE', amount: -25, categoryId: 'financial', subcategoryId: 'financial-fees' },
  { description: 'ACH DEBIT', amount: -42.17, categoryId: 'uncategorized', subcategoryId: null },
  { description: 'UNKNOWN MERCHANT QXZ', amount: -31.23, categoryId: 'uncategorized', subcategoryId: null }
];

export function scoreCategorization(results: unknown) {
  if (!Array.isArray(results) || results.length !== cases.length) {
    throw new Error('Evaluation requires exactly one indexed result per case.');
  }
  const seen = new Set<number>();
  const rows = results.map((result: unknown) => {
    if (!isRecord(result) || typeof result.index !== 'number' || !Number.isInteger(result.index) ||
        result.index < 0 || result.index >= cases.length || seen.has(result.index) ||
        typeof result.categoryId !== 'string' ||
        (result.subcategoryId !== null && typeof result.subcategoryId !== 'string')) {
      throw new Error('Evaluation returned an invalid, missing or duplicate result index/category.');
    }
    seen.add(result.index);
    const expected = cases[result.index];
    const categoryCorrect = result.categoryId === expected.categoryId;
    return {
      index: result.index, description: expected.description,
      expected: `${expected.categoryId}/${expected.subcategoryId}`,
      actual: `${result.categoryId}/${result.subcategoryId}`,
      categoryCorrect, subcategoryCorrect: categoryCorrect && result.subcategoryId === expected.subcategoryId
    };
  }).sort((a, b) => a.index - b.index);
  return {
    total: rows.length,
    categoryAccuracy: rows.filter(row => row.categoryCorrect).length / rows.length,
    exactSubcategoryAccuracy: rows.filter(row => row.subcategoryCorrect).length / rows.length,
    reportedExamplesPass: rows.slice(0, 3).every(row => row.subcategoryCorrect),
    mismatches: rows.filter(row => !row.subcategoryCorrect)
  };
}

async function main() {
  const deployments = process.argv.slice(2);
  if (!process.env.AZURE_OPENAI_ENDPOINT || !deployments.length) {
    throw new Error('Set AZURE_OPENAI_ENDPOINT and pass existing deployment names. This opt-in evaluation uses billable Azure inference.');
  }
  const messages = buildClassificationMessages(cases.map(item => ({
    transactionText: item.description, amount: item.amount,
    date: '2026-01-15', availableCategories: defaultCategories
  })), true);
  for (const argument of deployments) {
    const legacy = argument.startsWith('--legacy=');
    const deployment = legacy ? argument.slice('--legacy='.length) : argument;
    if (!deployment || (argument.startsWith('--') && !legacy)) throw new Error('Invalid deployment argument.');
    const start = Date.now();
    try {
      const data = await completeWithAzure({
        model: deployment, messages, max_completion_tokens: cases.length * 200,
        ...(legacy ? {} : { reasoning_effort: 'none' as const }), stream: false, store: false
      });
      if (!isRecord(data) || !Array.isArray(data.choices)) throw new Error('Invalid Azure response.');
      const choice: unknown = data.choices[0];
      if (!isRecord(choice) || choice.finish_reason !== 'stop' || !isRecord(choice.message) ||
          choice.message.refusal || typeof choice.message.content !== 'string') {
        throw new Error('Incomplete or refused Azure response.');
      }
      const content = choice.message.content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const score = scoreCategorization(JSON.parse(content));
      console.log(JSON.stringify({
        deployment, model: data.model, reasoningEffort: legacy ? 'unsupported' : 'none', latencyMs: Date.now() - start,
        usage: data.usage, ...score
      }));
      if (!score.reportedExamplesPass || score.exactSubcategoryAccuracy < 0.9) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({ deployment, error: error instanceof Error ? error.message : String(error) }));
      process.exitCode = 1;
    }
  }
}

if (require.main === module) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
