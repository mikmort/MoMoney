import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cases, scoreCategorization } from './evaluateCategorization';

const correct = () => cases.map((item, index) => ({
  index, categoryId: item.categoryId, subcategoryId: item.subcategoryId
}));

test('scores exact subcategories separately from parent categories, independent of order', () => {
  assert.equal(scoreCategorization(correct().reverse()).exactSubcategoryAccuracy, 1);
  const results = correct();
  results[0].subcategoryId = null;
  const score = scoreCategorization(results);
  assert.equal(score.categoryAccuracy, 1);
  assert.equal(score.exactSubcategoryAccuracy, 11 / 12);
  assert.equal(score.reportedExamplesPass, false);
});

test('does not treat incomplete, duplicate or malformed responses as successful evaluation', () => {
  assert.throws(() => scoreCategorization(correct().slice(1)));
  const results = correct();
  results[1].index = 0;
  assert.throws(() => scoreCategorization(results));
  assert.throws(() => scoreCategorization(cases.map(() => null)));
});
