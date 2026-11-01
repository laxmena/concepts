// Bi-encoder vs cross-encoder: the shape of the computation. No model runs here; only counts and made-up unit costs.
//   Bi-encoder:    D documents and Q queries need D + Q model passes (documents are saved), plus D x Q cheap comparisons.
//   Cross-encoder: every (query, document) pair is read together, so D x Q model passes.
// Unit costs are illustrative (set in example.json): one model pass 10 ms, one vector comparison 1 microsecond.

import { el, svg, fmt, slider, meter, stackedBar } from '../../shared/lib.js';

export const sliderToN = (exponent) => Math.round(10 ** exponent);
export const matrixPasses = (docs, queries) => ({ bi: docs + queries, cross: docs * queries });
export const pairsToScore = (n) => (n * (n - 1)) / 2;
export const totalPasses = (n, q) => ({ bi: n + q, cross: n * q });

export function searchMs(n, { passMs, compareMs }) {
  return { bi: passMs + n * compareMs, cross: n * passMs };
}
/** Bi-encoder search for the top candidates, then the cross-encoder reads only the top k of them. */
export function rerankMs(n, k, opts) {
  return searchMs(n, opts).bi + Math.min(k, n) * opts.passMs;
}
/** The first number of searches after which saving the document vectors has cost fewer model passes in total. */
export function payoffQuery(n) {
  for (let q = 1; q < 1e6; q++) if (n + q < n * q) return q;
  return null;
}

export function formatDuration(ms) {
  if (ms < 1) return '<1 ms';
  if (ms < 10) return `${ms.toFixed(1)} ms`;
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 10) return `${s.toFixed(1)} s`;
  if (s < 60) return `${Math.round(s)} s`;
  const min = s / 60;
  if (min < 60) return `${min.toFixed(1)} min`;
  const h = min / 60;
  if (h < 48) return `${h.toFixed(1)} hours`;
  return `${(h / 24).toFixed(1)} days`;
}
const count = (n) => n.toLocaleString('en-US');

// ---------- drawing ----------

const arrow = () => el('span', { class: 'arrow', 'aria-hidden': 'true' }, '→');
const chip = (text, extra = '') => el('span', { class: `pchip ${extra}` }, text);
const box = (text, side) => el('span', { class: `pbox ${side}` }, text);
const vecs = (n = 3) => el('span', { class: 'vecs', 'aria-hidden': 'true' }, Array.from({ length: n }, () => el('span', { class: 'vec' })));
const stage = (label, ...kids) => el('div', { class: 'stage' }, el('div', { class: 'stage-label' }, label), el('div', { class: 'flow' }, ...kids));

const MAX_EXP_MS = 8;   // the log axis runs from 1 ms to 10^8 ms (about 28 hours)
const TICKS = [['1 ms', 1], ['1 s', 1e3], ['1 min', 6e4], ['1 hour', 3.6e6], ['1 day', 8.64e7]];

/** One bar per system on a log axis, with the time written at the end. */
function logChart(rows) {
  const pos = (ms) => Math.max(0, Math.min(1, Math.log10(Math.max(ms, 1)) / MAX_EXP_MS));
  const axis = el('div', { class: 'axis-row' }, el('span', {}), el('div', { class: 'ticks' }, TICKS.map(([name, ms]) =>
    el('span', { class: 'tick', style: `left:${pos(ms) * 100}%` }, name))), el('span', {}));
  return el('div', { class: 'logchart' },
    rows.map((r) => el('div', { class: 'log-row' },
      el('span', { class: 'log-label' }, r.label),
      meter({ value: pos(r.ms), max: 1, color: r.color, label: `${r.label}: ${formatDuration(r.ms)}` }),
      el('span', { class: 'num sm' }, formatDuration(r.ms)))),
    axis);
}

export function mount(root, example) {
  const opts = { passMs: example.passMs, compareMs: example.compareMs };
  const state = { exponent: example.exponent, q: 0 };
  const listeners = [];

  const nSlider = slider({ label: 'N: how many documents are searched', min: 1, max: example.maxExponent, step: 0.25, value: state.exponent,
    format: (e) => count(sliderToN(e)), onInput: (e) => { state.exponent = e; state.flash = false; render(); } });
  const runBtn = el('button', { type: 'button' }, 'Run a search');
  const resetBtn = el('button', { type: 'button' }, 'Start over');
  const queriesText = el('span', { class: 'muted', role: 'status' });
  runBtn.addEventListener('click', () => { state.q++; render(true); });
  resetBtn.addEventListener('click', () => { state.q = 0; render(); });

  const compare = el('div', { class: 'compare' });
  const timeBox = el('div');
  root.replaceChildren(
    el('div', { class: 'controls split' }, nSlider.root, el('div', { class: 'buttons' }, runBtn, resetBtn, queriesText)),
    compare, timeBox,
    el('p', { class: 'legend' }, `Made-up costs, to show the shape: ${example.passMs} ms per model pass and ${example.compareMs * 1000} microsecond per vector comparison. Real numbers depend on the model, the hardware and the index.`));

  function render(justRan = false) {
    const n = sliderToN(state.exponent);
    const tot = totalPasses(n, state.q);
    const t = searchMs(n, opts);
    queriesText.textContent = `Searches run: ${state.q}`;
    const docs = ['Doc 1', 'Doc 2', 'Doc 3'].slice(0, Math.min(3, n));
    const more = n > 3 ? chip(`… ${count(n)} docs`, 'plain') : null;
    const live = justRan ? ' flash' : '';

    const bi = el('div', { class: 'side bi' },
      el('h3', {}, el('span', { class: 'key orange' }), 'Bi-encoder'),
      stage('Ahead of time, once', docs.map((d) => chip(d)), more, arrow(), box(`Model × ${count(n)}`, 'bi'), arrow(), vecs(), el('span', { class: 'tag' }, 'saved')),
      el('div', { class: `stage${live}` },
        el('div', { class: 'stage-label' }, 'At search time', justRan ? el('span', { class: 'tag' }, 'just ran') : null),
        el('div', { class: 'flow' }, chip('Query'), arrow(), box('Model × 1', 'bi'), arrow(), vecs(1), arrow(), chip(`${count(n)} cheap comparisons`, 'plain'))));
    const pairs = docs.map((d) => chip(`Query + ${d}`));
    const cross = el('div', { class: 'side cross' },
      el('h3', {}, el('span', { class: 'key blue' }), 'Cross-encoder'),
      stage('Ahead of time', el('span', { class: 'muted' }, 'Nothing to save. Every step needs the query.')),
      el('div', { class: `stage${live}` },
        el('div', { class: 'stage-label' }, 'At search time', justRan ? el('span', { class: 'tag' }, 'just ran') : null),
        el('div', { class: 'flow' }, pairs, n > 3 ? chip('…', 'plain') : null, arrow(), box(`Model × ${count(n)}`, 'cross'), arrow(), chip(`${count(n)} scores`, 'plain'))));

    const row = (label, a, b) => el('tr', {}, el('th', { scope: 'row' }, label), el('td', {}, a), el('td', {}, b));
    const table = el('div', { class: 'table-wrap counts', role: 'region', tabindex: '0', 'aria-label': 'Model passes for each system' },
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, ''), el('th', { scope: 'col' }, 'Bi-encoder'), el('th', { scope: 'col' }, 'Cross-encoder'))),
        el('tbody', {},
          row('Model passes ahead of time', count(n), '0'),
          row('Model passes per search', '1', count(n)),
          row(`Model passes after ${state.q} ${state.q === 1 ? 'search' : 'searches'}`, count(tot.bi), count(tot.cross)))));
    compare.replaceChildren(bi, cross, table);

    timeBox.replaceChildren(el('h3', {}, 'Time for one search (log scale)'),
      logChart([{ label: 'Bi-encoder', ms: t.bi, color: 'orange' }, { label: 'Cross-encoder', ms: t.cross, color: 'blue' }]));
    listeners.forEach((fn) => fn({ n, q: state.q, total: tot }));
  }
  render();
  return { state, subscribe: (fn) => { listeners.push(fn); fn({ n: sliderToN(state.exponent), q: state.q, total: totalPasses(sliderToN(state.exponent), state.q) }); } };
}

/** Three small pictures. The middle one follows the main widget. */
export function mountLessons(root, example, api) {
  // 1. passes for 6 documents and 6 queries: an L shape against a full grid
  const D = example.queriesToShow, Q = example.queriesToShow, cell = 22, pad = 16;
  // Both grids share one frame: a header row of searches (top), a header column of documents (left), and the D x Q inner cells.
  const gridSvg = (kind) => {
    const W = pad + (Q + 1) * cell, H = pad + (D + 1) * cell;
    const g = svg('svg', { class: 'chart grid', viewBox: `0 0 ${W + 2} ${H + 2}`, role: 'img',
      'aria-label': kind === 'bi' ? `Bi-encoder: ${D + Q} model passes for ${D} documents and ${Q} searches` : `Cross-encoder: ${D * Q} model passes for ${D} documents and ${Q} searches` });
    g.append(svg('text', { class: 'muted', x: pad + cell * (Q + 1) / 2, y: 11, 'text-anchor': 'middle', style: 'font-size:11px' }, 'searches'),
      svg('text', { class: 'muted', x: 0, y: 0, 'text-anchor': 'middle', style: 'font-size:11px', transform: `translate(10 ${pad + cell * (D + 1) / 2}) rotate(-90)` }, 'documents'));
    const x0 = pad + cell, y0 = pad + cell;
    for (let r = 0; r < D; r++) for (let c = 0; c < Q; c++) {
      const x = x0 + c * cell + 2, y = y0 + r * cell + 2;
      if (kind === 'cross') g.append(svg('rect', { class: 'bar-blue', x, y, width: cell - 4, height: cell - 4 }));
      else g.append(svg('circle', { class: 'bar-grey', cx: x + (cell - 4) / 2, cy: y + (cell - 4) / 2, r: 2 }));
    }
    if (kind === 'bi') {
      for (let c = 0; c < Q; c++) g.append(svg('rect', { class: 'bar-orange', x: x0 + c * cell + 2, y: pad + 2, width: cell - 4, height: cell - 4 }));
      for (let r = 0; r < D; r++) g.append(svg('rect', { class: 'bar-orange', x: pad + 2, y: y0 + r * cell + 2, width: cell - 4, height: cell - 4 }));
    }
    return g;
  };
  const m = matrixPasses(D, Q);
  const l1 = el('div', { class: 'lesson' }, el('h3', {}, 'Saving the documents turns D × Q into D + Q.'),
    el('div', { class: 'twin' }, el('figure', {}, gridSvg('bi'), el('figcaption', {}, `Bi-encoder: ${D} + ${Q} = ${m.bi} passes`)),
      el('figure', {}, gridSvg('cross'), el('figcaption', {}, `Cross-encoder: ${D} × ${Q} = ${m.cross} passes`))),
    el('p', { class: 'caption' }, `D is the number of documents and Q the number of searches. Each square is a model pass. The bi-encoder reads each document once and each search once; the small dots are cheap comparisons. With 1,000 documents and 1,000 searches it is ${count(matrixPasses(1000, 1000).bi)} passes against ${count(matrixPasses(1000, 1000).cross)}.`));

  // 2. running totals, live
  const liveBox = el('div'), liveCap = el('p', { class: 'caption' });
  const l2 = el('div', { class: 'lesson' }, el('h3', {}, 'Saving costs N passes up front, then pays back.'), liveBox, liveCap);

  // 3. who sees what
  const strip = (kind, n) => el('span', { class: 'sqrow' }, Array.from({ length: n }, () => el('span', { class: `sq ${kind}` })));
  const l3 = el('div', { class: 'lesson' }, el('h3', {}, 'The cross-encoder reads both at once.'),
    el('div', { class: 'who' },
      el('div', { class: 'who-row' }, el('strong', {}, 'Bi-encoder'),
        el('div', { class: 'flow' }, strip('q', 4), arrow(), box('Model', 'bi'), arrow(), vecs(1), chip('query vector', 'plain')),
        el('div', { class: 'flow' }, strip('d', 8), arrow(), box('Model', 'bi'), arrow(), vecs(1), chip('document vector', 'plain')),
        el('div', { class: 'flow' }, el('span', { class: 'muted' }, 'Compare the two vectors:'), chip('one score', 'plain'))),
      el('div', { class: 'who-row' }, el('strong', {}, 'Cross-encoder'),
        el('div', { class: 'flow' }, strip('q', 4), strip('d', 8), arrow(), box('Model', 'cross'), arrow(), chip('one score', 'plain')))),
    el('p', { class: 'caption' }, 'Dark squares are the query’s words, grey squares are the document’s. The bi-encoder compresses each side into a vector before they meet. The cross-encoder lets every query word look at every document word, which costs a full pass per pair.'));

  root.replaceChildren(l1, l2, l3);

  api.subscribe(({ n, q, total }) => {
    const top = Math.max(total.bi, total.cross, 1);
    const row = (label, value, color) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, label),
      stackedBar({ segments: [{ value }], max: top, color, label: `${label}: ${count(value)}` }), el('span', { class: 'num' }, count(value)));
    liveBox.replaceChildren(row(`Bi-encoder, model passes so far`, total.bi, 'orange'), row(`Cross-encoder, model passes so far`, total.cross, 'blue'));
    liveCap.textContent = q === 0
      ? `Press Run a search above. Before any search, the bi-encoder has already spent ${count(n)} passes saving vectors, and the cross-encoder has spent none.`
      : q < payoffQuery(n)
        ? `After ${q} ${q === 1 ? 'search' : 'searches'} the bi-encoder is still behind: ${count(total.bi)} passes against ${count(total.cross)}.`
        : `After ${q} searches the bi-encoder is ahead: ${count(total.bi)} passes against ${count(total.cross)}. Every extra search adds 1 for it and ${count(n)} for the cross-encoder.`;
  });
}

/** "Where it breaks": a cross-encoder cannot search a big collection. Fix: let the bi-encoder pick, then rerank a few. */
export function mountBreaks(root, example) {
  const opts = { passMs: example.passMs, compareMs: example.compareMs };
  const n = example.break.n;
  const state = { k: example.break.k };
  const chartBox = el('div'), cap = el('p', { class: 'caption', role: 'status' });
  const kSlider = slider({ label: 'K: how many top results the cross-encoder rereads', min: 10, max: 1000, step: 10, value: state.k,
    format: (v) => count(v), onInput: (v) => { state.k = v; draw(); } });
  root.replaceChildren(el('div', { class: 'controls one' }, kSlider.root), chartBox, cap);
  function draw() {
    const t = searchMs(n, opts);
    const both = rerankMs(n, state.k, opts);
    chartBox.replaceChildren(el('h3', {}, `One search over ${count(n)} documents (log scale)`),
      logChart([
        { label: 'Cross-encoder on all', ms: t.cross, color: 'blue' },
        { label: 'Bi-encoder only', ms: t.bi, color: 'orange' },
        { label: `Bi-encoder, then cross-encoder on top ${count(state.k)}`, ms: both, color: 'grey' }]));
    cap.textContent = `Reading every document with the cross-encoder takes ${formatDuration(t.cross)}. Letting the bi-encoder pick the top ${count(state.k)} and rereading only those takes ${formatDuration(both)}.`;
  }
  draw();
}
