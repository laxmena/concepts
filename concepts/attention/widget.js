// Attention, one query at a time. Scores are query . key, divided by a number, then softmax turns them into weights
// that sum to 1. The output is the weights-weighted average of the value vectors (Vaswani et al., 2017, equation 1).
// The vectors here are made up by hand in two dimensions (money, nature) so the picture fits on a page. A real model learns them.
// To keep one picture, each word's key and value are the same vector. In a real model they are two different learned projections.

import { el, svg, fmt, slider, segmented, meter, stackedBar } from '../../shared/lib.js';

export const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Softmax, shifted by the maximum so large scores do not overflow. */
export function softmax(scores) {
  const m = Math.max(...scores);
  const e = scores.map((s) => Math.exp(s - m));
  const t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}

/** One query attending to some words. Returns the raw scores, the weights, and the weighted average of the values. */
export function attend(query, words, divisor) {
  const scores = words.map((w) => dot(query, w.v) / divisor);
  const weights = softmax(scores);
  const dims = query.length;
  const output = Array.from({ length: dims }, (_, i) => weights.reduce((s, wt, j) => s + wt * words[j].v[i], 0));
  return { scores, weights, output };
}

/** What you get with no attention: every word counts the same. */
export const plainAverage = (words) => attend(words[0].v.map(() => 0), words, 1).output;

// ---- cost of the n x n table of scores ----
export const scoreCount = (n) => n * n;
export const tableBytes = (n, bytesEach = 2) => n * n * bytesEach;
export const contextLength = (exponent) => 2 ** exponent;

export function formatCount(x) {
  const units = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
  for (const [size, name] of units) if (x >= size) return `${(x / size).toFixed(x / size < 10 ? 1 : 0)} ${name}`;
  return String(Math.round(x));
}
export function formatBytes(b) {
  const units = [[1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'KB']];
  for (const [size, name] of units) if (b >= size) return `${(b / size).toFixed(b / size < 10 ? 1 : 0)} ${name}`;
  return `${b} B`;
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const leans = (v, axes) => (v[1] > v[0] ? axes[1] : axes[0]);

export function facts(ex) {
  const f = { divisor: String(ex.divisor) };
  for (const [key, s] of Object.entries(ex.sentences)) {
    const words = s.words, q = words[s.query];
    const r = attend(ex.queryVector, words, ex.divisor);
    const top = r.weights.indexOf(Math.max(...r.weights));
    const avg = plainAverage(words);
    f[`${key}Top`] = words[top].w;
    f[`${key}TopW`] = pct(r.weights[top]);
    f[`${key}Equal`] = pct(1 / words.length);
    f[`${key}Money`] = fmt(r.output[0], 2);
    f[`${key}Nature`] = fmt(r.output[1], 2);
    f[`${key}Leans`] = leans(r.output, ex.axes);
    f[`${key}AvgNature`] = fmt(avg[1], 2);
    f[`${key}Self`] = pct(r.weights[s.query]);
    f[`${key}Alone`] = `${fmt(q.v[0], 1)} ${ex.axes[0]}, ${fmt(q.v[1], 1)} ${ex.axes[1]}`;
  }
  const n = contextLength(ex.breaks.exponent);
  f.n = n.toLocaleString('en-US'); f.scores = scoreCount(n).toLocaleString('en-US'); f.scoresWords = formatCount(scoreCount(n));
  f.bytes = formatBytes(tableBytes(n));
  return f;
}

// ---------- drawing ----------

function plane(state, ex, sentence, r) {
  const W = 300, H = 230, L = 34, B = 30, T = 8, R = 10, max = 1.1;
  const x = (v) => L + (v / max) * (W - L - R), y = (v) => H - B - (v / max) * (H - B - T);
  const root = svg('svg', { class: 'chart plane', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Words placed by ${ex.axes[0]} and ${ex.axes[1]}. ${sentence.words[sentence.query].w} moves from 0.5 and 0.5 to ${fmt(r.output[0], 2)} ${ex.axes[0]} and ${fmt(r.output[1], 2)} ${ex.axes[1]}.` });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }), svg('line', { class: 'axis', x1: L, x2: L, y1: T, y2: y(0) }),
    svg('text', { class: 'muted', x: W - R, y: H - 8, 'text-anchor': 'end' }, `${ex.axes[0]} →`),
    svg('text', { class: 'muted', x: L + 4, y: T + 12 }, `↑ ${ex.axes[1]}`));
  const q = ex.queryVector, k = max / Math.max(q[0], q[1]);
  root.append(svg('line', { x1: x(0), y1: y(0), x2: x(q[0] * k), y2: y(q[1] * k), stroke: 'var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
  sentence.words.forEach((w, i) => {
    const wt = r.weights[i];
    root.append(svg('circle', { cx: x(w.v[0]), cy: y(w.v[1]), r: 3 + wt * 14, fill: 'var(--sq)', stroke: 'var(--ink-2)', 'stroke-width': 1 }));
    if (wt >= 0.12 && i !== sentence.query) root.append(svg('text', { x: x(w.v[0]) + 10 + wt * 10, y: y(w.v[1]) + 4 }, w.w));
  });
  const me = sentence.words[sentence.query].v;
  root.append(
    svg('line', { x1: x(me[0]), y1: y(me[1]), x2: x(r.output[0]), y2: y(r.output[1]), stroke: 'var(--orange)', 'stroke-width': 2 }),
    svg('circle', { cx: x(me[0]), cy: y(me[1]), r: 5, fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 1.5 }),
    svg('circle', { cx: x(r.output[0]), cy: y(r.output[1]), r: 7, class: 'bar-orange' }),
    svg('text', { x: x(me[0]) + 9, y: y(me[1]) + 16, class: 'muted' }, 'bank alone'),
    svg('text', { x: x(r.output[0]) + 11, y: y(r.output[1]) - 8 }, 'bank here'));
  return root;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const state = { sentence: example.sentence, divisor: example.divisor };
  const pick = segmented({ name: 'sentence', legend: 'Sentence: river or loan', value: state.sentence,
    options: Object.entries(example.sentences).map(([value, s]) => ({ value, label: s.short, title: s.label })),
    onChange: (v) => { state.sentence = v; render(); } });
  const div = slider({ label: 'Divide scores by', min: 0.5, max: 4, step: 0.25, value: state.divisor, format: (v) => String(v), onInput: (v) => { state.divisor = v; render(); } });
  const cards = { weights: el('div', { class: 'card' }), picture: el('div', { class: 'card' }), result: el('div', { class: 'card' }) };
  root.replaceChildren(
    el('div', { class: 'controls' }, pick.root, div.root),
    el('div', { class: 'cards three' }, cards.weights, cards.picture, cards.result),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: how much “bank” looks at each word, and where its meaning ends up. ', el('span', { class: 'key blue' }), 'Blue: what plain averaging would give.'));

  function render() {
    const s = example.sentences[state.sentence];
    const r = attend(example.queryVector, s.words, state.divisor);
    const avg = plainAverage(s.words);
    const equal = 1 / s.words.length;
    cards.weights.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Who “bank” looks at'), el('span', { class: 'meta hide-s' }, `“${s.label}”`)),
      el('div', { class: 'wrows' }, s.words.map((w, i) => el('div', { class: 'wrow' },
        el('span', { class: i === s.query ? 'wword self' : 'wword' }, w.w),
        meter({ value: r.weights[i], max: 1, ghost: equal, label: `${w.w}: ${pct(r.weights[i])}` }),
        el('span', { class: 'num sm' }, pct(r.weights[i]))))),
      el('p', { class: 'story hide-s' }, `Each weight comes from how well that word’s vector lines up with what “bank” is asking for. The thin blue tick-bar is an equal share, ${pct(equal)}.`));
    cards.picture.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Meaning space'), el('span', { class: 'meta hide-s' }, 'bigger dot, bigger weight')),
      plane(state, example, s, r),
      el('p', { class: 'story hide-s' }, '“bank” starts in the middle. Its new position is the weighted average of every word’s vector.'));
    const rowFor = (name, i) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, name),
      meter({ value: r.output[i], max: 1, ghost: avg[i], label: `${name}: ${fmt(r.output[i], 2)}, plain average ${fmt(avg[i], 2)}` }),
      el('span', { class: 'num sm' }, fmt(r.output[i], 2)));
    cards.result.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, '“bank” after attention'), el('span', { class: 'tag' }, `leans ${leans(r.output, example.axes)}`)),
      el('div', { class: 'wrows' }, example.axes.map(rowFor)),
      el('p', { class: 'story hide-s' }, `Same word, different neighbours. Alone it is 0.5 and 0.5. In this sentence it leans ${leans(r.output, example.axes)}, and plain averaging would be less sure.`));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const state = { e: example.breaks.exponent };
  const eS = slider({ label: 'Tokens in the context', min: 7, max: 20, step: 1, value: state.e, format: (e) => contextLength(e).toLocaleString('en-US'), onInput: (e) => { state.e = e; draw(); } });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls' }, eS.root), box);
  const MAX = 40;
  function draw() {
    const n = contextLength(state.e), c = scoreCount(n), b = tableBytes(n);
    const log = (v) => Math.log2(Math.max(v, 1)) / MAX;
    const card = (title, big, bar, text) => el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, title)),
      el('div', { class: 'score-line' }, bar, el('span', { class: 'num sm' }, big)), el('p', { class: 'story' }, text));
    box.replaceChildren(el('div', { class: 'cards three' },
      card('Scores to compute', formatCount(c), meter({ value: log(c), max: 1, label: `${formatCount(c)} scores` }), `One score for every pair of tokens: ${n.toLocaleString('en-US')} × ${n.toLocaleString('en-US')}, for each head in each layer.`),
      card('Table, if you store it', formatBytes(b), meter({ value: log(b), max: 1, color: 'grey', label: `${formatBytes(b)} at 2 bytes a score` }), 'At 2 bytes a score, for one head in one layer. Kernels such as FlashAttention avoid storing it. They still compute every score.'),
      card('Twice as long', '4×', meter({ value: 0.5, max: 1, color: 'blue', label: 'Four times the scores' }), `Doubling to ${(2 * n).toLocaleString('en-US')} tokens gives ${formatCount(scoreCount(2 * n))} scores.`)));
  }
  draw();
  return {};
}
