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

// A page counts as new for 30 days after its "added" date in concepts.json.
const NEW_DAYS = 30;
const isNew = (c) => c.added && (Date.now() - Date.parse(c.added)) / 864e5 <= NEW_DAYS;
const newTag = () => {
  const t = document.createElement('span');
  t.className = 'tag new';
  t.textContent = 'New';
  return t;
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
    if (isNew(start)) p.append(newTag());
    group.append(p);
  }
  const list = document.createElement(start ? 'ol' : 'ul');
  list.className = start ? 'concept-list numbered' : 'concept-list';
  for (const c of rest) {
    const li = document.createElement('li');
    li.append(link(c));
    if (isNew(c)) li.append(newTag());
    list.append(li);
  }
  group.append(list);
  groups.append(group);
}
root.replaceChildren(groups);
