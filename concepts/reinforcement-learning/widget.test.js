import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../../shared/stats.js';
import { makeEnv, idx, step, newQ, qUpdate, chooseAction, runEpisode, valueIteration, greedyPath, hackThreshold, train, valueOf, bestAction, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const env = makeEnv(ex);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const UP = 0, DOWN = 1, LEFT = 2, RIGHT = 3;

test('moves, walls, goal, pit and coin', () => {
  assert.deepEqual(step(env, [2, 0], LEFT).next, [2, 0]); // wall: stay
  assert.deepEqual(step(env, [2, 0], UP), { next: [1, 0], reward: 0, done: false });
  assert.deepEqual(step(env, [0, 3], RIGHT), { next: [0, 4], reward: 1, done: true });
  assert.deepEqual(step(env, [2, 4], UP), { next: [1, 4], reward: -1, done: true });
  assert.equal(step(env, [2, 1], RIGHT, 0.2).reward, 0.2); // onto the coin
  assert.equal(step(env, [2, 2], DOWN, 0.2).reward, 0); // bumping the wall while on the coin does not pay
});

// Worked by hand: Q = 0.5, reward 0, best next value 1.0, alpha 0.5, gamma 0.9. 0.5 + 0.5 * (0 + 0.9 * 1.0 - 0.5) = 0.7.
test('Q-learning update', () => {
  const Q = newQ(env); Q[0][0] = 0.5; Q[1][2] = 1.0;
  near(qUpdate(Q, 0, 0, 0, 1, false, 0.5, 0.9), 0.7);
  Q[3][1] = 0.5; Q[4][1] = 9; // a move that ends the episode ignores the next state: 0.5 + 0.5 * (1 - 0.5) = 0.75
  near(qUpdate(Q, 3, 1, 1, 4, true, 0.5, 0.9), 0.75);
});

// With reward only at the goal, V*(s) = gamma^(d - 1) where d is the number of moves to the goal. Hand-checked, and matched in Python 3.
test('value iteration matches the closed form', () => {
  const { V } = valueIteration(env, 0.9);
  near(V[idx(env, [0, 3])], 1); near(V[idx(env, [1, 3])], 0.9); near(V[idx(env, [2, 3])], 0.81);
  near(V[idx(env, [2, 0])], 0.9 ** 5);
  near(V[idx(env, [2, 0])], 0.59049);
  const g = valueIteration(env, 0.5).V;
  near(g[idx(env, [2, 0])], 0.5 ** 5);
});

test('Q-learning with alpha 1 and plenty of random exploration reaches the exact values', () => {
  const Q = newQ(env), rng = mulberry32(3), p = { alpha: 1, gamma: 0.9, epsilon: 1 };
  for (let e = 0; e < 4000; e++) runEpisode(env, Q, p, rng, 100);
  const { V } = valueIteration(env, 0.9);
  for (let i = 0; i < V.length; i++) if (![idx(env, env.goal), idx(env, env.pit)].includes(i)) near(valueOf(Q, i), V[i], 1e-9);
});

test('epsilon-greedy', () => {
  const rng = mulberry32(1);
  for (let i = 0; i < 50; i++) assert.equal(chooseAction([0, 0.2, 0.1, 0], 0, rng), 1);
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(chooseAction([0, 0, 0, 0], 0, rng));
  assert.equal(seen.size, 4); // ties are broken at random
  assert.equal(bestAction([0, 0, 0, 0]), null);
  assert.equal(bestAction([0, 0.2, 0.1, 0]), 1);
});

// Reference: value iteration in Python 3 on the same grid, gamma 0.9. Greedy rollout, first-listed action wins ties.
test('the coin: the best policy stops finishing near a bonus of 0.16', () => {
  for (const b of [0, 0.05, 0.1, 0.15]) {
    const { Q } = valueIteration(env, 0.9, b), r = greedyPath(env, Q, b, 30);
    assert.equal(r.reached, true, `bonus ${b}`); assert.equal(r.steps, 6);
  }
  for (const b of [0.2, 0.3]) {
    const { Q } = valueIteration(env, 0.9, b), r = greedyPath(env, Q, b, 30);
    assert.equal(r.reached, false, `bonus ${b}`); assert.ok(r.coins >= 10);
  }
  near(valueIteration(env, 0.9, 0.2).V[idx(env, env.start)], 0.947368, 1e-6);
  near(valueIteration(env, 0.9, 0.3).V[idx(env, env.start)], 1.421053, 1e-6);
  near(valueIteration(env, 0.9, 0.05).V[idx(env, env.start)], 0.63549, 1e-6);
  assert.equal(hackThreshold(env, 0.9, 30), 0.16);
});

test('training is repeatable and prose facts agree with it', () => {
  const a = train(ex, 50), b = train(ex, 50);
  assert.deepEqual(a.log.map((e) => e.steps), b.log.map((e) => e.steps));
  const f = facts(ex);
  assert.equal(f.best, '0.59'); assert.equal(f.shortest, '6'); assert.equal(f.threshold, '0.16');
  assert.ok(Number(f.lastWins) >= Number(f.firstWins));
});
