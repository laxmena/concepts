import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { levels, quantizeGroup, quantize, rms, relativeError, bitsPerWeight, modelBytes, measure, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('levels: 2 bits give -1..1, 4 bits give -7..7, 8 bits give -127..127', () => {
  assert.deepEqual([2, 3, 4, 8].map(levels), [1, 3, 7, 127]);
});

// By hand, 4 bits: scale = 1 / 7. 1 -> 7, -0.5 -> -3.5 -> -4 (ties go away from zero), 0.26 -> 1.82 -> 2, 0 -> 0.
test('rounding worked by hand', () => {
  const r = quantizeGroup([1, -0.5, 0.26, 0], 4);
  assert.deepEqual(r.q, [7, -4, 2, 0]);
  near(r.scale, 1 / 7);
  near(r.deq[1], -4 / 7);
  // 2 bits: scale = 0.9. 0.6 -> 0.667 -> 1, -0.2 -> -0.222 -> 0, 0.9 -> 1.
  assert.deepEqual(quantizeGroup([0.6, -0.2, 0.9], 2).q, [1, 0, 1]);
  assert.deepEqual(quantizeGroup([0, 0], 4).q, [0, 0]);
});

test('every group gets its own scale', () => {
  const r = quantize([1, 0.5, 0.01, 0.005], 3, 2);
  assert.deepEqual(r.q, [3, 2, 3, 2]);
  near(r.scales[0], 1 / 3);
  near(r.scales[1], 0.01 / 3);
});

test('size: bits per weight and bytes', () => {
  assert.equal(bitsPerWeight(4), 4);
  assert.equal(bitsPerWeight(4, 32), 4.5);
  assert.equal(bitsPerWeight(4, 8), 6);
  assert.equal(modelBytes(7e9, 16), 14e9);
  assert.equal(modelBytes(7e9, 4), 3.5e9);
});

test('error of a perfect copy is zero, and it never grows with more bits', () => {
  assert.equal(relativeError([1, 2, 3], [1, 2, 3]), 0);
  let last = Infinity;
  for (let b = 2; b <= 8; b++) { const m = measure(ex, b, 'row', false); assert.ok(m.rel < last); last = m.rel; }
});

// Expected values come from an independent Python implementation (math.floor, lists, no shared code), same 64 weights.
test('matches the independent Python reference', () => {
  const cases = [
    [4, 'row', false, 0.139027, 15], [4, 'row', true, 0.638387, 46], [4, 'g32', true, 0.449960, 31], [4, 'g8', true, 0.218348, 17],
    [2, 'row', true, 1.0, 63], [3, 'row', true, 0.926208, 61], [8, 'row', false, 0.007321, 2], [8, 'g8', true, 0.011746, 2],
  ];
  for (const [bits, scale, outlier, rel, zeros] of cases) {
    const m = measure(ex, bits, scale, outlier);
    near(m.relSmall, rel, 5e-7);
    assert.equal(m.zeros, zeros, `${bits} bits, ${scale}, outlier ${outlier}`);
  }
});

test('one large weight hurts a shared scale, and smaller groups contain the damage', () => {
  const row = measure(ex, 4, 'row', true).relSmall, g32 = measure(ex, 4, 'g32', true).relSmall, g8 = measure(ex, 4, 'g8', true).relSmall;
  assert.ok(row > g32 && g32 > g8);
  assert.ok(row > 4 * measure(ex, 4, 'row', false).relSmall);
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.size, '3.5 GB');
  assert.equal(f.size16, '14 GB');
  assert.equal(f.ratio, '4.0×');
  assert.equal(f.bZerosRow, '46');
  assert.equal(f.bSmall, '63');
  assert.equal(f.bBpw8, '6.0');
  near(rms(ex.weights), 0.0212, 0.002);
});
