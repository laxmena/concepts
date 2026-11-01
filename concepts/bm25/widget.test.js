import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tokenize, idf, termScore, buildIndex, scoreCorpus, story, idfCoins, repeatGains, sameMatch } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));

// Expected values come from bm25s 0.3.16 (method="lucene", k1=0.9, b=0.4, stopwords=None),
// indexing the four documents in example.json. Reproduce with:
//   tok = bm25s.tokenize(texts, stopwords=None); r = bm25s.BM25(k1=0.9, b=0.4, method="lucene")
//   r.index(tok); r.get_scores(["car", "repair"])
const BM25S = {
  'car repair':     [0.7187200189, 0.423625946, 0.0, 0.2080288678],
  'car':            [0.5106911659, 0.2796998918, 0.0, 0.0],
  'automobile':     [0.0, 0.0, 0.7112621069, 0.0],
  'car automobile': [0.5106911659, 0.2796998918, 0.7112621069, 0.0],
  'repair':         [0.2080288678, 0.1439260542, 0.0, 0.2080288678],
};

test('tokenizer matches bm25s: lowercase, drops single characters', () => {
  assert.deepEqual(tokenize('A Car, a CAR-repair!'), ['car', 'car', 'repair']);
});

test('document lengths and average length', () => {
  const idx = buildIndex(example.docs);
  assert.deepEqual(idx.docLens, [8, 43, 7, 8]);
  assert.equal(idx.avgdl, 16.5);
});

// bm25s stores scores as float32 (about 7 significant digits); this code uses float64. Hence 1e-6.
const TOL = 1e-6;

for (const [query, expected] of Object.entries(BM25S)) {
  test(`scores match bm25s for "${query}"`, () => {
    const { results } = scoreCorpus({ ...example, query });
    results.forEach((r, i) => assert.ok(Math.abs(r.score - expected[i]) < TOL, `doc ${r.id}: got ${r.score}, expected ${expected[i]}`));
  });
}

test('idf by hand: car is in 2 of 4 docs, repair in 3 of 4', () => {
  assert.ok(Math.abs(idf(4, 2) - Math.LN2) < 1e-12);        // ln(1 + 2.5/2.5) = ln 2
  assert.ok(Math.abs(idf(4, 3) - Math.log(1 + 1.5 / 3.5)) < 1e-12);
});

test('worked example: doc A, word "car" (tf 2, length 8, avg 16.5, k1 0.9, b 0.4)', () => {
  // K = 0.9 * (0.6 + 0.4 * 8/16.5) = 0.71454...; saturation = 2 / (2 + K); contribution = ln2 * saturation
  const t = termScore({ tf: 2, dl: 8, avgdl: 16.5, idf: Math.LN2, k1: 0.9, b: 0.4 });
  assert.ok(Math.abs(t.norm - 0.9 * (0.6 + (0.4 * 8) / 16.5)) < 1e-12);
  assert.ok(Math.abs(t.saturation - 0.7368) < 1e-4);
  assert.ok(Math.abs(t.contribution - 0.5107) < 1e-4);
});

test('synonym scores exactly zero', () => {
  const { results } = scoreCorpus({ ...example, query: 'car repair' });
  assert.equal(results.find((r) => r.id === 'C').score, 0);
});

test('k1 = 0 ignores counts and length: score is the sum of IDFs of matched words', () => {
  const { results } = scoreCorpus({ ...example, query: 'car repair', k1: 0 });
  const expected = idf(4, 2) + idf(4, 3);
  assert.ok(Math.abs(results.find((r) => r.id === 'A').score - expected) < 1e-12);
  assert.ok(Math.abs(results.find((r) => r.id === 'B').score - expected) < 1e-12);
});

test('b = 0 removes length normalisation; b > 0 lowers a long document', () => {
  const at = (b) => scoreCorpus({ ...example, b }).results.find((r) => r.id === 'B').score;
  assert.ok(at(0) > at(0.4));
});

test('repeated query words count once; empty query scores zero', () => {
  const once = scoreCorpus({ ...example, query: 'car' }).results.map((r) => r.score);
  const twice = scoreCorpus({ ...example, query: 'car car' }).results.map((r) => r.score);
  assert.deepEqual(once, twice);
  assert.ok(scoreCorpus({ ...example, query: '' }).results.every((r) => r.score === 0));
});

test('a word in every document still has positive IDF', () => {
  assert.ok(idf(4, 4) > 0);
});

test('plain match count (the blue comparison bar) is the sum of word counts', () => {
  const { results } = scoreCorpus({ ...example, query: 'car repair' });
  assert.deepEqual(results.map((r) => r.count), [3, 2, 0, 1]);
});

test('plain sentences: long, short and no-match documents', () => {
  const { results, index } = scoreCorpus({ ...example, query: 'car repair' });
  const by = Object.fromEntries(results.map((r) => [r.id, story(r, index.avgdl)]));
  assert.match(by.A, /^Short\. Has “car” 2 times and “repair” once\. Each match counts more\.$/);
  assert.match(by.B, /^Long\. .* Each match counts less\.$/);
  assert.equal(by.C, 'Has no search word, so it gets 0.');
});

test('rare-word coins: worth falls as more documents contain the word (N = 4)', () => {
  const c = idfCoins(4).map((x) => x.idf);
  const hand = [Math.log(1 + 3.5 / 1.5), Math.log(2), Math.log(1 + 1.5 / 3.5), Math.log(1 + 0.5 / 4.5)];
  c.forEach((v, i) => assert.ok(Math.abs(v - hand[i]) < 1e-12));
  assert.ok(c.every((v, i) => i === 0 || v < c[i - 1]));
});

test('each repeat adds less; the pieces add up to the score for that many mentions', () => {
  const args = { idf: Math.LN2, dl: 8, avgdl: 16.5, k1: 0.9, b: 0.4 };
  const g = repeatGains({ ...args, max: 4 });
  // by hand: K = 0.9 * (0.6 + 0.4 * 8 / 16.5); piece n = ln2 * (n/(n+K) - (n-1)/(n-1+K))
  const K = 0.9 * (0.6 + (0.4 * 8) / 16.5);
  const sat = (n) => (n === 0 ? 0 : n / (n + K));
  g.forEach((x) => assert.ok(Math.abs(x.gain - Math.LN2 * (sat(x.n) - sat(x.n - 1))) < 1e-12));
  assert.ok(g.every((x, i) => i === 0 || x.gain < g[i - 1].gain));
  assert.ok(Math.abs(g[1].total - g[0].gain - g[1].gain) < 1e-12);
  assert.ok(Math.abs(g[0].gain - 0.4043) < 1e-4 && Math.abs(g[1].gain - 0.1064) < 1e-4);
});

test('same match: worth the same at b = 0, less in the long document when b > 0', () => {
  const args = { idf: Math.LN2, avgdl: 16.5, k1: 0.9, shortLen: 8, longLen: 43 };
  const flat = sameMatch({ ...args, b: 0 });
  assert.ok(Math.abs(flat.short - flat.long) < 1e-12);
  const m = sameMatch({ ...args, b: 0.4 });
  assert.ok(m.long < m.short);
  // by hand, b = 0.4: short K = 0.7145 -> ln2 * 1/1.7145 = 0.4043; long K = 0.9*(0.6+0.4*43/16.5) = 1.4782 -> ln2 * 1/2.4782 = 0.2797
  assert.ok(Math.abs(m.short - 0.4043) < 1e-3 && Math.abs(m.long - 0.2797) < 1e-3);
});
