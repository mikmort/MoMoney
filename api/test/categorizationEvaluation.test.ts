import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases, correlateEvaluationBatch, scoreCategorization } from './evaluateCategorization';
import { buildClassificationMessages, classificationOutputTokens, planClassificationBatches } from '../../src/utils/classificationPrompt';
import { estimateAIRequestTokens } from '../../src/services/aiRequestScheduler';
import { defaultCategories } from '../../src/data/defaultCategories';

const correct = () => cases.map((item, index) => ({
  index, categoryId: item.categoryId, subcategoryId: item.subcategoryId
}));

test('scores exact subcategories separately from parent categories, independent of order', () => {
  assert.equal(scoreCategorization(correct().reverse()).exactSubcategoryAccuracy, 1);
  const results = correct();
  results[0].subcategoryId = null;
  const score = scoreCategorization(results);
  assert.equal(score.categoryAccuracy, 1);
  assert.equal(score.exactSubcategoryAccuracy, (cases.length - 1) / cases.length);
  assert.equal(score.reportedExamplesPass, false);
});

test('requires every investment and ACH regression example to pass regardless of overall score', () => {
  const results = correct();
  results[cases.length - 2].subcategoryId = null;
  const score = scoreCategorization(results);
  assert.ok(score.exactSubcategoryAccuracy > 0.9);
  assert.equal(score.reportedExamplesPass, false);
});

test('does not treat incomplete, duplicate or malformed responses as successful evaluation', () => {
  assert.throws(() => scoreCategorization(correct().slice(1)));
  const results = correct();
  results[1].index = 0;
  assert.throws(() => scoreCategorization(results));
  assert.throws(() => scoreCategorization(cases.map(() => null)));
});

test('budgets the expanded evaluation and preserves global indexes across reordered batches', () => {
  const inputs = cases.map(item => ({
    transactionText: item.description, amount: item.amount, accountType: item.accountType, currency: 'USD',
    date: '2026-01-15', availableCategories: defaultCategories
  }));
  const batches = planClassificationBatches(inputs);
  assert.ok(batches.length > 1);
  let offset = 0;
  const results = batches.flatMap(batch => {
    assert.ok(estimateAIRequestTokens(buildClassificationMessages(batch, true), classificationOutputTokens(batch.length)) <= 9000);
    const responses = correct().slice(offset, offset + batch.length).map((item, index) => ({ ...item, index })).reverse();
    const correlated = correlateEvaluationBatch(responses, batch.length, offset);
    offset += batch.length;
    return correlated;
  });
  assert.equal(scoreCategorization(results).exactSubcategoryAccuracy, 1);
  assert.throws(() => correlateEvaluationBatch([{ index: 1 }], 1, 0));
  assert.throws(() => correlateEvaluationBatch([{ index: 0 }, { index: 0 }], 2, 10));
  assert.throws(() => correlateEvaluationBatch([], 1, 0));
});
