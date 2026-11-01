import { loadManifest } from './boot.js';

const root = document.getElementById('list');
const { concepts } = await loadManifest();
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url)).catch(() => {});
}
const areas = [...new Set(concepts.map((c) => c.area))].sort();
root.replaceChildren();
for (const area of areas) {
  const group = document.createElement('section');
  group.className = 'group';
  const h = document.createElement('h2');
  h.textContent = area;
  const ul = document.createElement('ul');
  ul.className = 'concept-list';
  for (const c of concepts.filter((x) => x.area === area)) {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = `concepts/${c.slug}/`; a.textContent = c.title;
    li.append(a);
    ul.append(li);
  }
  group.append(h, ul);
  root.append(group);
}
