import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toBytes, tokenText, train, encode, encodeWord, countTokens, countBytes, countChars, facts } from './widget.js';

const ex = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));

// By hand: "aaaa" has the pair aa three times (overlapping). Merge it: [aa, aa]. The pair aa+aa is left once: [aaaa].
test('merges worked by hand', () => {
  const m = train([['aaaa', 1]], 5);
  assert.equal(m.length, 2);
  assert.deepEqual(m.map((x) => [x.token, x.count]), [['6161', 3], ['61616161', 1]]);
  assert.deepEqual(encodeWord('aaaa', m), ['61616161']);
  assert.deepEqual(encodeWord('aaaa', m.slice(0, 1)), ['6161', '6161']);
  // "abab": ab is seen twice, ba once.
  const n = train([['abab', 1]], 1);
  assert.deepEqual([n[0].token, n[0].count], ['6162', 2]);
});

test('ties go to the pair seen first, and counts are weighted by how often a word occurs', () => {
  assert.equal(train([['abc', 1]], 1)[0].token, '6162');
  assert.equal(train([['abc', 1], ['bcd', 2]], 1)[0].token, '6263');
});

test('zero merges is one token per byte; text always decodes back', () => {
  assert.equal(countTokens('Good morning', []), 11);
  const m = train(ex.english, 100);
  for (const w of ['Good', 'morning', 'காலை']) assert.equal(encodeWord(w, m).join(''), toBytes(w).join(''));
  assert.equal(tokenText(encodeWord('தமிழ்', [])[0]), null);
});

// UTF-8: one Tamil code point takes 3 bytes, one English letter 1. Checked with Python: 11 code points, 33 bytes.
test('bytes and characters', () => {
  assert.equal(countChars(ex.sentences.ta), 11);
  assert.equal(countBytes(ex.sentences.ta), 33);
  assert.equal(countChars(ex.sentences.en), 11);
  assert.equal(countBytes(ex.sentences.en), 11);
  assert.equal(toBytes('கா').length, 6);
});

// Expected values come from an independent Python implementation (tuples of ints, not hex strings), same corpus and rules.
test('matches the independent Python reference', () => {
  const en = train(ex.english, 160), both = train([...ex.english, ...ex.tamil], 160);
  assert.deepEqual(en.slice(0, 4).map((x) => [x.token, x.count]), [['7468', 229], ['746865', 120], ['696e', 99], ['6f72', 69]]);
  assert.deepEqual(both.slice(0, 8).map((x) => [x.token, x.count]), [['e0ae', 327], ['7468', 229], ['e0af', 135], ['746865', 120], ['696e', 99], ['e0af8d', 81], ['6f72', 69], ['6174', 63]]);
  const ref = { 0: [11, 33, 11, 33], 20: [6, 33, 7, 17], 60: [2, 33, 4, 12], 100: [2, 33, 2, 8], 160: [2, 33, 2, 2] };
  for (const [n, [a, b, c, d]] of Object.entries(ref)) {
    const k = Number(n);
    assert.equal(countTokens(ex.sentences.en, en.slice(0, k)), a, `en/en at ${n}`);
    assert.equal(countTokens(ex.sentences.ta, en.slice(0, k)), b, `ta/en at ${n}`);
    assert.equal(countTokens(ex.sentences.en, both.slice(0, k)), c, `en/both at ${n}`);
    assert.equal(countTokens(ex.sentences.ta, both.slice(0, k)), d, `ta/both at ${n}`);
  }
});

test('facts', () => {
  const f = facts(ex);
  assert.equal(f.bTaTokensEn, '33');
  assert.equal(f.bTaTokensBoth, '8');
  assert.equal(f.bEnTokens, '2');
  assert.equal(f.enTokens, '6');
  assert.equal(f.realRatio, '9.5×');
  assert.equal(f.realRatio4o, '2.5×');
  assert.equal(encode('Good morning', []).length, 2);
});
