import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { precisionAtK, recallAtK, reciprocalRank, meanReciprocalRank, bestPrecisionAtK, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Worked by hand. Relevant results at ranks 2, 4, 7 and 10 of 10; 6 relevant pages exist in all.
test('precision and recall at k, by hand', () => {
  const rels = [0, 1, 0, 1, 0, 0, 1, 0, 0, 1].map(Boolean);
  near(precisionAtK(rels, 5), 2 / 5); near(recallAtK(rels, 5, 6), 2 / 6);
  near(precisionAtK(rels, 10), 4 / 10); near(recallAtK(rels, 10, 6), 4 / 6);
  near(precisionAtK(rels, 1), 0);
});

// Wikipedia, "Mean reciprocal rank": ranks 3, 2, 1 give (1/3 + 1/2 + 1) / 3 = 11/18 = 0.61.
test('mean reciprocal rank matches the Wikipedia example', () => {
  const q = (rank) => Array.from({ length: 5 }, (_, i) => i === rank - 1);
  near(meanReciprocalRank([q(3), q(2), q(1)]), 11 / 18);
  assert.equal(reciprocalRank([false, false]), 0); // no relevant result contributes 0
});

// Wikipedia, "Evaluation measures (information retrieval)": precision@k ignores the order inside the top k,
// and when fewer than k documents are relevant even a perfect system scores below 1.
test('precision@k ignores order inside the top k; reciprocal rank does not', () => {
  const a = [true, true, false, false], b = [false, false, true, true];
  assert.equal(precisionAtK(a, 4), precisionAtK(b, 4));
  assert.ok(reciprocalRank(a) > reciprocalRank(b));
  near(precisionAtK(a, 2), 1); near(precisionAtK(b, 2), 0);
});

test('a perfect list with fewer than k relevant pages cannot reach precision 1', () => {
  near(bestPrecisionAtK(1, 10), 0.1); near(bestPrecisionAtK(3, 10), 0.3); near(bestPrecisionAtK(10, 10), 1);
  const perfect = Array.from({ length: 10 }, (_, i) => i < 3);
  near(precisionAtK(perfect, 10), 0.3); near(recallAtK(perfect, 10, 3), 1); near(reciprocalRank(perfect), 1);
});

test('default facts: moving the best page to rank 1 lifts reciprocal rank but not precision@5', () => {
  const f = facts(example);
  assert.equal(f.p, '0.40'); assert.equal(f.r, '0.33'); assert.equal(f.rr, '0.50');
  assert.equal(f.rrBest, '1.00'); assert.equal(f.pSwapped, '0.40');
});
