import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { entriesFor, matchesWho, alwaysEntries, facts } from './widget.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const example = read('./example.json'), manifest = read('../../concepts.json');

test('every page on the map exists, in the manifest and on disk', () => {
  const slugs = new Set(manifest.concepts.map((c) => c.slug));
  for (const e of example.entries) {
    assert.ok(slugs.has(e.slug), `${e.slug} is not in concepts.json`);
    assert.ok(existsSync(new URL(`../${e.slug}/index.html`, import.meta.url)), `${e.slug} has no page`);
  }
  assert.equal(new Set(example.entries.map((e) => e.slug)).size, example.entries.length, 'no duplicates');
});

test('every other eval page in the manifest is on the map', () => {
  const onMap = new Set(example.entries.map((e) => e.slug));
  const evalArea = manifest.concepts.filter((c) => c.area === 'Evals' && c.slug !== 'evals-map');
  assert.ok(evalArea.length >= 11, 'the Evals area is not empty');
  for (const c of evalArea) assert.ok(onMap.has(c.slug), `${c.slug} is missing from the map`);
});

test('tags use only known options, and each eval has a blind spot and a use', () => {
  const whats = new Set(example.whatOptions.map((o) => o.id)), whos = new Set(example.whoOptions.map((o) => o.id));
  for (const e of example.entries) {
    for (const w of e.what) assert.ok(whats.has(w), `${e.slug}: ${w}`);
    for (const w of e.who) assert.ok(whos.has(w), `${e.slug}: ${w}`);
    assert.ok(e.blind && e.use, e.slug);
    if (!e.always) assert.ok(e.what.length && e.who.length, `${e.slug} needs a what and a who`);
  }
});

test('filtering', () => {
  const ans = entriesFor(example.entries, 'answer');
  assert.ok(ans.some((e) => e.slug === 'pass-at-k') && !ans.some((e) => e.slug === 'ndcg'));
  const pass = example.entries.find((e) => e.slug === 'pass-at-k');
  assert.equal(matchesWho(pass, 'any'), true); assert.equal(matchesWho(pass, 'program'), true); assert.equal(matchesWho(pass, 'people'), false);
  assert.deepEqual(alwaysEntries(example.entries).map((e) => e.slug), ['eval-error-bars', 'contamination']);
});

test('facts', () => { assert.equal(facts(example).pages, '12'); });
