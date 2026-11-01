// BM25 with an inverted index. The maths is pure and exported; mount() only draws.
//
// Variant: Lucene / bm25s default ("lucene"):
//   idf(t)      = ln(1 + (N - df + 0.5) / (df + 0.5))        always > 0
//   saturation  = tf / (tf + k1 * (1 - b + b * dl / avgdl))
//   score(d, q) = sum over distinct query words t of idf(t) * saturation
// Tokeniser matches bm25s: lowercase, runs of 2+ letters/digits/underscore, no stopwords, no stemming.

import { el, svg, fmt, slider, stackedBar, editableList } from '../../shared/lib.js';

export function tokenize(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) ?? [];
}

export function idf(N, df) {
  return Math.log(1 + (N - df + 0.5) / (df + 0.5));
}

/** Per-term pieces for one (term, document) pair. */
export function termScore({ tf, dl, avgdl, idf: idfValue, k1, b }) {
  const ratio = avgdl > 0 ? dl / avgdl : 0;
  const norm = k1 * (1 - b + b * ratio);
  const denom = tf + norm;
  const saturation = tf === 0 || denom === 0 ? 0 : tf / denom;
  return { ratio, norm, saturation, contribution: idfValue * saturation };
}

/** docs: [{id, text}]. Returns lengths, average length and postings: term -> Map(docIndex -> tf). */
export function buildIndex(docs) {
  const postings = new Map();
  const docLens = docs.map((d, i) => {
    const tokens = tokenize(d.text);
    for (const t of tokens) {
      if (!postings.has(t)) postings.set(t, new Map());
      const list = postings.get(t);
      list.set(i, (list.get(i) ?? 0) + 1);
    }
    return tokens.length;
  });
  const N = docs.length;
  const avgdl = N ? docLens.reduce((a, c) => a + c, 0) / N : 0;
  return { N, docLens, avgdl, postings };
}

export function scoreCorpus({ query, docs, k1, b }) {
  const index = buildIndex(docs);
  const queryTerms = [...new Set(tokenize(query))]; // repeated query words count once
  const termInfo = queryTerms.map((term) => {
    const df = index.postings.get(term)?.size ?? 0;
    return { term, df, idf: idf(index.N, df) };
  });
  const results = docs.map((d, i) => {
    const dl = index.docLens[i];
    const terms = termInfo.map(({ term, df, idf: idfValue }) => {
      const tf = index.postings.get(term)?.get(i) ?? 0;
      return { term, df, idf: idfValue, tf, ...termScore({ tf, dl, avgdl: index.avgdl, idf: idfValue, k1, b }) };
    });
    return { id: d.id, length: dl, terms, count: terms.reduce((n, t) => n + t.tf, 0), score: terms.reduce((s, t) => s + t.contribution, 0) };
  });
  return { index, queryTerms, results };
}

/** Numbers quoted in the page prose, computed from the default example so they cannot drift. */
export function defaultFacts(example) {
  const { index, results } = scoreCorpus(example);
  const f = { N: String(index.N), avgdl: fmt(index.avgdl, 1) };
  const A = results.find((r) => r.id === 'A');
  const tA = A.terms[0];
  f['satOne'] = fmt(termScore({ tf: 1, dl: A.length, avgdl: index.avgdl, idf: tA.idf, k1: example.k1, b: example.b }).saturation, 2);
  for (const r of results) {
    f[`score.${r.id}`] = fmt(r.score, 3);
    f[`len.${r.id}`] = String(r.length);
    for (const t of r.terms) {
      f[`tf.${r.id}.${t.term}`] = String(t.tf);
      f[`sat.${r.id}.${t.term}`] = fmt(t.saturation, 2);
      f[`idf.${t.term}`] = fmt(t.idf, 2);
      f[`df.${t.term}`] = String(t.df);
    }
  }
  const nob = scoreCorpus({ ...example, b: 0 }).results.find((r) => r.id === 'B');
  f['scoreB.b0'] = fmt(nob.score, 3);
  const zero = scoreCorpus({ ...example, query: 'automobile' }).results.find((r) => r.id === 'C');
  f['score.C.automobile'] = fmt(zero.score, 3);
  return f;
}

/** Worth of a word that appears in 1, 2, ... N of N documents. Rarer means bigger. */
export function idfCoins(N) {
  return Array.from({ length: N }, (_, i) => ({ df: i + 1, idf: idf(N, i + 1) }));
}

/** What the 1st, 2nd, ... mention of one word adds to a document's score. Each piece is smaller. */
export function repeatGains({ idf: idfValue, dl, avgdl, k1, b, max = 5 }) {
  const out = [];
  let before = 0;
  for (let n = 1; n <= max; n++) {
    const total = termScore({ tf: n, dl, avgdl, idf: idfValue, k1, b }).contribution;
    out.push({ n, gain: total - before, total });
    before = total;
  }
  return out;
}

/** One match of the same word, in a short document and in a long one. */
export function sameMatch({ idf: idfValue, avgdl, k1, b, shortLen, longLen }) {
  const points = (dl) => termScore({ tf: 1, dl, avgdl, idf: idfValue, k1, b }).contribution;
  return { short: points(shortLen), long: points(longLen) };
}

// ---------- drawing ----------

/** The most one document can score: every query word fully "used up". Fills the bar outline. */
export function ceiling(results) {
  return (results[0]?.terms ?? []).reduce((sum, t) => sum + t.idf, 0);
}

/** One plain sentence about why a document got its score. */
export function story(result, avgdl) {
  const hit = result.terms.filter((t) => t.tf > 0);
  if (!result.terms.length) return 'Type a search above.';
  if (!hit.length) return 'Has no search word, so it gets 0.';
  const ratio = avgdl > 0 ? result.length / avgdl : 1;
  const size = ratio >= 1.5 ? 'Long.' : ratio <= 0.7 ? 'Short.' : 'About average length.';
  const says = 'Has ' + hit.map((t) => (t.tf === 1 ? `“${t.term}” once` : `“${t.term}” ${t.tf} times`)).join(' and ') + '.';
  const note = ratio >= 1.5 ? ' Each match counts less.' : ratio <= 0.7 ? ' Each match counts more.' : '';
  return `${size} ${says}${note}`;
}

/** One card per document. The strip has one square per word, so length is easy to compare.
 *  Matching words become orange tiles that show the word. The bar is the score. */
function docCard(result, text, queryTerms, max, maxCount, compare, avgdl) {
  const words = tokenize(text).map((w) => queryTerms.includes(w)
    ? el('span', { class: 'tile match' }, w)
    : el('span', { class: 'sq', title: w }));
  const hit = result.terms.filter((t) => t.tf > 0);
  const detail = hit.length ? hit.map((t) => `${t.term} ${fmt(t.contribution, 2)}`).join(' + ') : '';
  const label = `Score for document ${result.id}: ${fmt(result.score, 2)}, ${result.count} matching words`;
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' },
      el('strong', {}, `Doc ${result.id}`),
      el('span', { class: 'meta' }, `${result.length} words`),
      !hit.length && queryTerms.length ? el('span', { class: 'tag' }, 'never read') : null),
    el('div', { class: 'strip' }, words),
    el('div', { class: 'score-line' },
      stackedBar({ segments: hit.map((t) => ({ value: t.contribution })), max, ghost: compare ? { value: result.count, max: maxCount } : null, label }),
      el('span', { class: 'num' }, fmt(result.score, 2))),
    detail || compare ? el('div', { class: 'bar-text muted' }, detail + (compare ? `${detail ? '  ·  ' : ''}plain count ${result.count}` : '')) : null,
    el('p', { class: 'story' }, story(result, avgdl)));
}

function legend(compare) {
  return el('p', { class: 'legend' },
    el('span', { class: 'key orange' }), 'Orange bar: the score, one piece per search word. The outline is the most a document could get.',
    compare ? [' ', el('span', { class: 'key blue' }), 'Blue bar: plain count of matching words.'] : null);
}

function renderRows(box, r, docs, compare = false) {
  const max = ceiling(r.results);
  const maxCount = Math.max(1, ...r.results.map((x) => x.count));
  box.replaceChildren(
    el('div', { class: 'cards' }, r.results.map((res, i) => docCard(res, docs[i].text, r.queryTerms, max, maxCount, compare, r.index.avgdl))),
    legend(compare));
}

function mathsTable(result) {
  const head = ['Word', 'Times in doc', 'Rarity (IDF)', 'Length ÷ average', 'Count effect', 'Points'];
  const body = result.terms.map((t) => el('tr', { class: t.tf ? 'hit' : 'miss' },
    el('td', {}, t.term), el('td', {}, String(t.tf)), el('td', {}, fmt(t.idf)), el('td', {}, fmt(t.ratio, 2)),
    el('td', {}, fmt(t.saturation)), el('td', {}, fmt(t.contribution))));
  return el('div', {},
    el('h4', {}, `Document ${result.id}`),
    el('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': `Numbers for document ${result.id}` },
      el('table', {},
        el('thead', {}, el('tr', {}, head.map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, body),
        el('tfoot', {}, el('tr', {}, el('td', { colspan: '5' }, 'Score'), el('td', {}, fmt(result.score)))))));
}

function indexView({ index, queryTerms }, ids) {
  const lists = queryTerms.map((t) => {
    const posts = [...(index.postings.get(t) ?? [])];
    return el('div', { class: 'lookup' },
      el('span', { class: 'chip word' }, t), el('span', { 'aria-hidden': 'true' }, '→'),
      posts.length
        ? posts.map(([i, tf]) => el('span', { class: 'chip doc' }, `${ids[i]} × ${tf}`))
        : el('span', { class: 'muted' }, 'no document has this word'));
  });
  return el('div', {},
    el('p', { class: 'muted' }, 'The index keeps one list per word: the documents that contain it, and how many times. A search reads only the lists for its own words.'),
    ...lists);
}

export function mount(root, example) {
  const state = { query: example.query, k1: example.k1, b: example.b, showIndex: false, compare: false };
  const docs = example.docs.map((d) => ({ ...d }));
  const listeners = [];

  const queryId = 'bm25-query';
  const queryInput = el('input', { type: 'text', id: queryId, value: state.query, autocomplete: 'off', spellcheck: 'false', placeholder: 'Search for…' });
  queryInput.addEventListener('input', () => { state.query = queryInput.value; render(); });
  const k1 = slider({ label: 'k1: how fast extra mentions stop helping', min: 0, max: 3, step: 0.05, value: state.k1, format: (v) => v.toFixed(2), onInput: (v) => { state.k1 = v; render(); } });
  const b = slider({ label: 'b: how much long documents lose', min: 0, max: 1, step: 0.05, value: state.b, format: (v) => v.toFixed(2), onInput: (v) => { state.b = v; render(); } });
  const toggle = el('input', { type: 'checkbox', id: 'bm25-index-toggle' });
  toggle.addEventListener('change', () => { state.showIndex = toggle.checked; render(); });

  const cmp = el('input', { type: 'checkbox', id: 'bm25-compare-toggle' });
  cmp.addEventListener('change', () => { state.compare = cmp.checked; render(); });

  const indexBox = el('div', { class: 'index-box', hidden: true });
  const rowsBox = el('div', { 'aria-live': 'polite' });
  const mathsBox = el('div');
  let list = null; // render() runs while editableList is being built, before this is set
  list = editableList({ items: docs, noun: 'Document', min: 1, max: 6, onChange: () => render(), onRowChange: () => render() });

  root.replaceChildren(
    el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: queryId }, 'Search for'), queryInput), k1.root, b.root),
    el('div', { class: 'toggles' },
      el('div', { class: 'check' }, toggle, el('label', { for: 'bm25-index-toggle' }, 'Show the index lookup')),
      el('div', { class: 'check' }, cmp, el('label', { for: 'bm25-compare-toggle' }, 'Compare with a plain word count'))),
    indexBox, rowsBox,
    el('details', {}, el('summary', {}, 'Change the documents'), list.root),
    el('details', {}, el('summary', {}, 'Show the numbers'), mathsBox));

  function render() {
    if (!list) return;
    const r = scoreCorpus({ query: state.query, docs, k1: state.k1, b: state.b });
    renderRows(rowsBox, r, docs, state.compare);
    indexBox.hidden = !state.showIndex;
    if (state.showIndex) indexBox.replaceChildren(indexView(r, docs.map((d) => d.id)));
    mathsBox.replaceChildren(...r.results.map(mathsTable));
    listeners.forEach((fn) => fn(state));
  }
  render();
  return { state, subscribe: (fn) => { listeners.push(fn); fn(state); } };
}

/** "Where it breaks": one big card for the synonym document, small bars for the others. */
export function mountBreaks(root, example) {
  const presets = ['car', 'automobile', 'car automobile'];
  const rowsBox = el('div', { class: 'breaks-box', 'aria-live': 'polite' });
  const group = el('fieldset', { class: 'field' }, el('legend', {}, 'Search for'));
  presets.forEach((q, i) => {
    const id = `breaks-${i}`;
    const radio = el('input', { type: 'radio', name: 'breaks-query', id, value: q });
    if (i === 0) radio.checked = true;
    radio.addEventListener('change', () => draw(q));
    group.append(el('div', { class: 'check' }, radio, el('label', { for: id }, `“${q}”`)));
  });
  root.replaceChildren(group, rowsBox);
  function draw(q) {
    const r = scoreCorpus({ ...example, query: q });
    const max = ceiling(r.results);
    const maxCount = 1;
    const i = r.results.findIndex((x) => x.id === 'C');
    const others = r.results.filter((x) => x.id !== 'C').map((res) => el('div', { class: 'mini' },
      el('span', { class: 'mini-label' }, `Doc ${res.id}`),
      stackedBar({ segments: res.terms.filter((t) => t.tf > 0).map((t) => ({ value: t.contribution })), max, label: `Score for document ${res.id}: ${fmt(res.score, 2)}` }),
      el('span', { class: 'num' }, fmt(res.score, 2))));
    rowsBox.replaceChildren(
      docCard(r.results[i], example.docs[i].text, r.queryTerms, max, maxCount, false, r.index.avgdl),
      el('div', { class: 'compact' }, ...others));
  }
  draw(presets[0]);
}

const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];

/** Three small pictures, one per rule. The last two follow the k1 and b sliders. */
export function mountLessons(root, example, api) {
  const base = scoreCorpus(example);
  const word = base.results[0].terms[0];            // "car"
  const second = base.results[0].terms[1];          // "repair"
  const lens = base.index.docLens;
  const shortLen = lens[0], longLen = Math.max(...lens), avgdl = base.index.avgdl;
  const N = base.index.N;

  // 1. rare words: coins, bigger means worth more
  const coins = idfCoins(N);
  const top = Math.max(...coins.map((c) => c.idf));
  const W = 360, step = W / N;
  const coinSvg = svg('svg', { class: 'chart', viewBox: `0 0 ${W} 132`, role: 'img',
    'aria-label': 'A word in 1 of 4 documents is worth the most. A word in all 4 is worth the least.' });
  coins.forEach((c, i) => {
    const cx = step * i + step / 2, r = 6 + 28 * Math.sqrt(c.idf / top);
    const mark = [word, second].find((t) => t && t.df === c.df);
    coinSvg.append(
      svg('circle', { class: 'bar-orange', cx, cy: 58, r }),
      mark ? svg('text', { x: cx, y: 14, 'text-anchor': 'middle', 'font-weight': '700' }, `“${mark.term}”`) : null,
      mark ? svg('line', { class: 'axis', x1: cx, x2: cx, y1: 18, y2: 58 - r - 3 }) : null,
      svg('text', { x: cx, y: 112, 'text-anchor': 'middle' }, `in ${c.df} of ${N}`),
      svg('text', { class: 'muted', x: cx, y: 127, 'text-anchor': 'middle' }, fmt(c.idf, 2)));
  });
  const cap1 = el('p', { class: 'caption' }, 'The fewer documents have a word, the bigger its coin. A word in every document earns almost nothing, because it cannot help you choose.');

  // 2. repeats: one bar, cut into the pieces each mention adds
  const repeatBox = el('div');
  const cap2 = el('p', { class: 'caption' });
  // 3. length: the same single match in a short and a long document
  const lengthBox = el('div');
  const cap3 = el('p', { class: 'caption' });

  const lesson = (title, ...kids) => el('div', { class: 'lesson' }, el('h3', {}, title), ...kids);
  root.replaceChildren(
    lesson('A rare word is a better clue.', coinSvg, cap1),
    lesson('Saying it again helps less.', repeatBox, cap2),
    lesson('A match in a long text is a weaker clue.', lengthBox, cap3));

  api.subscribe(({ k1, b }) => {
    const gains = repeatGains({ idf: word.idf, dl: shortLen, avgdl, k1, b, max: 4 });
    repeatBox.replaceChildren(
      stackedBar({ segments: gains.map((g) => ({ value: g.gain })), max: word.idf,
        label: `Points each mention of ${word.term} adds: ` + gains.map((g) => `${ORDINAL[g.n - 1]} ${fmt(g.gain, 2)}`).join(', ') }),
      el('p', { class: 'bar-text muted' }, gains.map((g) => `${ORDINAL[g.n - 1]} +${fmt(g.gain, 2)}`).join('   ')));
    cap2.textContent = 'Each mention of “' + word.term + '” adds a piece, and each piece is smaller. The k1 slider sets how fast the pieces shrink.';

    const m = sameMatch({ idf: word.idf, avgdl, k1, b, shortLen, longLen });
    const row = (label, value, color) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, label),
      stackedBar({ segments: [{ value }], max: word.idf, color, label: `${label}: ${fmt(value, 2)} points` }),
      el('span', { class: 'num' }, fmt(value, 2)));
    lengthBox.replaceChildren(row(`One “${word.term}” in ${shortLen} words`, m.short, 'orange'), row(`One “${word.term}” in ${longLen} words (the comparison)`, m.long, 'blue'));
    cap3.textContent = m.long < m.short * 0.995
      ? 'The same match earns less in a long text. The b slider sets how much less.'
      : 'With b at 0, length does not matter. Raise b and the long text loses points.';
  });
}
