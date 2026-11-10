import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildFeed } from './feed.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../concepts.json'));

test('feed.xml matches concepts.json (run `npm run feed` if this fails)', () => {
  assert.equal(read('../feed.xml'), buildFeed(manifest));
});

test('newest first, one entry per page, text escaped', () => {
  const m = { concepts: [
    { slug: 'old', title: 'Old & plain', idea: 'a < b', area: 'X', posts: [], reviewed: '2026-01-01' },
    { slug: 'new', title: 'New', idea: 'x', area: 'X', posts: [], added: '2026-05-02', reviewed: '2026-05-02' },
  ] };
  const xml = buildFeed(m);
  assert.ok(xml.indexOf('/concepts/new/') < xml.indexOf('/concepts/old/'));
  assert.equal((xml.match(/<entry>/g) || []).length, 2);
  assert.ok(xml.includes('Old &amp; plain') && xml.includes('a &lt; b'));
  assert.ok(xml.includes('<updated>2026-05-02T00:00:00Z</updated>'));
  assert.equal((xml.match(/<published>/g) || []).length, 1);
});
