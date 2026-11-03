import { loadManifest } from './boot.js';

const root = document.getElementById('list');
const { concepts } = await loadManifest();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
}

const link = (c) => {
  const a = document.createElement('a');
  a.href = `concepts/${c.slug}/`; a.textContent = c.title;
  return a;
};

// Groups by area, in alphabetical order. An entry marked "start" opens its area as a series:
// it is listed first with a "Start here" tag, and the rest follow as a numbered reading order.
const areas = [...new Set(concepts.map((c) => c.area))].sort();
const groups = document.createElement('div');
groups.className = 'groups';
for (const area of areas) {
  const items = concepts.filter((x) => x.area === area);
  const start = items.find((c) => c.start);
  const rest = items.filter((c) => c !== start);
  const group = document.createElement('section');
  group.className = 'group';
  const h = document.createElement('h2');
  h.textContent = area;
  group.append(h);
  if (start) {
    const p = document.createElement('p');
    p.className = 'start';
    const tag = document.createElement('span');
    tag.className = 'tag';
    tag.textContent = 'Start here';
    p.append(link(start), tag);
    group.append(p);
  }
  const list = document.createElement(start ? 'ol' : 'ul');
  list.className = start ? 'concept-list numbered' : 'concept-list';
  for (const c of rest) {
    const li = document.createElement('li');
    li.append(link(c));
    list.append(li);
  }
  group.append(list);
  groups.append(group);
}
root.replaceChildren(groups);
