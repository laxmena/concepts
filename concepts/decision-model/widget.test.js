import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { softmax, options, decide, passes, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('softmax adds up to 1, keeps the order, and ignores a shift of all scores', () => {
  const p = softmax([1, 2, 3]);
  near(p.reduce((a, b) => a + b, 0), 1);
  assert.ok(p[0] < p[1] && p[1] < p[2]);
  softmax([101, 102, 103]).forEach((v, i) => near(v, p[i]));
  softmax([1000, 1001]).forEach((v) => assert.ok(Number.isFinite(v)));
  near(softmax([0, 0, 0, 0])[2], 0.25);
});

// Reference values from an independent Python softmax.
test('probabilities match the Python reference', () => {
  const a = decide(ex, 0, false);
  [0.92736, 0.062324, 0.008435, 0.001882].forEach((v, i) => near(a.probs[i], v, 5e-7));
  assert.equal(a.labels[a.best], 'Math');
  const b = decide(ex, 2, false), c = decide(ex, 2, true);
  [0.110643, 0.669353, 0.054944, 0.16506].forEach((v, i) => near(b.probs[i], v, 5e-7));
  [0.039242, 0.237402, 0.019487, 0.058543, 0.645326].forEach((v, i) => near(c.probs[i], v, 5e-7));
});

test('a closed list always has a winner; an explicit none option can win when nothing fits', () => {
  const closed = decide(ex, 2, false), open = decide(ex, 2, true);
  assert.equal(closed.labels[closed.best], 'Search');
  assert.ok(closed.confidence > 0.6);
  assert.equal(open.labels[open.best], 'None');
  assert.equal(options(ex, 2, true).labels.length, 5);
  near(closed.margin, closed.confidence - closed.second);
});

test('passes and facts', () => {
  assert.deepEqual(passes(ex, 0), { decision: 1, written: 12 });
  const f = facts(ex);
  assert.equal(f.topP, '93%');
  assert.equal(f.bTop, 'Search');
  assert.equal(f.bTopP, '67%');
  assert.equal(f.bNone, '65%');
  assert.equal(f.bNoneLabel, 'None');
});
