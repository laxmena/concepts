import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { avgPassAt, avgPassHat, gradeRun, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const mix = (id) => example.mixes.find((m) => m.id === id).passes;

// tau-bench (Yao et al., 2024): pass^k = E_task[ C(c, k) / C(n, k) ], pass@k = 1 - E_task[ C(n-c, k) / C(n, k) ].
// Reference values from an independent Python run (math.comb), n = 8 trials per task, 10 tasks.
test('pass^k and pass@k over tasks match independent values', () => {
  const ref = { same: { hat: [0.625, 0.3571, 0.0714, 0], at: [0.625, 0.8929, 1, 1] }, mixed: { hat: [0.625, 0.4964, 0.38, 0.3], at: [0.625, 0.7536, 0.8414, 0.9] }, split: { hat: [0.625, 0.6036, 0.6, 0.6], at: [0.625, 0.6464, 0.6786, 0.7] } };
  for (const [id, r] of Object.entries(ref)) [1, 2, 4, 8].forEach((k, i) => { near(avgPassHat(mix(id), 8, k), r.hat[i]); near(avgPassAt(mix(id), 8, k), r.at[i]); });
});

test('all three task sets have the same one-run score, 62.5%, but very different pass^8', () => {
  for (const m of example.mixes) { near(avgPassHat(m.passes, 8, 1), 0.625); assert.equal(m.passes.reduce((a, b) => a + b, 0), 50); }
  near(avgPassHat(mix('same'), 8, 8), 0); near(avgPassHat(mix('split'), 8, 8), 0.6);
});

test('pass^k never exceeds pass@k, and for k = 1 they are equal', () => {
  for (const m of example.mixes) for (let k = 1; k <= 8; k++) { assert.ok(avgPassHat(m.passes, 8, k) <= avgPassAt(m.passes, 8, k) + 1e-12); }
  near(avgPassHat(mix('mixed'), 8, 1), avgPassAt(mix('mixed'), 8, 1), 1e-12);
});

test('outcome grading passes a run that broke a rule; step grading does not', () => {
  const [clean, lucky] = example.breaks.runs.map(gradeRun);
  assert.deepEqual(clean, { outcome: true, stepsOk: true, both: true });
  assert.deepEqual(lucky, { outcome: true, stepsOk: false, both: false });
});

test('facts and paper numbers', () => {
  const f = facts(example);
  assert.equal(f['hat.same.8'], '0%'); assert.equal(f['hat.split.8'], '60%'); assert.equal(f['at.same.4'], '100%');
  assert.equal(f.p1Retail, '61'); assert.equal(f.p8Retail, '25'); assert.equal(f.luckyBoth, 'fail');
});
