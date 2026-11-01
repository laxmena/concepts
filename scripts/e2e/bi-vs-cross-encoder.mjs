// Click-through test for the bi-encoder vs cross-encoder page.
// Usage: node scripts/e2e/bi-vs-cross-encoder.mjs (needs npm run serve, Chrome, and npm i --no-save playwright)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE ?? 'http://localhost:8000';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${base}/concepts/bi-vs-cross-encoder/`); await p.waitForSelector('.side');
const cells = async () => p.$$eval('#widget .counts tbody tr', (rows) => rows.map((r) => [...r.querySelectorAll('td')].map((c) => c.textContent)));
assert.deepEqual((await cells())[1], ['1', '1,000']);           // passes per search at N = 1,000
assert.deepEqual((await cells())[2], ['1,000', '0']);           // totals before any search
const run = p.getByRole('button', { name: 'Run a search' });
await run.click();
assert.deepEqual((await cells())[2], ['1,001', '1,000']);       // N + 1 against 1 x N
await run.click();
assert.deepEqual((await cells())[2], ['1,002', '2,000']);       // saving has paid back
assert.equal(await p.locator('#widget .stage.flash').count(), 2, 'both systems flash on a search');
// slider by keyboard: End = 10^6
const n = p.getByLabel(/^N: how many/); await n.focus(); await p.keyboard.press('End');
assert.deepEqual((await cells())[1], ['1', '1,000,000']);
assert.match(await p.locator('#widget .log-row .num').last().innerText(), /hours/);
await p.keyboard.press('Home');
assert.deepEqual((await cells())[1], ['1', '10']);
// reset
await p.getByRole('button', { name: 'Start over' }).click();
assert.match(await p.locator('#widget [role=status]').first().innerText(), /Searches run: 0/);
// where it breaks: K slider
const k = p.getByLabel(/^K: how many/); await k.focus(); await p.keyboard.press('End');
assert.match(await p.locator('#breaks-widget .caption').innerText(), /top 1,000/);
assert.match(await p.locator('#breaks-widget .log-row .num').first().innerText(), /2\.8 hours/);
// reveal by keyboard
const rb = await p.getByRole('button', { name: 'Show answer' }).first().elementHandle(); await rb.focus(); await p.keyboard.press('Enter');
assert.equal(await rb.getAttribute('aria-expanded'), 'true');
console.log('bi-vs-cross interactions ok; console errors:', errs);
await b.close();
