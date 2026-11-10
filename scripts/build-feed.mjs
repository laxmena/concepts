// Writes feed.xml from concepts.json. Run after adding a page: npm run feed
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFeed } from '../shared/feed.js';
const manifest = JSON.parse(readFileSync(new URL('../concepts.json', import.meta.url), 'utf8'));
writeFileSync(new URL('../feed.xml', import.meta.url), buildFeed(manifest));
console.log(`feed.xml: ${manifest.concepts.length} entries`);
