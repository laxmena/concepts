// Checks every href/src in every .html file. Local links must resolve to a file.
// With --external, http(s) links are fetched too (404/410 fail; 401/403/429 only warn).
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const external = process.argv.includes('--external');
const skip = new Set(['.git', '.github', 'node_modules', 'vendor']);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    if (skip.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.html') && n !== 'template.html' ? [p] : [];
  });
}

const problems = [], warnings = [], seen = new Map();
for (const file of walk(root)) {
  const html = readFileSync(file, 'utf8');
  for (const [, , url] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    if (/^(mailto:|#|data:)/.test(url) || url.includes('{{')) continue;
    if (/^https?:\/\//.test(url)) { if (!seen.has(url)) seen.set(url, relative(root, file)); continue; }
    const path = resolve(dirname(file), url.split('#')[0].split('?')[0]);
    const ok = existsSync(path) && (statSync(path).isFile() || existsSync(join(path, 'index.html')));
    if (!ok) problems.push(`${relative(root, file)}: missing local target ${url}`);
  }
}

const manifest = JSON.parse(readFileSync(join(root, 'concepts.json'), 'utf8'));
for (const c of manifest.concepts) {
  for (const f of ['index.html', 'widget.js', 'example.json', 'widget.test.js'])
    if (!existsSync(join(root, 'concepts', c.slug, f))) problems.push(`concepts.json: ${c.slug} is missing ${f}`);
  for (const k of ['slug', 'title', 'idea', 'area', 'posts', 'reviewed'])
    if (!(k in c)) problems.push(`concepts.json: ${c.slug} has no "${k}"`);
}

if (external) {
  for (const [url, from] of seen) {
    let status = 0;
    for (let attempt = 0; attempt < 3 && (status === 0 || status >= 500); attempt++) {
      try {
        const res = await fetch(url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 concepts-linkcheck' }, signal: AbortSignal.timeout(20000) });
        status = res.status;
      } catch { status = 0; }
    }
    if (status === 404 || status === 410) problems.push(`${from}: ${url} returned ${status}`);
    else if (status === 0 || status >= 400) warnings.push(`${from}: ${url} returned ${status || 'no response'} (not failing)`);
  }
}

warnings.forEach((w) => console.warn('warn:', w));
if (problems.length) { problems.forEach((p) => console.error('FAIL:', p)); process.exit(1); }
console.log(`links ok (${seen.size} external${external ? ' checked' : ' skipped'})`);
