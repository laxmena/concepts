// Click-through test for the nDCG page: drag, keyboard move, grades, k, the incomplete-judgments demo.
// Usage: node scripts/e2e/ndcg.mjs (needs npm run serve, Chrome, and npm i --no-save playwright)
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const base = process.env.BASE ?? 'http://localhost:8000';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('console', (m) => m.type() === 'error' && errs.push(m.text())); p.on('pageerror', (e) => errs.push(String(e)));
await p.goto(`${base}/concepts/ndcg/`); await p.waitForSelector('.rank-row');
const stat = async () => p.$$eval('#widget .stat-num', (n) => n.map((x) => x.textContent));
const titles = async () => p.$$eval('#widget .rtitle', (n) => n.map((x) => x.textContent));
assert.deepEqual(await stat(), ['3.36', '7.14', '0.47']);
// keyboard: focus rank 3 (the grade 3 "Patching" result) and press ArrowUp twice
const h3 = p.locator('#widget .handle').nth(2); await h3.focus();
await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp');
assert.equal((await titles())[0], 'Patching a bike inner tube, step by step');
assert.equal(await p.locator('#widget .handle').nth(0).evaluate((e) => e === document.activeElement), true, 'focus follows the moved row');
// top five are now grades 3 1 0 2 0: DCG@5 = 3 + 1/1.58496 + 0 + 2/2.32193 + 0 = 4.4923; 4.4923 / 7.1410 = 0.629
assert.deepEqual(await stat(), ['4.49', '7.14', '0.63']);
// drag with the mouse: drag the row at rank 8 ("Quick roadside..." is at rank 7) to the top
const before = await titles();
const idx = before.indexOf('Quick roadside flat repair (video)');
const from = await p.locator('#widget .handle').nth(idx).boundingBox();
const to = await p.locator('#widget .rank-row').first().boundingBox();
await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await p.mouse.down();
await p.mouse.move(from.x + 5, to.y + 2, { steps: 12 }); await p.mouse.up();
assert.equal((await titles())[0], 'Quick roadside flat repair (video)');
// grade a row with the keyboard-operable radio group
const top = p.locator('#widget .rank-row').first();
await top.locator('label[title="Not useful"]').click();
assert.equal(await top.getByRole('radio', { name: '0', exact: true }).isChecked(), true);
await top.getByRole('radio', { name: '0', exact: true }).focus(); await p.keyboard.press('ArrowRight');
assert.equal(await top.getByRole('radio', { name: '1', exact: true }).isChecked(), true, 'arrow keys move between grades');
// k slider by keyboard
const k = p.getByLabel(/^k: how many/); await k.focus(); await p.keyboard.press('End');
assert.equal(await k.inputValue(), '10');
assert.match((await p.$$eval('#widget .stat-label', (n) => n.map((x) => x.textContent))).join(), /DCG@10/);
await p.keyboard.press('Home');
assert.equal(await p.locator('#widget .rank-row.dim').count(), 9);
assert.equal(await p.locator('#widget .rank-row.cut').count(), 1);
// lessons follow the main widget
assert.match(await p.locator('.lesson .caption').last().innerText(), /% of the points/);
// incomplete judgments demo
const nums = async () => p.$$eval('#breaks-widget .num', (n) => n.map((x) => x.textContent));
assert.deepEqual(await nums(), ['1.00', '0.70']);
await p.getByLabel(/Ask a judge/).check();
assert.deepEqual(await nums(), ['0.75', '1.00']);
// reveal by keyboard
const rb = await p.getByRole('button', { name: 'Show answer' }).first().elementHandle(); await rb.focus(); await p.keyboard.press('Enter');
assert.equal(await rb.getAttribute('aria-expanded'), 'true');
console.log('ndcg interactions ok; console errors:', errs);
await b.close();
