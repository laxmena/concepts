import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toCounts, usableAfterSwap, swapVerdict, paddingFails, facts } from './widget.js';

const example = JSON.parse(readFileSync(new URL('./example.json', import.meta.url), 'utf8'));
const judge = (id) => example.judges.find((j) => j.id === id);

// Zheng et al. (2023), Table 2, default prompt. Each percentage is k / 80 questions, so the counts are whole numbers.
test('Table 2 percentages turn back into whole counts of 80 questions', () => {
  assert.deepEqual(toCounts(judge('gpt4')), { consistent: 52, first: 24, second: 4, error: 0 });
  assert.deepEqual(toCounts(judge('gpt35')), { consistent: 37, first: 40, second: 1, error: 2 });
  assert.deepEqual(toCounts(judge('claude1')), { consistent: 19, first: 60, second: 0, error: 1 });
  for (const j of example.judges) {
    const c = toCounts(j);
    assert.equal(c.consistent + c.first + c.second + c.error, 80);
    for (const [key, n] of Object.entries(c)) assert.ok(Math.abs((n / 80) * 100 - j[key]) < 0.06, `${j.id} ${key}`);
  }
});

// Table 3: failure rate under the "repetitive list" attack on 23 answers. 91.3% = 21/23 and 8.7% = 2/23.
test('padding failures are whole counts of 23', () => {
  assert.equal(paddingFails(judge('gpt35')), 21); assert.equal(paddingFails(judge('claude1')), 21); assert.equal(paddingFails(judge('gpt4')), 2);
  assert.equal(example.paddedAnswers, 23);
});

// Section 3.4 of the paper: "call a response a win only if it is preferred in both orders; otherwise a tie".
test('swap rule: a win needs both orders; otherwise a tie', () => {
  assert.equal(swapVerdict('A', 'A'), 'A'); assert.equal(swapVerdict('B', 'B'), 'B');
  assert.equal(swapVerdict('A', 'B'), 'tie');
  assert.equal(usableAfterSwap(toCounts(judge('gpt4'))), 52);
});

test('numbers quoted in the page match the paper', () => {
  const f = facts(example);
  assert.equal(f.agreeJudge, '85'); assert.equal(f.agreeHuman, '81'); assert.equal(f.fewShot, '77.5'); assert.equal(f.before, '65.0');
  assert.deepEqual(example.fixes.math.map((m) => m.wrong), [14, 6, 3]); // Table 4: 14/20, 6/20, 3/20
  assert.equal(f['gpt4.first'], '24'); assert.equal(f['claude1.first'], '60');
});
