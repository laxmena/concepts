import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sigmoid, examples, confidence, chanceRight, reliability, ece, route } from './decision.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

test('sigmoid, confidence and chance right', () => {
  near(sigmoid(0), 0.5);
  near(sigmoid(2), 0.8807970779778823);
  near(confidence(-2, 1), 0.8807970779778823); // a "no" call is as confident as the mirror "yes"
  near(confidence(3, 1.5), sigmoid(2));
  near(chanceRight(-4, 2), sigmoid(2));
});

test('a model whose temperature equals the true one is calibrated', () => {
  const zs = examples(1000);
  const bins = reliability(zs, 2, 2);
  for (const b of bins.filter((x) => x.count)) near(b.conf, b.acc, 1e-12);
  near(ece(bins), 0, 1e-12);
});

test('too sharp is overconfident, too soft is underconfident, and the error grows with the gap', () => {
  const zs = examples(1000);
  const over = reliability(zs, 1, 2), under = reliability(zs, 4, 2);
  for (const b of over.filter((x) => x.count)) assert.ok(b.conf >= b.acc - 1e-12);
  for (const b of under.filter((x) => x.count)) assert.ok(b.conf <= b.acc + 1e-12);
  assert.ok(ece(reliability(zs, 1, 2)) > ece(reliability(zs, 1.5, 2)));
});

// Reference values from an independent Python script: statistics.NormalDist().inv_cdf for 1000 quantiles with spread 2.
test('matches the independent Python reference', () => {
  const zs = examples(1000);
  near(ece(reliability(zs, 1, 2)), 0.103137, 5e-6);
  near(ece(reliability(zs, 4, 2)), 0.07892, 5e-6);
  near(zs[0], -6.5811, 1e-3);
});

test('routing: a higher threshold hands less to the cheap model and costs more', () => {
  const zs = examples(1000);
  const lo = route(zs, 2, 2, 0.6, 0.97, 1, 40), hi = route(zs, 2, 2, 0.9, 0.97, 1, 40);
  assert.ok(hi.share < lo.share && hi.cost > lo.cost);
  near(route(zs, 2, 2, 0.5, 0.97, 1, 40).share, 1);
  near(route(zs, 2, 2, 0.5, 0.97, 1, 40).cost, 1 / 40);
  near(route(zs, 2, 2, 1.01, 0.97, 1, 40).accuracy, 0.97);
  assert.equal(route(zs, 2, 2, 1.01, 0.97, 1, 40).cheapAccuracy, null);
  // an overconfident model says more than is true about what it handles
  const r = route(zs, 1, 2, 0.9, 0.97, 1, 40);
  assert.ok(r.saidAccuracy > r.cheapAccuracy);
});
