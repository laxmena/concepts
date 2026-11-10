import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { examples, route, sweep, alwaysStrong, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const zs = examples(ex.count, ex.spread);
const go = (T, thr) => route(zs, T, ex.trueT, thr, ex.strongAccuracy, ex.cheapCost, ex.cheapCost * ex.costRatio);

// Reference values from an independent Python script (spread 5, strong model 97% right, cost 1 against 40).
test('calibrated model at a few thresholds', () => {
  const a = go(2, 0.9);
  near(a.share, 0.38); near(a.cheapAccuracy, 0.958972, 5e-6); near(a.saidAccuracy, a.cheapAccuracy, 1e-12); near(a.accuracy, 0.965809, 5e-6); near(a.cost, 0.645, 1e-9);
  const b = go(2, 0.95);
  near(b.share, 0.238); near(b.accuracy, 0.971997, 5e-6); near(b.cost, 0.787, 1e-9);
});

test('an overconfident model hands over too much and says more than is true', () => {
  const o = go(1, 0.9), c = go(2, 0.9);
  near(o.share, 0.66); near(o.cheapAccuracy, 0.904445, 5e-6); near(o.saidAccuracy, 0.979518, 5e-6); near(o.accuracy, 0.926734, 5e-6); near(o.cost, 0.365, 1e-9);
  assert.ok(o.saidAccuracy - o.cheapAccuracy > 0.07);
  assert.ok(o.accuracy < c.accuracy && o.cost < c.cost);
});

test('ends of the range: always cheap, and never sure enough', () => {
  const alone = go(2, 0.5);
  near(alone.share, 1); near(alone.accuracy, 0.810812, 5e-6); near(alone.cost, 1 / 40);
  const none = go(2, 1.01);
  assert.equal(none.share, 0); assert.equal(none.cheapAccuracy, null); near(none.accuracy, 0.97); near(none.cost, 1.025);
  assert.deepEqual(alwaysStrong(ex), { cost: 1, accuracy: 0.97 });
});

test('calibration does not change the frontier, only what a threshold means', () => {
  // The overconfident model at 90% hands over the 66% most confident decisions. A calibrated model hands over the same decisions at a lower bar.
  const o = go(1, 0.9);
  let found = null;
  for (let thr = 0.5; thr < 1; thr += 0.0005) { const c = go(2, thr); if (Math.abs(c.share - o.share) < 1e-9) { found = c; break; } }
  assert.ok(found);
  near(found.accuracy, o.accuracy, 1e-12);
  near(found.cost, o.cost, 1e-12);
  near(found.cheapAccuracy, o.cheapAccuracy, 1e-12);
});

test('a higher bar costs more and, for a calibrated model, loses less accuracy', () => {
  const pts = sweep(ex, zs, 2);
  for (let i = 1; i < pts.length; i++) { assert.ok(pts[i].share >= pts[i - 1].share - 1e-12); assert.ok(pts[i].cost <= pts[i - 1].cost + 1e-12); }
  assert.equal(pts[0].share, 0);
  near(pts[pts.length - 1].share, 1);
  // the same points for a different temperature
  const other = sweep(ex, zs, 1);
  pts.forEach((p, i) => { near(p.cost, other[i].cost, 1e-12); near(p.accuracy, other[i].accuracy, 1e-12); });
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.share, '38%');
  assert.equal(f.acc, '96.6%');
  assert.equal(f.cost, '64.5%');
  assert.equal(f.saving, '36%');
  assert.equal(f.bShare, '66%');
  assert.equal(f.bAcc, '92.7%');
  assert.equal(f.aloneAcc, '81%');
});
