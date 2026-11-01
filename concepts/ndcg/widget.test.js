import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discount, dcg, idealGrades, scoreRanking, pooledScores } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} is not within ${tol} of ${b}`);

// All expected values below are worked by hand from: discount(rank) = 1 / log2(rank + 1), DCG = sum of grade * discount.

test('position discount: rank 1 counts in full, rank 3 counts half (log2 4 = 2)', () => {
  near(discount(1), 1);
  near(discount(2), 1 / Math.log2(3));       // 0.63093
  near(discount(3), 0.5);
  near(discount(4), 1 / Math.log2(5));       // 0.43068
  near(discount(7), 1 / 3);                  // log2 8 = 3
});

test('textbook example (grades 3 2 3 0 1 2): DCG6 = 6.861, ideal = 7.141, nDCG6 = 0.961', () => {
  // DCG6 = 3 + 2/1.58496 + 3/2 + 0/2.32193 + 1/2.58496 + 2/2.80735 = 3 + 1.26186 + 1.5 + 0 + 0.38685 + 0.71241 = 6.86112
  const grades = [3, 2, 3, 0, 1, 2];
  near(dcg(grades, 6), 6.8611, 1e-3);
  // ideal order 3 3 2 2 1 0: 3 + 1.89279 + 1 + 0.86135 + 0.38685 + 0 = 7.14099
  assert.deepEqual(idealGrades(grades, 6), [3, 3, 2, 2, 1, 0]);
  near(dcg(idealGrades(grades, 6), 6), 7.1410, 1e-3);
  near(scoreRanking({ grades, k: 6 }).ndcg, 0.9608, 1e-3);
});

test('k cuts the list: DCG@3 of 3 2 3 0 1 2 is 3 + 1.26186 + 1.5 = 5.76186', () => {
  near(dcg([3, 2, 3, 0, 1, 2], 3), 5.7619, 1e-3);
  near(dcg([3, 2, 3, 0, 1, 2], 1), 3);
});

test('k larger than the list is fine; a perfect order scores exactly 1', () => {
  near(dcg([2, 1], 10), 2 + 1 / Math.log2(3));
  near(scoreRanking({ grades: [3, 2, 1, 0], k: 10 }).ndcg, 1, 1e-12);
});

test('a list with no relevant result scores 0, not NaN', () => {
  assert.equal(scoreRanking({ grades: [0, 0, 0], k: 3 }).ndcg, 0);
});

test('default example: nDCG@5 = 0.4707 and nDCG@10 = 0.7188', () => {
  const grades = example.results.map((r) => r.grade);   // 1 0 3 2 0 2 3 1 0 0
  // DCG5 = 1 + 0 + 3/2 + 2/2.32193 + 0 = 3.36135;  ideal 3 3 2 2 1: 3 + 1.89279 + 1 + 0.86135 + 0.38685 = 7.14099
  const r5 = scoreRanking({ grades, k: 5 });
  near(r5.dcg, 3.3614, 1e-3); near(r5.ideal, 7.1410, 1e-3); near(r5.ndcg, 0.4707, 1e-3);
  // DCG10 = 3.36135 + 2/2.80735 + 3/3 + 1/3.16993 = 5.38931;  ideal10 = 7.14099 + 1/2.80735 = 7.49725
  const r10 = scoreRanking({ grades, k: 10 });
  near(r10.dcg, 5.3893, 1e-3); near(r10.ideal, 7.4972, 1e-3); near(r10.ndcg, 0.7188, 1e-3);
});

test('moving a perfect result to rank 1 raises DCG; the best possible score does not change', () => {
  const grades = example.results.map((r) => r.grade);
  const moved = [grades[2], ...grades.slice(0, 2), ...grades.slice(3)];   // 3 1 0 2 0 2 3 1 0 0
  const before = scoreRanking({ grades, k: 5 }), after = scoreRanking({ grades: moved, k: 5 });
  assert.ok(after.dcg > before.dcg);
  near(after.ideal, before.ideal, 1e-12);
});

test('per-rank rows carry the points the page draws', () => {
  const { rows } = scoreRanking({ grades: [1, 0, 3], k: 2 });
  near(rows[2].points, 1.5);              // 3 * 0.5
  assert.equal(rows[2].counted, false);   // rank 3 is outside k = 2
  assert.equal(rows[0].idealGrade, 3);
});

// Incomplete judgments. Old system: 3 2 1 0 0 (all judged). New system: [new page, 3, 2, 1, 0]; the new page has no label.
test('incomplete judgments: an unlabelled result counts as 0, so the better new system loses', () => {
  const { docs, systemA, systemB, k } = example.breaks;
  const [a, b] = pooledScores({ docs, rankings: [systemA, systemB], k });
  // old: DCG = 3 + 2/1.58496 + 1/2 = 4.76186 = ideal, so nDCG = 1
  near(a.ndcg, 1, 1e-9);
  // new: DCG = 0 + 3/1.58496 + 2/2 + 1/2.32193 + 0 = 3.32349; ideal is still 4.76186 (the unlabelled page is not in it): 0.6979
  near(b.dcg, 3.3235, 1e-3); near(b.ideal, 4.7619, 1e-3); near(b.ndcg, 0.6979, 1e-3);
});

test('once a judge labels the new page a 3, the winner flips', () => {
  const { docs, systemA, systemB, k } = example.breaks;
  const labelled = docs.map((d) => (d.hiddenGrade != null ? { ...d, grade: d.hiddenGrade } : d));
  const [a, b] = pooledScores({ docs: labelled, rankings: [systemA, systemB], k });
  // ideal now 3 3 2 1 0: 3 + 3/1.58496 + 2/2 + 1/2.32193 = 6.32349. New system: 3 + 1.89279 + 1 + 0.43068 = 6.32349 -> nDCG 1
  near(b.ideal, 6.3235, 1e-3); near(b.ndcg, 1, 1e-9);
  near(a.ndcg, 0.7531, 1e-3);   // 4.76186 / 6.32349
  assert.ok(b.ndcg > a.ndcg);
});
