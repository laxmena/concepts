import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalQuantile, normalCdf, zTwoSided, seBernoulli, wilson, mulberry32, chooseRatio, normalSample } from './stats.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('normal quantiles match standard tables', () => {
  near(normalQuantile(0.975), 1.959963985, 1e-8);
  near(normalQuantile(0.8), 0.841621234, 1e-8);
  near(normalQuantile(0.9), 1.281551566, 1e-8);
  near(normalQuantile(0.995), 2.575829304, 1e-8);
  near(normalQuantile(0.5), 0, 1e-12);
  near(normalQuantile(0.01), -2.326347874, 1e-8);
  near(zTwoSided(0.95), 1.959963985, 1e-8);
});

test('normal CDF matches tables and inverts the quantile', () => {
  near(normalCdf(0), 0.5, 1e-7);
  near(normalCdf(1.96), 0.9750021, 1e-6);
  near(normalCdf(-1.96), 0.0249979, 1e-6);
  for (const p of [0.01, 0.2, 0.5, 0.9, 0.999]) near(normalCdf(normalQuantile(p)), p, 1e-6);
});

test('Bernoulli standard error: p = 0.7, n = 400 gives 0.0229', () => {
  near(seBernoulli(0.7, 400), 0.0229129, 1e-6);
});

// Reference values worked out independently in Python (math.sqrt) from the Wilson (1927) formula quoted on Wikipedia.
test('Wilson interval', () => {
  const w = wilson(0.8, 100);
  near(w.low, 0.7111708, 1e-6); near(w.high, 0.8666331, 1e-6);
  const all = wilson(1, 20);
  near(all.low, 0.8388748, 1e-6); near(all.high, 1, 1e-12);
  const none = wilson(0, 10);
  near(none.low, 0, 1e-12); near(none.high, 0.2775328, 1e-6);
});

test('seeded random numbers repeat and stay in [0, 1)', () => {
  const a = mulberry32(7), b = mulberry32(7);
  for (let i = 0; i < 5; i++) { const x = a(); assert.equal(x, b()); assert.ok(x >= 0 && x < 1); }
});

test('chooseRatio equals C(c,k)/C(n,k): C(3,2)/C(10,2) = 3/45', () => {
  near(chooseRatio(10, 3, 2), 3 / 45, 1e-12);
  assert.equal(chooseRatio(10, 1, 2), 0);
  near(chooseRatio(8, 8, 8), 1, 1e-12);
});

test('normal draws have mean 0 and variance 1', () => {
  const rng = mulberry32(11); let sum = 0, sq = 0; const n = 100000;
  for (let i = 0; i < n; i++) { const x = normalSample(rng); sum += x; sq += x * x; }
  near(sum / n, 0, 0.02); near(sq / n, 1, 0.03);
});
