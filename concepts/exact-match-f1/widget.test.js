import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, tokens, overlapTokens, scoreOne, scoreAnswer, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Reference values come from a small Python port of the SQuAD v1.1 metric logic (lowercase, strip string.punctuation,
// remove \b(a|an|the)\b, collapse spaces; F1 from the token Counter intersection), checked against the step list in evaluate-v1.1.py.
test('cleaning', () => {
  assert.equal(normalize('It’s  the Great, GATSBY!'.replace('’', "'")), 'its great gatsby');
  assert.equal(normalize('The author Jane Austen'), 'author jane austen');
  assert.equal(normalize('jane austen.'), 'jane austen');
  assert.deepEqual(tokens('A  b'), ['b']);
});

test('exact match and F1 against "Jane Austen"', () => {
  const ref = 'Jane Austen';
  const cases = [
    ['Jane Austen', true, 1], ['jane austen.', true, 1], ['The author Jane Austen', false, 0.8], ['Austen', false, 0.666667],
    ['The novelist Jane Austen wrote it in 1813', false, 0.444444], ['The author of Emma', false, 0], ['Currer Bell', false, 0],
    ['Miss Austen', false, 0.5], ['Not Jane Austen', false, 0.8], ['Jane Austin', false, 0.5],
  ];
  for (const [text, em, f1] of cases) { const s = scoreOne(text, ref); assert.equal(s.em, em, text); near(s.f1, f1); }
});

test('repeated words count as often as the reference has them', () => {
  near(scoreOne('the the cat', 'the cat sat').f1, 2 / 3); // articles vanish: ["cat"] vs ["cat", "sat"]
  near(scoreOne('dog dog dog', 'dog cat').f1, 0.4);       // one shared "dog": P = 1/3, R = 1/2
  assert.deepEqual(overlapTokens(['dog', 'dog'], ['dog']).map((x) => x.shared), [true, false]);
});

test('several accepted answers: best score wins (SQuAD takes the max over references)', () => {
  assert.equal(scoreAnswer('Austen', ['Jane Austen', 'Austen']).em, true);
  near(scoreAnswer('Austen', ['Jane Austen', 'Austen']).f1, 1);
  near(scoreAnswer('Austen', ['Jane Austen']).f1, 0.666667);
});

test('blind spot: a right answer in other words scores 0, a wrong one with the right words scores high', () => {
  const f = facts(example);
  assert.equal(f['bf1.A'], '0.00'); assert.equal(f['bf1.D'], '0.00'); assert.equal(f['bf1.B'], '0.80'); assert.equal(f['bf1.C'], '0.50');
  assert.equal(f['em.A'], '1'); assert.equal(f['f1.C'], '0.67');
});
