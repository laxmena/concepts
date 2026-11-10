import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mask, visible, pairs, writeBidirectional, writeDecoder, writeEncDec, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));

test('encoder mask is full, decoder mask is the lower triangle', () => {
  const e = mask('encoder', 6), d = mask('decoder', 6);
  assert.equal(pairs(e), 36);
  assert.equal(pairs(d), 21); // 1 + 2 + ... + 6
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) assert.equal(d[i][j], j <= i);
  assert.deepEqual(visible(d, 0), [0]);
  assert.deepEqual(visible(d, 5), [0, 1, 2, 3, 4, 5]);
});

// By hand, 3 source and 3 output tokens: source rows see 3 each (9). Output rows see 3 source plus 1, 2, 3 outputs: 4 + 5 + 6 = 15. Total 24.
test('encoder-decoder mask', () => {
  const m = mask('encdec', 6, 3);
  assert.equal(pairs(m), 24);
  assert.deepEqual(visible(m, 0), [0, 1, 2]);
  assert.deepEqual(visible(m, 3), [0, 1, 2, 3]);
  assert.deepEqual(visible(m, 5), [0, 1, 2, 3, 4, 5]);
  assert.equal(m[1][4], false); // the input never looks at the output
});

test('the last token sees everything in every mode, and the first never sees the future in a decoder', () => {
  for (const mode of ['encoder', 'decoder', 'encdec']) assert.equal(visible(mask(mode, 6, 3), 5).length, 6);
  assert.equal(mask('decoder', 6)[0].filter(Boolean).length, 1);
});

// Sum of t^2 for t = 1..n is n(n+1)(2n+1)/6; for n = 100 that is 338,350. The sum of t is 5,050. Encoder-decoder with s = 50: 2,500 + 5,050 + 5,000.
test('cost of writing n tokens', () => {
  assert.equal(writeBidirectional(100), 338350);
  assert.equal(writeDecoder(100), 5050);
  assert.equal(writeEncDec(50, 100), 12550);
  let a = 0, b = 0; for (let t = 1; t <= 30; t++) { a += t * t; b += t; }
  assert.equal(writeBidirectional(30), a);
  assert.equal(writeDecoder(30), b);
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.decPairs, '21');
  assert.equal(f.xPairs, '24');
  assert.equal(f.bRatio, '67×');
  assert.equal(f.decSees, '3');
  assert.equal(f.xFirstOut, '4');
});
