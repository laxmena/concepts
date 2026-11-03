// Smoke test for the evals series: every page loads without errors, the layout fits, numbers in the prose are filled,
// the "Where it breaks" widget draws, and one control on each page can be used.
// Usage: node scripts/e2e/evals.mjs [slug...] (needs npm run serve, Chrome, and npm i --no-save playwright)
import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const base = process.env.BASE ?? 'http://localhost:8000';
// slug -> flags for fit.mjs. A ranked list of ten rows may scroll on a phone.
const pages = { 'evals-map': [], 'eval-error-bars': [], 'exact-match-f1': [], 'retrieval-metrics': ['--phone-may-scroll'], 'pass-at-k': [], 'llm-as-judge': [], 'pairwise-elo': [], 'human-agreement': [], 'rag-evals': [], 'agent-evals': [], 'online-evals': [], contamination: [] };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(pages);

let failed = false;
for (const slug of wanted) {
  const fit = spawnSync('node', ['scripts/e2e/fit.mjs', slug, ...pages[slug]], { encoding: 'utf8' });
  if (fit.status !== 0) { failed = true; console.log(`FAIL ${slug} fit\n${fit.stdout}`); }
}

const browser = await chromium.launch({ channel: 'chrome' });
for (const slug of wanted) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  try {
    await page.goto(`${base}/concepts/${slug}/`);
    await page.waitForSelector('#widget .card, #widget .rank-row');
    await page.waitForSelector('#breaks-widget > *');
    const r = await page.evaluate(() => ({
      unbound: [...document.querySelectorAll('[data-bind]')].filter((n) => !n.textContent.trim()).length,
      nullText: document.body.innerText.includes('null') || document.body.innerText.includes('undefined') || document.body.innerText.includes('NaN'),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      title: document.title,
    }));
    assert.equal(r.unbound, 0, 'every data-bind is filled');
    assert.equal(r.nullText, false, 'no null, undefined or NaN in the text');
    assert.equal(r.sideways, false, 'no sideways scroll');
    // use one control: nudge the first range input, or press the first button in the widget
    const range = page.locator('#widget input[type=range]').first(), button = page.locator('#widget button:not(.handle):visible').first();
    const select = page.locator('#widget select').first(), choice = page.locator('#widget input[type=checkbox]:visible, #widget input[type=radio]:visible').first(), text = page.locator('#widget input[type=text]:visible').first();
    if (await range.count()) { await range.focus(); await page.keyboard.press('End'); }
    else if (await button.count()) await button.click();
    else if (await select.count()) await select.selectOption({ index: 1 });
    else if (await choice.count()) await choice.click();
    else await text.fill('Jane Austen | Austen');
    const again = await page.evaluate(() => document.body.innerText.includes('NaN') || document.body.innerText.includes('undefined'));
    assert.equal(again, false, 'no NaN after using a control');
    assert.deepEqual(errors, [], 'no console errors');
    console.log(`ok   ${slug}`);
  } catch (e) { failed = true; console.log(`FAIL ${slug}: ${e.message}`); }
  await page.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
