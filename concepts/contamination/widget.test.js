import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { publicScore, freshScore, gap, gapZ, ranks, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// By hand: memorise 10% of the questions, real ability 70%. Public = 0.10 + 0.90 * 0.70 = 0.73, fresh = 0.70, gap = 0.10 * 0.30 = 0.03.
test('public score, fresh score and gap', () => {
  near(publicScore(0.7, 0.1), 0.73); near(freshScore(0.7), 0.7); near(gap(0.7, 0.1), 0.03);
  near(gap(0.7, 0), 0); near(gap(0.9, 0.2), 0.02); // a strong model gains less from memorising
  for (const a of [0.5, 0.8]) for (const m of [0, 0.1, 0.3]) near(gap(a, m), m * (1 - a));
});

// Independent Python: SE_pub = sqrt(.73 * .27 / 1205) = 0.012790, SE_fresh = sqrt(.7 * .3 / 1205) = 0.013201,
// SE_gap = 0.018381, z = 0.03 / 0.018381 = 1.632. At m = 0.2: public 0.76, gap 0.06, z = 3.3249.
test('the gap at 10% memorised is within noise on 1,205 questions; at 20% it is not', () => {
  near(gapZ(0.7, 0.1, 1205), 1.632, 2e-3);
  near(gapZ(0.7, 0.2, 1205), 3.3249, 5e-4);
  assert.ok(gapZ(0.7, 0.1, 1205) < 1.96 && gapZ(0.7, 0.2, 1205) > 1.96);
  assert.ok(gapZ(0.7, 0.1, 5000) > 1.96, 'more questions make the same gap visible');
});

test('ranks: 1 is best, ties share a rank', () => {
  assert.deepEqual(ranks([0.72, 0.7]), [1, 2]); assert.deepEqual(ranks([0.7, 0.7, 0.5]), [1, 1, 3]);
});

test('model X is ahead on the public test only when it has memorised enough', () => {
  const f = facts(example);
  assert.equal(f['pubFirst.0'], 'Model Y'); assert.equal(f['pubFirst.0.1'], 'Model Y');
  assert.equal(f['pubFirst.0.2'], 'Model X'); assert.equal(f['pubFirst.0.3'], 'Model X');
  for (const s of example.breaks.shares) assert.equal(f[`freshFirst.${s}`], 'Model Y');
});

test('paper numbers and default facts', () => {
  const f = facts(example);
  assert.equal(f.problems, '1,205'); assert.equal(f.drop, '8'); assert.equal(f.spearman, '0.36');
  assert.equal(f.pub, '73.0%'); assert.equal(f.gap, '+3.0'); assert.equal(f.z, '1.6'); assert.equal(f.z20, '3.3');
});
