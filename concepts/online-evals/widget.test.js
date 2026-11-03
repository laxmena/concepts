import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../../shared/stats.js';
import { sampleSizePerArm, minDetectableLift, daysNeeded, simulateAA, falseWinRate, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Independent Python check of n = (1.959964 + 0.841621)^2 * (p0(1-p0) + p1(1-p1)) / delta^2.
test('sample size per arm', () => {
  near(sampleSizePerArm({ p0: 0.1, delta: 0.02 }), 3838.1016, 1e-2);
  near(sampleSizePerArm({ p0: 0.1, delta: 0.005 }), 57759.896, 0.5);
  near(sampleSizePerArm({ p0: 0.3, delta: 0.03 }), 3759.6128, 1e-2);
});

test('more power or a smaller lift needs more users; a bigger lift needs fewer', () => {
  const base = { p0: 0.1, delta: 0.02 };
  assert.ok(sampleSizePerArm({ ...base, power: 0.9 }) > sampleSizePerArm(base));
  assert.ok(sampleSizePerArm({ ...base, delta: 0.01 }) > 3 * sampleSizePerArm(base));
  assert.ok(sampleSizePerArm({ ...base, delta: 0.04 }) < sampleSizePerArm(base));
});

test('minimum detectable lift inverts the sample-size formula', () => {
  for (const [p0, delta] of [[0.1, 0.02], [0.3, 0.03], [0.05, 0.01]]) near(minDetectableLift({ p0, nPerArm: sampleSizePerArm({ p0, delta }) }), delta, 1e-6);
});

test('days: two arms share the daily users', () => { assert.equal(daysNeeded(3839, 1000), 8); assert.equal(daysNeeded(500, 1000), 1); });

// Independent Python Monte Carlo (60,000 tests each): 1 look 0.0503, 2 looks 0.083, 5 looks 0.1415, 10 looks 0.192, 20 looks 0.2476.
// These match the classic repeated-significance-test results. Our run uses 20,000 tests, so we allow 0.015.
test('peeking inflates the false win rate', () => {
  const ref = { 1: 0.05, 2: 0.083, 5: 0.1415, 10: 0.192, 20: 0.2476 };
  for (const [looks, want] of Object.entries(ref)) near(falseWinRate(Number(looks), 20000, 7), want, 0.015);
  assert.ok(falseWinRate(20, 20000, 7) > falseWinRate(5, 20000, 7));
});

test('simulated A/A path is repeatable and the page example crosses at check 3 then falls back', () => {
  const a = simulateAA(mulberry32(example.breaks.pathSeed), 10), b = simulateAA(mulberry32(example.breaks.pathSeed), 10);
  assert.deepEqual(a, b);
  assert.equal(a.firstCrossing, 3);
  assert.ok(Math.abs(a.z.at(-1)) < 1.96);
});

test('default facts', () => {
  const f = facts(example);
  assert.equal(f.n, '3,839'); assert.equal(f.days, '8'); assert.equal(f.miller, '26.1');
  assert.ok(Number(f.ratio) > 14 && Number(f.ratio) < 16);
});
