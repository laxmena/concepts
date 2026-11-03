import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isSupported, faithfulness, contextRelevance, contextRecall, verdict, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const ans = (id) => example.answers.find((a) => a.id === id);
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// RAGAS (Es et al., 2023): faithfulness F = |V| / |S|; context relevance CR = extracted sentences / total sentences.
test('faithfulness is supported statements over all statements', () => {
  near(faithfulness(ans('A').statements, ['P1', 'P3']), 1);
  near(faithfulness(ans('C').statements, ['P1', 'P3']), 0.5);
  near(faithfulness(ans('D').statements, ['P1', 'P3']), 0);
  near(faithfulness(ans('D').statements, ['P2']), 1);
  assert.equal(faithfulness([], ['P1']), 0);
});

test('a statement needs a supporting passage to be retrieved', () => {
  const s = { text: 'x', supportedBy: ['P1', 'P3'] };
  assert.equal(isSupported(s, ['P3']), true); assert.equal(isSupported(s, ['P2']), false);
  assert.equal(isSupported({ text: 'y', supportedBy: [] }, ['P1', 'P2', 'P3']), false); // nothing supports an invented claim
});

test('context relevance and recall, by hand', () => {
  const p = example.passages;
  near(contextRelevance(p, ['P1', 'P3']), 0.5); // 1 needed out of 2 retrieved
  near(contextRelevance(p, ['P1']), 1);
  near(contextRelevance(p, ['P3']), 0);
  near(contextRelevance(p, []), 0);
  near(contextRecall(p, ['P1', 'P3']), 1); near(contextRecall(p, ['P3']), 0);
});

test('faithful but wrong, and right but ungrounded', () => {
  assert.match(verdict(ans('B'), ['P1', 'P3']), /Faithful and still wrong/);
  assert.match(verdict(ans('A'), ['P3']), /not grounded/);
  assert.match(verdict(ans('C'), ['P1']), /1 of 2 claims/);
  assert.match(verdict(ans('D'), ['P2']), /different question/);
});

test('page facts: with only the old notice retrieved, the right answer scores 0 and the wrong one scores 1', () => {
  const f = facts(example);
  assert.equal(f['F.A'], '1.00'); assert.equal(f['F.C'], '0.50');
  assert.equal(f['Fb.A'], '0.00'); assert.equal(f['Fb.B'], '1.00');
  assert.equal(f.CR, '0.50'); assert.equal(f.recallb, '0.00');
});
