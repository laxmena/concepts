import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hadamard, col, update, sub, frobenius, factors, matmul, kept, fullParams, loraParams, loraShare, loraForward, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const n = ex.size, low = ex.spectra.low.s, flat = ex.spectra.flat.s;

test('Hadamard columns are orthonormal', () => {
  const H = hadamard(8);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) near(col(H, i).reduce((s, x, t) => s + x * col(H, j)[t], 0), i === j ? 1 : 0);
});

// Eckart-Young, checked directly: the norm of (full - rank r) squared is the sum of the dropped s_i squared.
// Worked by hand for the low-rank spectrum: 4^2 + 2^2 + 1 + 0.25 + 0.0625 + 0.015625 + 0.00390625 + 0.0009765625 = 21.3330078125.
test('the leftover after rank r is the sum of the dropped squares', () => {
  const full = update(low, n, ex.shift);
  near(frobenius(full) ** 2, 21.3330078125);
  for (let r = 0; r <= 8; r++) {
    const miss = frobenius(sub(full, update(low, n, ex.shift, r))) ** 2;
    near(miss, low.slice(r).reduce((s, x) => s + x * x, 0));
  }
});

test('energy kept, worked by hand', () => {
  near(kept(low, 1).energy, 16 / 21.3330078125); near(kept(low, 2).energy, 20 / 21.3330078125); // 0.75, 0.9375 (rounded)
  assert.equal((kept(low, 2).energy * 100).toFixed(0), '94');
  near(kept(flat, 2).energy, (4 + 3.24) / 15.2); // 4 + 3.24 + 2.56 + 1.96 + 1.44 + 1 + 0.64 + 0.36 = 15.2
  near(kept(low, 8).energy, 1); near(kept(low, 8).relError, 0);
});

test('B times A is the rank-r approximation', () => {
  for (const r of [1, 2, 5]) {
    const { B, A } = factors(low, n, ex.shift, r), P = matmul(B, A), Q = update(low, n, ex.shift, r);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) near(P[i][j], Q[i][j]);
  }
});

// 4096 x 4096 = 16,777,216. Rank 8: 8 * (4096 + 4096) = 65,536, which is 1/256 = 0.390625% of it.
test('parameter counts', () => {
  assert.equal(fullParams(4096, 4096), 16777216);
  assert.equal(loraParams(4096, 4096, 8), 65536); near(loraShare(4096, 4096, 8), 1 / 256);
  assert.equal(loraParams(4096, 4096, 2), 16384);
  assert.equal(loraParams(100, 50, 4), 600);
});

test('the cheap order of multiplying gives the same output as building the update', () => {
  const d = 6, k = 5, r = 2, alpha = 16;
  let seed = 7; const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296) - 0.5;
  const mat = (a, b) => Array.from({ length: a }, () => Array.from({ length: b }, rnd));
  const W = mat(d, k), B = mat(d, r), A = mat(r, k), x = Array.from({ length: d }, rnd);
  const dW = matmul(B, A).map((row) => row.map((v) => (alpha / r) * v));
  const direct = matmul([x], W.map((row, i) => row.map((v, j) => v + dW[i][j])))[0], cheap = loraForward(x, W, B, A, alpha);
  cheap.forEach((v, j) => near(v, direct[j], 1e-12));
});

test('prose facts', () => {
  const f = facts(ex);
  assert.equal(f.keptLow, '94%'); assert.equal(f.keptFlat, '48%'); assert.equal(f.full, '16,777,216'); assert.equal(f.lora, '16,384');
  assert.equal(f.r1, '75%'); assert.equal(f.r3, '98%');
});
