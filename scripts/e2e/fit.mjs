// Layout check for a concept page. Usage: node scripts/e2e/fit.mjs <slug> [--shots dir] [--phone-may-scroll]
// Needs a running server (npm run serve), Chrome, and: npm i --no-save playwright
// Fails if the widget's cards do not all fit in the first screen on laptop sizes, or if the page scrolls sideways.
import { chromium } from 'playwright';
const slug = process.argv[2];
if (!slug) { console.error('usage: node scripts/e2e/fit.mjs <slug> [--shots dir]'); process.exit(2); }
const shots = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const phoneMayScroll = process.argv.includes('--phone-may-scroll');
const base = process.env.BASE ?? 'http://localhost:8000';
const sizes = [['laptop', 1280, 720, true], ['laptop-large', 1440, 900, true], ['phone', 390, 844, !phoneMayScroll], ['small-phone', 360, 740, false]];
const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
for (const scheme of ['light', 'dark']) {
  for (const [name, w, h, mustFit] of sizes) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(`${base}/concepts/${slug}/`);
    await page.waitForSelector('#widget .card, #widget .rank-row');
    const r = await page.evaluate(() => ({
      bottom: Math.round(Math.max(...[...document.querySelectorAll('#widget .card, #widget .rank-row')].map((c) => c.getBoundingClientRect().bottom))),
      sideways: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }));
    const fits = r.bottom <= h;
    const bad = r.sideways || errors.length || (mustFit && !fits);
    if (bad) failed = true;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${scheme} ${name} ${w}x${h}: cards end at ${r.bottom}px${fits ? '' : ' (scrolls)'}${r.sideways ? ', SIDEWAYS SCROLL' : ''}${errors.length ? ', errors: ' + errors.join('; ') : ''}`);
    if (shots) await page.screenshot({ path: `${shots}/${slug}-${scheme}-${name}.png` });
    await ctx.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
