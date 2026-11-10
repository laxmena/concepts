import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { kvBytesPerToken, cacheBytes, stepPasses, totalPasses, maxUsers, formatBytes, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const m = ex.model;

// Worked by hand: 2 (key and value) x 32 layers x 8 KV heads x 128 numbers x 2 bytes = 131,072 bytes.
test('bytes per token', () => {
  assert.equal(kvBytesPerToken(m, 8), 131072);
  assert.equal(kvBytesPerToken(m, 32), 524288);
});

test('cache size is linear in tokens', () => {
  assert.equal(cacheBytes(1000, 131072), 131072000);
  assert.equal(cacheBytes(2000, 131072), 2 * cacheBytes(1000, 131072));
});

// Without a cache, step t runs t tokens, so the total is 1 + 2 + ... + n = n(n+1)/2. With one it is n.
test('total passes', () => {
  assert.equal(totalPasses(1000, false), 500500);
  assert.equal(totalPasses(4000, false), 8002000);
  assert.equal(totalPasses(1000, true), 1000);
  assert.equal(stepPasses(1000, false), 1000);
  assert.equal(stepPasses(1000, true), 1);
  let sum = 0; for (let t = 1; t <= 50; t++) sum += stepPasses(t, false);
  assert.equal(sum, totalPasses(50, false));
});

// (80 GB - 16 GB) / (8192 tokens x bytes per token), rounded down.
test('how many people fit', () => {
  assert.equal(maxUsers(80e9, 16e9, 8192, 131072), 59);
  assert.equal(maxUsers(80e9, 16e9, 8192, 524288), 14);
  assert.equal(maxUsers(10e9, 16e9, 8192, 131072), 0);
});

test('format and facts', () => {
  assert.equal(formatBytes(131072), '131 KB');
  const f = facts(ex);
  assert.equal(f.perToken, '131 KB');
  assert.equal(f.without, '500,500');
  assert.equal(f.ratio, '501×');
  assert.equal(f.cache, '131 MB');
  assert.equal(f.bCache, '34 GB');
  assert.equal(f.fitGrouped, '59');
  assert.equal(f.fitFull, '14');
});
