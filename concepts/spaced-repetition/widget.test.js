import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recall, gain, daysUntil, makeSchedule, recallAt, beforeEach, lowestBefore, curvePoints, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const p = { ...ex, target: 0.9 };

// By definition S is the time for recall to fall to 90%.
test('recall and stability', () => {
  near(recall(0, 3), 1);
  near(recall(3, 3), 0.9);
  near(recall(6, 3), 0.81);
  near(daysUntil(0.9, 3), 3);
  near(gain(0.9, 6), 1.6);
  near(gain(1, 6), 1);
  near(gain(0.5, 6), 4);
});

// By hand: a review at 90% recall multiplies stability by 1.6, and the next gap is as long as the stability.
// Study on day 0 (S 1), day 1 (S 1.6), day 2.6 (S 2.56), day 5.16 (S 4.096).
test('just-in-time reviews expand by 1.6 each time', () => {
  const s = makeSchedule('expanding', 4, p);
  [0, 1, 2.6, 5.16].forEach((t, i) => near(s.times[i], t, 1e-9));
  [1, 1.6, 2.56, 4.096].forEach((v, i) => near(s.S[i], v, 1e-9));
  beforeEach(s).forEach((r) => near(r, 0.9));
});

// By hand: S0 = 0.5 and a review after 3 days gives 0.9^(3 / 0.5) = 0.9^6 = 0.531441. With S0 = 6 it is 0.9^0.5.
test('a fixed gap is too slow for a slippery item and too fast for a sticky one', () => {
  near(lowestBefore(makeSchedule('fixed', 8, { ...p, S0: 0.5 })), 0.531441, 1e-9);
  near(lowestBefore(makeSchedule('fixed', 8, { ...p, S0: 6 })), 0.948683298, 1e-8);
  assert.equal(lowestBefore(makeSchedule('fixed', 1, p)), null);
});

// Expected values from an independent Python implementation (plain lists, same constants).
test('matches the independent Python reference at day 60', () => {
  near(recallAt(60, makeSchedule('cram', 6, p)), 0.003818444, 1e-6);
  near(recallAt(60, makeSchedule('fixed', 6, p)), 0.621014347, 1e-6);
  near(recallAt(60, makeSchedule('expanding', 6, p)), 0.641450379, 1e-6);
  near(makeSchedule('expanding', 6, p).times[5], 15.8096, 1e-9);
});

test('cramming helps almost nothing, because recall is still near 100% at each review', () => {
  const c = makeSchedule('cram', 8, p);
  assert.ok(c.S[7] < 1.25);
  assert.equal(recallAt(-1, c), null);
});

test('curve: saw-tooth with a drop and a jump at each study', () => {
  const s = makeSchedule('fixed', 3, p);
  const pts = curvePoints(s, 10);
  assert.deepEqual(pts[0], [0, 1]);
  const at3 = pts.filter(([t]) => t === 3);
  assert.equal(at3.length, 2);
  assert.ok(at3[0][1] < 1 && at3[1][1] === 1);
  assert.equal(pts[pts.length - 1][0], 10);
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.expEnd, '64%');
  assert.equal(f.fixedEnd, '62%');
  assert.equal(f.cramEnd, '<1%');
  assert.equal(f.gainAt90, '1.6');
  assert.equal(f.bFixedLow, '53%');
  assert.equal(f.bExpLow, '90%');
});
