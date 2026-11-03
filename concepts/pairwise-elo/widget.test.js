import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mulberry32 } from '../../shared/stats.js';
import { expectedScore, eloUpdate, eloReplay, bradleyTerry, simulateVotes, record, cycleGames, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Wikipedia, "Elo rating system": E = 1 / (1 + 10^((Rb - Ra) / 400)); a 400-point gap gives about 0.91 (1800 vs 1400).
test('expected score and update', () => {
  near(expectedScore(1800, 1400), 0.9090909, 1e-7);
  near(expectedScore(1500, 1500), 0.5);
  near(expectedScore(1600, 1500), 0.6400650, 1e-7);
  const [a, b] = eloUpdate(1800, 1400, 1, 32);
  near(a, 1802.909091, 1e-6); near(b, 1397.090909, 1e-6); // the favourite gains K * (1 - 0.909) = 2.91
  const [c, d] = eloUpdate(1800, 1400, 0, 32);
  near(c, 1800 - 32 * 0.9090909, 1e-6); near(d, 1400 + 32 * 0.9090909, 1e-6);
});

test('Elo conserves the total of the ratings', () => {
  const games = simulateVotes(mulberry32(3), [900, 1000, 1100, 1200], 100);
  near(eloReplay(games, 32, 4).reduce((s, x) => s + x, 0), 4000, 1e-6);
});

// Independent Python replay with K = 32 from 1000: games A>B, A>B, B>A give 1011.747 / 988.253; reversed gives 1017.334 / 982.666.
test('Elo depends on the order of the votes', () => {
  const g = [{ a: 0, b: 1, winner: 0 }, { a: 0, b: 1, winner: 0 }, { a: 0, b: 1, winner: 1 }];
  const fwd = eloReplay(g, 32, 2), rev = eloReplay(g.slice().reverse(), 32, 2);
  near(fwd[0], 1011.747134, 1e-5); near(rev[0], 1017.334159, 1e-5);
  assert.ok(Math.abs(fwd[0] - rev[0]) > 5);
});

// Bradley-Terry with two models and w wins in N games has the closed form xi_a - xi_b = ln(w / (N - w)).
// On the Elo scale that is 400 * log10(7 / 3) = 147.19 for 7 wins in 10.
test('Bradley-Terry fit matches the closed form and ignores order', () => {
  const g = [...Array(7).fill({ a: 0, b: 1, winner: 0 }), ...Array(3).fill({ a: 0, b: 1, winner: 1 })];
  const r = bradleyTerry(g, 2);
  near(r[0] - r[1], 400 * Math.log10(7 / 3), 1e-4); near((r[0] + r[1]) / 2, 1000, 1e-9);
  const r2 = bradleyTerry(g.slice().reverse(), 2);
  near(r2[0], r[0], 1e-9);
});

// Python MM check of a cycle where each model beats the next 8 times in 10: all three ratings are exactly 1000.
test('a cycle of wins gives equal ratings', () => {
  const r = bradleyTerry(cycleGames(example.breaks.cycle), 3);
  for (const x of r) near(x, 1000, 1e-6);
});

test('with many votes the fit recovers the true gaps (to within noise)', () => {
  const games = simulateVotes(mulberry32(1), example.truth, 4000);
  const r = bradleyTerry(games, 4, { iterations: 500 });
  for (let i = 1; i < 4; i++) assert.ok(Math.abs(r[i] - r[i - 1] - 100) < 25, `${r}`);
});

test('record counts wins and games', () => {
  const { won, played } = record([{ a: 0, b: 1, winner: 0 }, { a: 1, b: 2, winner: 2 }], 3);
  assert.deepEqual(won, [1, 0, 1]); assert.deepEqual(played, [1, 2, 1]);
});

test('default facts exist and Elo moves when the votes are replayed backwards', () => {
  const f = facts(example);
  assert.equal(f.votes, '60'); assert.ok(Number(f.maxShift) > 0); assert.equal(f.cycleLow, '1000'); assert.equal(f.cycleHigh, '1000');
});
