import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoreStats, omega2, diffStats, questionsNeeded, minDetectable, simpleVsWilson, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Worked by hand: p = 0.7, n = 400, SE = sqrt(0.21 / 400) = 0.022913, half-width = 1.96 * SE = 0.044908.
test('score range is score ± 1.96 standard errors', () => {
  const s = scoreStats(0.7, 400);
  near(s.se, 0.0229129, 1e-6); near(s.half, 0.0449088, 1e-6);
  near(s.low, 0.6550912, 1e-6); near(s.high, 0.7449088, 1e-6);
});

// Independent Python check: A = 0.80, B = 0.82, n = 400. Unpaired SE 0.0277308; paired SE with rho 0.5 is 0.0196166, with 0.8 is 0.0124218.
test('paired standard error falls as the models agree more', () => {
  const base = { pA: 0.8, pB: 0.82, n: 400 };
  near(diffStats({ ...base, paired: false, rho: 0.5 }).se, 0.0277308, 1e-6);
  near(diffStats({ ...base, paired: true, rho: 0.5 }).se, 0.0196166, 1e-6);
  near(diffStats({ ...base, paired: true, rho: 0.8 }).se, 0.0124218, 1e-6);
  near(diffStats({ ...base, paired: true, rho: 0 }).se, diffStats({ ...base, paired: false, rho: 0.9 }).se, 1e-12);
});

// Miller (2024), section 5: omega^2 = 1/9, delta = 0.03, alpha = 0.05, beta = 0.20 gives n of about 969.
test('questions needed matches the worked example in Miller (2024): 969', () => {
  const n = questionsNeeded({ delta: 0.03, omega2: 1 / 9 });
  near(n, 968.9975, 1e-3);
  assert.equal(Math.ceil(n), 969);
});

// Miller (2024), section 5: sigma^2 = 1/6, omega^2 = 1/9, n = 198. The paper reports MDE 13.2% (K = 1) and 7.5% (K = 10).
// Computed exactly: 13.27% and 7.57%. The paper's figures are truncated, so we allow 0.2 points.
test('minimum detectable effect matches the paper to within rounding, and inverts the sample-size formula', () => {
  const base = { n: 198, omega2: 1 / 9, sigmaA2: 1 / 6, sigmaB2: 1 / 6 };
  near(minDetectable({ ...base, kA: 1, kB: 1 }), 0.1327333, 1e-6);
  near(minDetectable({ ...base, kA: 10, kB: 10 }), 0.0756696, 1e-6);
  near(minDetectable({ ...base, kA: 1, kB: 1 }), 0.132, 0.002);
  near(minDetectable({ ...base, kA: 10, kB: 10 }), 0.075, 0.002);
  const delta = 0.05;
  near(minDetectable({ n: questionsNeeded({ delta, omega2: 0.2 }), omega2: 0.2 }), delta, 1e-12);
});

test('omega^2 for two models that never disagree is 0', () => {
  near(omega2({ pA: 0.8, pB: 0.8, rho: 1 }), 0, 1e-12);
});

test('a perfect score: simple range has no width, Wilson does (independent Python values)', () => {
  const w = simpleVsWilson(20, 20);
  assert.equal(w.simple.low, 1); assert.equal(w.simple.high, 1);
  near(w.wilson.low, 0.8388748, 1e-6);
  near(simpleVsWilson(100, 100).wilson.low, 0.9630, 1e-3);
});

test('default facts: 78% vs 82% on 200 questions cannot be told apart, 1,000 can', () => {
  const f = facts(example);
  assert.equal(f.gap, '+4.0');
  assert.ok(f.gapLow.startsWith('−') && f.gapHigh.startsWith('+'), 'range includes 0 at n = 200');
  assert.ok(f.gapLow1000.startsWith('+'), 'range excludes 0 at n = 1000');
});
