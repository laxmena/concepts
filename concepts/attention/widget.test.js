import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dot, softmax, attend, plainAverage, scoreCount, tableBytes, contextLength, formatCount, formatBytes, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('softmax: known values', () => {
  near(softmax([0, 0])[0], 0.5);
  const s = softmax([1, 2, 3]); // e / (e + e^2 + e^3), worked in Python's math.exp
  near(s[0], 0.09003057317038046, 1e-12); near(s[1], 0.24472847105479764, 1e-12); near(s[2], 0.6652409557748219, 1e-12);
  near(softmax([1000, 1001])[1], 1 / (1 + Math.exp(-1)), 1e-12); // large scores do not overflow
});

test('dot product', () => assert.equal(dot([2, 2], [0.05, 1]), 2.1));

// Reference values computed in Python 3 (math.exp), with the query (2, 2).
test('river sentence, divisor 1', () => {
  const s = example.sentences.river, r = attend(example.queryVector, s.words, 1);
  [0.070734, 0.086395, 0.057912, 0.047415, 0.387195, 0.350349].forEach((w, i) => near(r.weights[i], w));
  near(r.output[0], 0.213143); near(r.output[1], 0.589618);
});
test('loan sentence, divisor 1 and 4', () => {
  const s = example.sentences.loan;
  const a = attend(example.queryVector, s.words, 1), b = attend(example.queryVector, s.words, 4);
  [0.060317, 0.270323, 0.040432, 0.298754, 0.330174].forEach((w, i) => near(a.weights[i], w));
  near(a.output[0], 0.728873); near(a.output[1], 0.185433);
  near(b.output[0], 0.577473); near(b.output[1], 0.155948);
});
test('weights sum to 1, and a bigger divisor spreads them out', () => {
  for (const s of Object.values(example.sentences)) {
    let last = 2;
    for (const d of [0.5, 1, 2, 4, 100]) {
      const w = attend(example.queryVector, s.words, d).weights;
      near(w.reduce((a, b) => a + b, 0), 1, 1e-12);
      assert.ok(Math.max(...w) < last); last = Math.max(...w);
    }
    near(Math.max(...attend(example.queryVector, s.words, 1e9).weights), 1 / s.words.length, 1e-6);
  }
});
test('plain average is the mean of the vectors', () => {
  const w = example.sentences.loan.words;
  near(plainAverage(w)[0], (0.1 + 0.9 + 0 + 0.5 + 1) / 5, 1e-12);
  near(plainAverage(w)[1], (0.1 + 0.05 + 0 + 0.5 + 0.05) / 5, 1e-12);
});
test('the same word moves in opposite directions in the two sentences', () => {
  const f = facts(example);
  assert.equal(f.riverLeans, 'nature'); assert.equal(f.loanLeans, 'money');
  assert.equal(f.riverTop, 'river'); assert.equal(f.loanTop, 'loan');
});

// 2^15 = 32,768; 32,768^2 = 1,073,741,824 scores; at 2 bytes each 2,147,483,648 bytes.
test('cost of the table', () => {
  assert.equal(contextLength(15), 32768);
  assert.equal(scoreCount(32768), 1073741824);
  assert.equal(tableBytes(32768), 2147483648);
  assert.equal(scoreCount(2 * 4096) / scoreCount(4096), 4);
  assert.equal(formatCount(1073741824), '1.1 billion');
  assert.equal(formatBytes(2147483648), '2.1 GB');
  assert.equal(formatBytes(tableBytes(131072)), '34 GB'); // 131,072^2 x 2 = 34,359,738,368
  assert.equal(formatBytes(tableBytes(contextLength(20))), '2.2 TB');
});
