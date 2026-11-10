import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { examples, reliability, ece, atLeast, verdict, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const zs = examples(ex.count, ex.spread);

// Reference values from an independent Python script (statistics.NormalDist for the quantiles, plain loops for the bins).
test('error at a few temperatures matches the Python reference', () => {
  near(ece(reliability(zs, 1, 2)), 0.103137, 5e-6);
  near(ece(reliability(zs, 2, 2)), 0, 1e-12);
  near(ece(reliability(zs, 4, 2)), 0.07892, 5e-6);
  near(ece(reliability(zs, 2, 4)), 0.07892, 5e-6); // the same temperature ratio, the other way round
});

test('what a threshold would act on: 272 decisions at T = 1, 28 on a new kind of input at T = 2', () => {
  const a = atLeast(zs, 1, 2, 0.9);
  assert.equal(a.n, 272);
  near(a.said, 0.950628, 5e-6);
  near(a.right, 0.824609, 5e-6);
  const b = atLeast(zs, 2, 4, 0.9);
  assert.equal(b.n, 28);
  near(b.said, 0.924702, 5e-6);
  near(b.right, 0.77992, 5e-6);
  assert.equal(atLeast(zs, 1, 2, 1.1).said, null);
});

test('a calibrated model is right as often as it says, in every group', () => {
  for (const b of reliability(zs, 2, 2).filter((x) => x.count)) near(b.acc, b.conf, 1e-12);
  assert.equal(verdict(2, 2), 'calibrated');
  assert.equal(verdict(1, 2), 'overconfident');
  assert.equal(verdict(3, 2), 'underconfident');
});

test('temperature never changes which answer wins, only the numbers', () => {
  for (const z of [-3, -0.1, 0.1, 5]) for (const T of [0.5, 1, 2, 4]) assert.equal(sigmoid(z / T) > 0.5, z > 0);
  assert.ok(confidence(2, 4) < confidence(2, 1)); // softer, but still on the same side
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.ece1, '10.3%');
  assert.equal(f.eceFixed, '0.0%');
  assert.equal(f.said90, '95%');
  assert.equal(f.right90, '82%');
  assert.equal(f.bEceNew, '7.9%');
});

import { confidence, sigmoid } from '../../shared/decision.js';
