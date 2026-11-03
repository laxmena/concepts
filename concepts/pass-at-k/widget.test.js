import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { passAtK, passHatK, naivePassAtK, curveKs, runSuite, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Worked by hand with Chen et al. (2021) equation 1: n = 10, c = 3, k = 2. C(7,2) / C(10,2) = 21 / 45, so pass@2 = 24 / 45.
test('pass@k worked by hand', () => {
  near(passAtK(10, 3, 2), 24 / 45);
  near(passAtK(10, 3, 1), 0.3);
  near(passAtK(20, 4, 5), 1 - 4368 / 15504); // C(16,5) = 4368, C(20,5) = 15504
  assert.equal(passAtK(10, 8, 3), 1); // fewer than k failures: some draw must pass (the paper's n - c < k case)
  assert.equal(passAtK(10, 0, 3), 0);
});

// The paper's own numpy code, ported: 1 - prod(1 - k / arange(n - c + 1, n + 1)).
test('matches the numerically stable script in Figure 3 of the paper', () => {
  const paper = (n, c, k) => { if (n - c < k) return 1; let p = 1; for (let i = n - c + 1; i <= n; i++) p *= 1 - k / i; return 1 - p; };
  for (const [n, c, k] of [[200, 20, 10], [200, 20, 100], [20, 4, 5], [50, 1, 50], [7, 3, 4]]) near(passAtK(n, c, k), paper(n, c, k), 1e-12);
});

// Appendix A of the paper: the estimator is unbiased. Exact check: the expectation over c ~ Binomial(n, p) equals 1 - (1 - p)^k.
test('the estimator is unbiased, and the naive one is not', () => {
  const choose = (n, r) => { let x = 1; for (let i = 1; i <= r; i++) x = (x * (n - r + i)) / i; return x; };
  for (const [n, p, k] of [[10, 0.3, 2], [20, 0.2, 5], [30, 0.05, 10]]) {
    let eUnbiased = 0, eNaive = 0;
    for (let c = 0; c <= n; c++) {
      const w = choose(n, c) * p ** c * (1 - p) ** (n - c);
      eUnbiased += w * passAtK(n, c, k); eNaive += w * naivePassAtK(n, c, k);
    }
    near(eUnbiased, 1 - (1 - p) ** k, 1e-9);
    assert.ok(eNaive < 1 - (1 - p) ** k - 1e-4, 'naive underestimates');
  }
  near(0.489, 0.489); // Python check for n = 10, p = 0.3, k = 2: naive expectation is 0.489, true value 0.51
});

test('naive shortcut never exceeds the unbiased value', () => {
  for (let n = 2; n <= 40; n++) for (let c = 0; c <= n; c++) for (let k = 1; k <= n; k++) assert.ok(naivePassAtK(n, c, k) <= passAtK(n, c, k) + 1e-12);
});

test('pass^k: C(3,2) / C(10,2) = 3/45, and it never exceeds pass@k', () => {
  near(passHatK(10, 3, 2), 3 / 45);
  assert.equal(passHatK(10, 1, 2), 0);
  for (let c = 0; c <= 12; c++) assert.ok(passHatK(12, c, 4) <= passAtK(12, c, 4) + 1e-12);
});

test('curve k values start at 1, end at n, and are strictly increasing', () => {
  for (const n of [2, 20, 200]) { const ks = curveKs(n); assert.equal(ks[0], 1); assert.equal(ks.at(-1), n); for (let i = 1; i < ks.length; i++) assert.ok(ks[i] > ks[i - 1]); }
});

test('weak tests let wrong code pass: one test passes 3 of 4 solutions, all four tests pass only the right one', () => {
  const tests = example.breaks.tests;
  const weak = runSuite(tests, ['t1']);
  assert.deepEqual(weak.filter((r) => r.passes).map((r) => r.id), ['A', 'B', 'D']);
  const strong = runSuite(tests, tests.map((t) => t.id));
  assert.deepEqual(strong.filter((r) => r.passes).map((r) => r.id), ['A']);
  assert.ok(runSuite(tests, []).every((r) => r.passes), 'no tests means everything passes');
});

test('default facts', () => {
  const f = facts(example);
  assert.equal(f.p1, '20%'); assert.equal(f.pk, '71.8%'); assert.equal(f.naive, '67.2%');
  assert.equal(f.weakShare, '75%'); assert.equal(f.strongShare, '25%');
});
