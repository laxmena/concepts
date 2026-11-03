import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sigmoid, winProb, comparisonLoss, optimalPolicy, expectation, kl, objective, atBeta, curve, qualityTurn, betaOf, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const ref = ex.replies.map((r) => r.ref), rew = ex.replies.map((r) => r.reward), qual = ex.replies.map((r) => r.quality);
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Worked by hand: sigmoid(1) = 1 / (1 + e^-1) = 0.7311. Loss -ln 0.7311 = 0.3133. Reversed, the loss is 1 + 0.3133.
test('Bradley-Terry loss for one comparison', () => {
  near(sigmoid(0), 0.5, 1e-12); near(winProb(1, 0), 0.7310585786300049, 1e-12);
  near(comparisonLoss(1, 0), 0.3132616875182228, 1e-12);
  near(comparisonLoss(0, 1), 1.3132616875182228, 1e-12); // sigmoid(-x) = 1 - sigmoid(x): loss(0,1) = loss(1,0) + 1
});

// Reference values from Python 3 (math.exp, math.log) with the same five replies.
test('the KL-penalised optimum, beta 1 and 0.3', () => {
  const a = atBeta(ex, 1), b = atBeta(ex, 0.3);
  [0.071378, 0.214433, 0.351613, 0.172726, 0.189851].forEach((p, i) => near(a.p[i], p));
  near(a.proxy, 0.886664); near(a.quality, 0.686923); near(a.kl, 0.250877);
  [0.000772, 0.030211, 0.404539, 0.124618, 0.43986].forEach((p, i) => near(b.p[i], p));
  near(b.proxy, 1.2783, 1e-4); near(b.quality, 0.519193); near(b.kl, 0.965429);
});

test('a loose leash never gets the reference moving, and a tight one never stops', () => {
  const far = optimalPolicy(ref, rew, 1e6);
  far.forEach((p, i) => near(p, ref[i], 1e-5));
  const tight = optimalPolicy(ref, rew, 0.001);
  assert.ok(tight[4] > 0.999); // all the weight on the highest reward
  near(tight.reduce((a, b) => a + b, 0), 1, 1e-12);
});

// The closed form really is the maximum: its objective equals beta * log Z, and no nearby policy beats it.
test('the closed form maximises reward minus beta times KL', () => {
  for (const beta of [0.3, 1, 3]) {
    const p = optimalPolicy(ref, rew, beta), best = objective(p, ref, rew, beta);
    const logZ = Math.log(ref.reduce((s, r, i) => s + r * Math.exp(rew[i] / beta), 0));
    near(best, beta * logZ, 1e-12);
    let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let t = 0; t < 2000; t++) {
      const q = p.map((x) => Math.max(1e-9, x * (1 + 0.3 * (rnd() - 0.5)))); const z = q.reduce((a, b) => a + b, 0);
      assert.ok(objective(q.map((x) => x / z), ref, rew, beta) <= best + 1e-12);
    }
  }
});

test('the reward model score only goes up as the leash loosens, while quality peaks and falls', () => {
  const c = curve(ex);
  for (let i = 1; i < c.length; i++) { assert.ok(c[i].proxy >= c[i - 1].proxy - 1e-12); assert.ok(c[i].kl >= c[i - 1].kl - 1e-12); }
  const turn = qualityTurn(ex);
  near(turn.start, 0.644, 1e-9);
  assert.ok(turn.best.quality > turn.start + 0.04 && turn.best.beta > 1 && turn.best.beta < 1.6); // Python: peak 0.6898 at beta ~ 1.26
  near(turn.best.quality, 0.6898, 5e-4);
  assert.ok(turn.below.beta < turn.best.beta);
  assert.ok(c[c.length - 1].quality < 0.2 && c[c.length - 1].proxy > 1.4);
});

test('prose facts agree with the maths', () => {
  const f = facts(ex);
  assert.equal(f.winGood, '73%'); assert.equal(f.lossGood, '0.31'); assert.equal(f.lossBad, '1.31');
  assert.equal(f.proxyRef, '0.33'); assert.equal(f.qualityRef, '0.64');
});
