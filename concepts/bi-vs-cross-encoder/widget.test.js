import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matrixPasses, pairsToScore, searchMs, rerankMs, totalPasses, payoffQuery, formatDuration, sliderToN } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const opts = { passMs: ex.passMs, compareMs: ex.compareMs };   // 10 ms per model pass, 1 microsecond per comparison (illustrative)
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} is not within ${tol} of ${b}`);

test('passes for D documents and Q queries: bi-encoder D + Q, cross-encoder D x Q', () => {
  assert.deepEqual(matrixPasses(6, 6), { bi: 12, cross: 36 });
  assert.deepEqual(matrixPasses(1000, 1000), { bi: 2000, cross: 1000000 });
  assert.deepEqual(matrixPasses(1, 1), { bi: 2, cross: 1 });   // with one document and one query, saving buys nothing
});

test('pairs to score in a collection of n items: n(n-1)/2. For 10,000 sentences that is 49,995,000', () => {
  // The Sentence-BERT paper says "about 50 million inference computations (~65 hours)" for 10,000 sentences.
  assert.equal(pairsToScore(10000), 49995000);
  assert.equal(pairsToScore(2), 1);
});

test('time for one search at N = 1,000: bi 10 + 1000 x 0.001 = 11 ms, cross 1000 x 10 = 10,000 ms', () => {
  const t = searchMs(1000, opts);
  near(t.bi, 11); near(t.cross, 10000);
});

test('time for one search at N = 1,000,000: bi 10 + 1000 = 1,010 ms, cross 10,000,000 ms', () => {
  const t = searchMs(1e6, opts);
  near(t.bi, 1010); near(t.cross, 1e7);
});

test('retrieve then rerank the top 100 of a million: 1,010 + 100 x 10 = 2,010 ms; K is capped at N', () => {
  near(rerankMs(1e6, 100, opts), 2010);
  near(rerankMs(50, 100, opts), 10 + 50 * 0.001 + 50 * 10);   // only 50 documents exist to rerank
});

test('running totals of model passes after q searches: bi N + q, cross q x N', () => {
  assert.deepEqual(totalPasses(1000, 0), { bi: 1000, cross: 0 });
  assert.deepEqual(totalPasses(1000, 1), { bi: 1001, cross: 1000 });
  assert.deepEqual(totalPasses(1000, 2), { bi: 1002, cross: 2000 });
});

test('saving pays off from the second search for N >= 3 (N + q < N q), and from the third for N = 2', () => {
  assert.equal(payoffQuery(1000), 2);
  assert.equal(payoffQuery(3), 2);    // 3 + 2 = 5 < 6
  assert.equal(payoffQuery(2), 3);    // 2 + 2 = 4 is not < 4; 2 + 3 = 5 < 6
});

test('durations read the way a person would say them', () => {
  assert.equal(formatDuration(0.4), '<1 ms');
  assert.equal(formatDuration(5.55), '5.5 ms');
  assert.equal(formatDuration(11), '11 ms');
  assert.equal(formatDuration(1010), '1.0 s');
  assert.equal(formatDuration(10000), '10 s');
  assert.equal(formatDuration(5 * 60000), '5.0 min');
  assert.equal(formatDuration(1e7), '2.8 hours');          // 10,000 s / 3,600
  assert.equal(formatDuration(3 * 86400000), '3.0 days');
});

test('slider position is a power of ten: 3 -> 1,000; 6 -> 1,000,000; 3.25 -> 1,778', () => {
  assert.equal(sliderToN(1), 10);
  assert.equal(sliderToN(3), 1000);
  assert.equal(sliderToN(3.25), 1778);   // 10^3.25 = 1778.28
  assert.equal(sliderToN(6), 1000000);
});
