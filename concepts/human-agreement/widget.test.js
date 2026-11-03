import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kappa, landisKoch, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Wikipedia, "Cohen's kappa": 50 grant applications, readers A and B. po = 0.70, pe = 0.50, kappa = 0.40.
test('Wikipedia grant example', () => {
  const r = kappa([[20, 5], [10, 15]]);
  near(r.po, 0.7); near(r.pe, 0.5); near(r.kappa, 0.4); near(r.chanceYes, 0.3); near(r.chanceNo, 0.2);
  assert.equal(r.n, 50);
});

// Wikipedia: both rater pairs agree 60% of the time, kappa is 0.1304 in one case and 0.2593 in the other (chance 0.54 and 0.46).
test('same agreement, different kappa (prevalence and bias)', () => {
  const one = kappa([[45, 15], [25, 15]]), two = kappa([[25, 35], [5, 35]]);
  near(one.po, 0.6); near(two.po, 0.6);
  near(one.pe, 0.54); near(two.pe, 0.46);
  near(one.kappa, 0.1304348, 1e-6); near(two.kappa, 0.2592593, 1e-6);
});

// Independent Python check: 90 / 5 / 5 / 0 gives po = 0.90, pe = 0.905, kappa = -0.0526.
test('high raw agreement with a rare label can give a kappa below 0', () => {
  const r = kappa([[90, 5], [5, 0]]);
  near(r.po, 0.9); near(r.pe, 0.905); near(r.kappa, -0.0526316, 1e-6);
  assert.equal(landisKoch(r.kappa), 'no agreement');
});

test('perfect agreement is 1, coin-flip agreement is 0, no data or no variation is undefined', () => {
  near(kappa([[30, 0], [0, 20]]).kappa, 1);
  near(kappa([[25, 25], [25, 25]]).kappa, 0);
  assert.equal(kappa([[0, 0], [0, 0]]).kappa, null);
  assert.equal(kappa([[50, 0], [0, 0]]).kappa, null); // both always say yes: chance agreement is 1
});

test('Landis and Koch bands', () => {
  assert.deepEqual([-0.1, 0.1, 0.2, 0.21, 0.4, 0.41, 0.6, 0.61, 0.8, 0.81, 1].map(landisKoch),
    ['no agreement', 'slight', 'slight', 'fair', 'fair', 'moderate', 'moderate', 'substantial', 'substantial', 'almost perfect', 'almost perfect']);
  assert.equal(landisKoch(kappa([[20, 5], [10, 15]]).kappa), 'fair');
});

test('facts', () => {
  const f = facts(example);
  assert.equal(f['k.grant'], '0.40'); assert.equal(f['k.case1'], '0.13'); assert.equal(f['k.case2'], '0.26'); assert.equal(f['k.skew'], '-0.05');
  assert.equal(f['po.skew'], '90%'); assert.equal(f.chanceYes, '30%');
});
