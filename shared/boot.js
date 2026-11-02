// Runs on every concept page: reveals, manifest-driven footer and "Used in", offline cache.
import { initReveals } from './lib.js';

const here = (path) => new URL(path, import.meta.url);

export async function loadManifest() {
  const res = await fetch(here('../concepts.json'));
  if (!res.ok) throw new Error(`concepts.json: ${res.status}`);
  return res.json();
}

export async function bootPage() {
  initReveals(document);
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register(here('../sw.js')).catch(() => {});
  }
  const slug = document.body.dataset.slug;
  const entry = (await loadManifest()).concepts.find((c) => c.slug === slug);
  if (!entry) return null;

  const used = document.getElementById('used-in');
  if (used) {
    used.replaceChildren();
    if (entry.posts.length === 0) used.closest('section')?.setAttribute('hidden', '');
    for (const p of entry.posts) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.url; a.textContent = p.title;
      li.append(a);
      used.append(li);
    }
  }
  const reviewed = document.getElementById('reviewed');
  if (reviewed) { reviewed.textContent = entry.reviewed; reviewed.setAttribute('datetime', entry.reviewed); }
  const source = document.getElementById('source');
  if (source) source.href = `https://github.com/laxmena/concepts/tree/main/concepts/${slug}`;
  return entry;
}

/** Fill every [data-bind="key"] with facts computed from the default example. */
export function bindFacts(facts) {
  for (const n of document.querySelectorAll('[data-bind]')) {
    const key = n.dataset.bind;
    if (!(key in facts)) { console.error(`bindFacts: unknown key ${key}`); continue; }
    n.textContent = facts[key];
  }
}
