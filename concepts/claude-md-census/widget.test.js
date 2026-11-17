import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { treeSpans, overviewSections, hasInitLine, estimateTokens, tokenRange, percentileOf, ecdfAt, findCommands, findImports, analyze, suggestions, facts } from './widget.js';

const data = (f) => JSON.parse(readFileSync(new URL(`./data/${f}.json`, import.meta.url), 'utf8'));
const cal = data('calibration'), nums = data('numbers'), pctl = data('percentiles'), ecdf = data('ecdf');

// Reference values for the text rules come from the census code itself (neri src/neri/extras.py, tree_dump_spans and
// overview_sections), run on these same strings. Line numbers are 0-based, end exclusive.
const FENCE = '```';
const DOC = ['# Acme API', '', 'This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.', '',
  '## Overview', '', 'Acme API is a service.', 'It uses Express.', '', '### Detail', '', 'More text here.', '', '## Project structure', '',
  FENCE, 'src/', '├── routes/', '│   └── orders.ts', '└── db/', FENCE, '', '## Commands', '', '- `npm test`', ''].join('\n');

test('overview sections match the census output: one merged span from line 4 to 22', () => {
  const s = overviewSections(DOC);
  assert.deepEqual(s.map((x) => [x.a, x.b, x.title]), [[4, 22, 'Overview']]);
});

test('tree dump: a fenced block with box-drawing lines is found (census: 15 to 21)', () => {
  assert.deepEqual(treeSpans(DOC), [[15, 21]]);
});

test('tree dump: eight path-like lines in a row count, seven do not (census: [1,9] and none)', () => {
  const eight = ['src/a.py', 'src/b.py', 'docs/', 'lib/x.ts # note', 'README.md', 'a/b/c', 'pkg/m.go', 'tests/t.py'];
  assert.deepEqual(treeSpans(['intro', ...eight, 'end', ''].join('\n')), [[1, 9]]);
  assert.deepEqual(treeSpans(['intro', ...eight.slice(0, 7), 'end', ''].join('\n')), []);
});

test('a heading inside a code fence is ignored; About and Tech Stack both match (census: [0,4,"About"])', () => {
  const t = ['# About', 'x', '## Tech Stack', 'y', '# Other', 'z', FENCE, '# Overview', FENCE, ''].join('\n');
  assert.deepEqual(overviewSections(t).map((x) => [x.a, x.b, x.title]), [[0, 4, 'About']]);
});

test('the /init line counts only in the first ten non-empty lines', () => {
  assert.equal(hasInitLine(DOC), true);
  const late = [...Array(10).fill('x'), 'This file provides guidance to Claude Code'].join('\n');
  assert.equal(hasInitLine(late), false);
  assert.equal(hasInitLine('# Title\nThis file PROVIDES GUIDANCE TO CLAUDE CODE'), true);
});

test('token estimate is ceil(chars / median); range uses the interquartile ratios', () => {
  assert.equal(estimateTokens(1001, 4), 251);
  assert.equal(estimateTokens(1000, 4), 250);
  // 4000 chars at p75 4.168566286742651 and p25 3.7170542635658914: 959.5 and 1076.1 (Python: ceil gives 960 and 1077), rounded up
  assert.deepEqual(tokenRange(4000, cal), [960, 1077]);
});

test('percentile: exact at a table point, linear between points, clamped outside', () => {
  const t = pctl.files.claude.overall.all.always_loaded_tokens; // p50 = 1379, p55 = 1554
  assert.equal(percentileOf(1379, t), 50);
  assert.equal(percentileOf(1466.5, t), 52.5); // halfway between p50 and p55
  assert.equal(percentileOf(10, t), 1);
  assert.equal(percentileOf(100000, t), 99);
});

test('ecdfAt is a step function: the share at the last point at or below x', () => {
  const c = { tokens: [10, 20, 30], cum_share: [0.1, 0.5, 1] };
  assert.equal(ecdfAt(c, 5), 0);
  assert.equal(ecdfAt(c, 20), 0.5);
  assert.equal(ecdfAt(c, 29), 0.5);
  assert.equal(ecdfAt(c, 1000), 1);
});

test('ecdf data: curves are non-decreasing and end at 1 for every file type and group', () => {
  for (const f of ['claude', 'agents']) for (const g of ['established', 'long_tail', 'overall']) {
    const c = ecdf.files[f][g];
    assert.equal(c.tokens.length, c.cum_share.length);
    for (let i = 1; i < c.tokens.length; i++) { assert.ok(c.tokens[i] >= c.tokens[i - 1]); assert.ok(c.cum_share[i] >= c.cum_share[i - 1]); }
    assert.ok(c.cum_share[c.cum_share.length - 1] > 0.99);
  }
});

test('commands: tool:target form, split on &&, test and build flagged', () => {
  const t = ['Run `npm test` or `pnpm run build`.', FENCE + 'bash', '$ make lint && cargo test', 'cd app && uv run pytest', '# comment', FENCE, 'Use `just dev`.'].join('\n');
  const got = findCommands(t);
  assert.deepEqual(got.map((c) => c.cmd), ['npm:test', 'pnpm:build', 'make:lint', 'cargo:test', 'uv:pytest', 'just:dev']);
  assert.deepEqual(got.filter((c) => c.testBuild).map((c) => c.cmd), ['npm:test', 'pnpm:build', 'cargo:test', 'uv:pytest']);
});

test('imports: @path outside code and not an email or a decorator in a code span', () => {
  const t = ['@docs/api.md', 'See @README.md and mail me@example.com', 'inline `@scope/pkg` is code', FENCE, '@docs/ignored.md', FENCE].join('\n');
  assert.deepEqual(findImports(t), ['docs/api.md', 'README.md']);
});

test('analyze: sample document, worked by hand', () => {
  const a = analyze(DOC, cal);
  assert.equal(a.lines, 25);
  assert.equal(a.init, true);
  assert.equal(a.tree, true);
  assert.deepEqual(a.overviews, [{ title: 'Overview', lines: 18 }]);
  assert.equal(a.tokens, Math.ceil(DOC.length / 3.952314165497896));
  assert.equal(a.commands.length, 1);
  assert.equal(a.testBuild.length, 1);
  assert.ok(a.overviewShare > 0.5 && a.overviewShare < 1);
  assert.ok(a.treeShare > 0 && a.treeShare < a.overviewShare);
});

test('analyze: empty text is all zeros', () => {
  const a = analyze('', cal);
  assert.equal(a.tokens, 0); assert.equal(a.overviewShare, 0); assert.equal(a.tree, false);
});

test("don't-style rule lines are counted once per line", () => {
  const a = analyze(['Never push to main.', "Don't skip tests. Do not squash. Avoid mocks.", 'Fine line.', "It must not fail", 'neverending'].join('\n'), cal);
  assert.equal(a.dontLines, 3);
});

test('suggestions use real numbers from the data and stay between one and five', () => {
  const a = analyze(DOC, cal);
  const s = suggestions(a, nums, 'claude', 40);
  assert.ok(s.length >= 3 && s.length <= 5);
  assert.ok(s.some((x) => x.id === 'overview' && x.text.includes('17% (16% to 18%)')));
  assert.ok(s.some((x) => x.id === 'init' && x.text.includes('41%') && x.text.includes('7%')));
  assert.equal(suggestions(analyze('plain text', cal), nums, 'claude', 10).some((x) => x.id === 'commands'), true);
});

// Reference: the numbers bundle itself (site-data/numbers.json, read as written; none are recomputed here).
test('facts read the bundle: totals add up and the headline values match', () => {
  assert.equal(nums.totals.n_files_total, nums.totals.n_claude_files + nums.totals.n_agents_files);
  const f = facts({ data: { numbers: nums, calibration: cal } });
  assert.equal(f.files, '39,535');
  assert.equal(f.sigOverview, '87%');
  assert.equal(f.nosigOverview, '28%');
  assert.equal(f.medianTokens, '1,379');
  assert.equal(f.hooksShare, '4.1%');
});

test('link classes add up to 1 in every group', () => {
  for (const g of ['established', 'long_tail', 'overall']) {
    const v = (k) => nums.numbers[`repo.${g}.link.class.${k}`].value;
    const sum = ['symlink', 'import_bridge', 'prose_pointer', 'near_copy', 'independent'].reduce((s, k) => s + v(k), 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `${g}: ${sum}`);
  }
});
