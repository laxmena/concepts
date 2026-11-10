// Builds the Atom feed (feed.xml) from concepts.json. Pure: no DOM, no files. Run `npm run feed` to write it.
export const SITE = 'https://concepts.laxmena.com';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stamp = (d) => `${d}T00:00:00Z`;
// A page's date: when it was added, or (for older pages with no "added") when it was last reviewed.
const dateOf = (c) => c.added ?? c.reviewed;

export function buildFeed(manifest, site = SITE) {
  const items = manifest.concepts
    .map((c, i) => ({ c, i }))
    .sort((a, b) => dateOf(b.c).localeCompare(dateOf(a.c)) || b.i - a.i)
    .map(({ c }) => c);
  const updated = items.length ? dateOf(items[0]) : '1970-01-01';
  const entries = items.map((c) => {
    const url = `${site}/concepts/${c.slug}/`;
    return [
      '  <entry>',
      `    <title>${esc(c.title)}</title>`,
      `    <id>tag:concepts.laxmena.com,2026:${esc(c.slug)}</id>`,
      `    <link rel="alternate" type="text/html" href="${esc(url)}"/>`,
      `    <updated>${stamp(dateOf(c))}</updated>`,
      c.added ? `    <published>${stamp(c.added)}</published>` : null,
      `    <category term="${esc(c.area)}"/>`,
      `    <summary>${esc(c.idea)}</summary>`,
      '  </entry>',
    ].filter(Boolean).join('\n');
  });
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    '  <title>Concepts</title>',
    '  <subtitle>Engineering ideas you understand by changing the inputs.</subtitle>',
    `  <id>tag:concepts.laxmena.com,2026:feed</id>`,
    `  <link rel="self" type="application/atom+xml" href="${site}/feed.xml"/>`,
    `  <link rel="alternate" type="text/html" href="${site}/"/>`,
    `  <updated>${stamp(updated)}</updated>`,
    '  <author><name>laxmena</name></author>',
    ...entries,
    '</feed>',
    '',
  ].join('\n');
}
