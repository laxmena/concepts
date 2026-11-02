// Click-through test for the BM25 page: keyboard, toggles, editing, offline reload.
// Usage: node scripts/e2e/bm25.mjs (needs npm run serve, Chrome, and npm i --no-save playwright)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE ?? 'http://localhost:8000';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('console', m => m.type()==='error' && errs.push(m.text())); p.on('pageerror', e => errs.push(String(e)));
await p.goto(`${base}/concepts/bm25/`); await p.waitForSelector('.card');
const nums = async () => p.$$eval('#widget .num', n => n.map(x => x.textContent));
assert.deepEqual(await nums(), ['0.72','0.42','0.21','0.00']);
// keyboard: focus b slider via label, press Home -> 0
const bs = p.getByLabel(/^b: how much/); await bs.focus(); await p.keyboard.press('Home');
assert.equal(await bs.inputValue(), '0');
assert.equal((await nums())[1], '0.55');
// index toggle by label
await p.getByLabel('Show the index lookup').check();
assert.equal(await p.locator('.lookup').count(), 2);
assert.match(await p.locator('.lookup').first().innerText(), /car.*A × 2.*B × 1/s);
// compare toggle
await p.getByLabel('Compare with a plain word count').check();
assert.ok(await p.locator('#widget .bar-blue').count() >= 3);
// cards are ranked best first, with a rank tag
assert.deepEqual(await p.$$eval('#widget .rank', n => n.map(x => x.textContent)), ['#1','#2','#3','#4']);
assert.deepEqual(await p.$$eval('#widget .card strong', n => n.map(x => x.textContent)), ['Doc A','Doc B','Doc D','Doc C']);
// edit query to a synonym
await p.getByLabel('Search for').first().fill('automobile');
assert.deepEqual(await nums(), ['0.63','0.00','0.00','0.00']);
// edit a document, add and remove
await p.locator('summary', { hasText: 'Try your own documents' }).click();
await p.getByRole('textbox', { name: 'Document D' }).fill('automobile automobile automobile');
{ const n = await nums(); assert.ok(Number(n[0]) > Number(n[1]), n.join()); assert.match(await p.locator('#widget .card').first().innerText(), /Doc D/); };
await p.getByRole('button', { name: 'Add document' }).click();
assert.equal(await p.locator('#widget .card').count(), 5);
await p.getByRole('button', { name: 'Remove document E' }).click();
assert.equal(await p.locator('#widget .card').count(), 4);
// numbers table
await p.locator('summary', { hasText: 'Show the numbers' }).click();
assert.ok(await p.locator('#widget table').count() === 4);
// breaks widget
await p.getByLabel('“automobile”').check();
assert.equal((await p.$$eval('#breaks-widget .num', n => n.map(x => x.textContent)))[0], '0.71');
// reveal button by keyboard
const rb = await p.getByRole('button', { name: 'Show answer' }).first().elementHandle(); await rb.focus(); await p.keyboard.press('Enter');
assert.equal(await rb.getAttribute('aria-expanded'), 'true');
// service worker registered + offline reload
await p.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
await p.reload(); await p.waitForSelector('.card');
await ctx.setOffline(true); await p.reload(); await p.waitForSelector('.card');
assert.ok(await p.locator('#widget .card').count() === 4);
console.log('interactions ok; console errors:', errs);
await b.close();
