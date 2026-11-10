// Quantization: store each weight as a small whole number plus one shared scale.
// Symmetric "absmax" rounding: scale = largest |weight| in the group / (2^(bits-1) - 1); q = round(w / scale); stored value = q * scale.
// A group is the weights that share one scale. Ties round away from zero. Scales are 16-bit numbers.
// The row here has 64 weights; a real tensor row has thousands, so one scale per whole row costs almost nothing per weight.

import { el, svg, fmt, slider, segmented, meter } from '../../shared/lib.js';

export const levels = (bits) => 2 ** (bits - 1) - 1;
const roundAway = (x) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5) || 0; // `|| 0` turns -0 into 0

/** One group sharing one scale. Returns the integers, the scale and the values they stand for. */
export function quantizeGroup(values, bits) {
  const top = Math.max(...values.map(Math.abs)), L = levels(bits);
  const scale = top === 0 ? 1 : top / L;
  const q = values.map((v) => Math.max(-L, Math.min(L, roundAway(v / scale))));
  return { q, scale, deq: q.map((x) => x * scale) };
}
/** Quantize a row. groupSize null means one scale for the whole row. */
export function quantize(values, bits, groupSize = null) {
  const g = groupSize ?? values.length, q = [], deq = [], scales = [];
  for (let i = 0; i < values.length; i += g) {
    const r = quantizeGroup(values.slice(i, i + g), bits);
    q.push(...r.q); deq.push(...r.deq); scales.push(r.scale);
  }
  return { q, deq, scales, groupSize: g };
}
export const rms = (a) => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length);
export const errors = (orig, deq) => orig.map((v, i) => v - deq[i]);
/** Error as a share of the typical weight size. */
export const relativeError = (orig, deq) => rms(errors(orig, deq)) / rms(orig);
/** Bits stored per weight, counting a 16-bit scale per group. A null group is a whole real row, so its scale is free. */
export const bitsPerWeight = (bits, groupSize = null) => bits + (groupSize ? 16 / groupSize : 0);
export const modelBytes = (params, bpw) => (params * bpw) / 8;
export const withOutlier = (weights, o) => weights.map((w, i) => (i === o.index ? o.value : w));
export const without = (arr, index) => arr.filter((_, i) => i !== index);

export function formatBytes(b) {
  const units = [[1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'KB']];
  for (const [size, name] of units) if (b >= size) return `${(b / size).toFixed(b / size < 10 ? 1 : 0)} ${name}`;
  return `${b} B`;
}
const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export const SCALES = { row: { label: 'Whole row', title: 'One scale for the whole row', size: null }, g32: { label: 'Per 32', title: 'One scale for every 32 weights', size: 32 }, g8: { label: 'Per 8', title: 'One scale for every 8 weights', size: 8 } };

/** Everything the page quotes, for one setting. `outlier` swaps in the one large weight. */
export function measure(ex, bits, scaleKey, outlier) {
  const w = outlier ? withOutlier(ex.weights, ex.outlier) : ex.weights, g = SCALES[scaleKey].size;
  const r = quantize(w, bits, g), skip = outlier ? ex.outlier.index : -1;
  const small = without(w, skip), smallDeq = without(r.deq, skip), smallQ = without(r.q, skip);
  return { w, ...r, rel: relativeError(w, r.deq), relSmall: relativeError(small, smallDeq), zeros: smallQ.filter((x) => x === 0).length, smallCount: small.length,
    bpw: bitsPerWeight(bits, g), bytes: modelBytes(ex.params, bitsPerWeight(bits, g)) };
}

export function facts(ex) {
  const m = measure(ex, ex.bits, ex.scale, false), b = ex.breaks;
  const row = measure(ex, b.bits, 'row', true), g32 = measure(ex, b.bits, 'g32', true), g8 = measure(ex, b.bits, 'g8', true);
  const clean = measure(ex, b.bits, 'row', false);
  return {
    bits: String(ex.bits), levels: String(2 * levels(ex.bits) + 1), rel: pct(m.rel, 1), size: formatBytes(m.bytes), size16: formatBytes(modelBytes(ex.params, 16)),
    ratio: `${(16 / m.bpw).toFixed(1)}×`, params: `${ex.params / 1e9} billion`,
    bBits: String(b.bits), bClean: pct(clean.relSmall, 0), bRow: pct(row.relSmall, 0), bG32: pct(g32.relSmall, 0), bG8: pct(g8.relSmall, 0),
    bZerosRow: String(row.zeros), bZeros32: String(g32.zeros), bZeros8: String(g8.zeros), bSmall: String(row.smallCount),
    bSizeRow: formatBytes(row.bytes), bSize8: formatBytes(g8.bytes), bBpw8: fmt(g8.bpw, 1),
    outlier: `${Math.round(ex.outlier.value / rms(ex.weights))} times`,
  };
}

// ---------- drawing ----------
function chart(m, ex, label) {
  const W = 400, H = 190, L = 6, R = 6, T = 8, B = 8, n = m.w.length;
  const top = Math.max(...m.w.map(Math.abs)) * 1.08, mid = (T + H - B) / 2, half = (H - T - B) / 2;
  const x = (i) => L + ((i + 0.5) / n) * (W - L - R), y = (v) => mid - (v / top) * half;
  const root = svg('svg', { class: 'chart tall', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: mid, y2: mid }));
  const g = m.groupSize;
  for (let i = g; i < n; i += g) root.append(svg('line', { x1: L + (i / n) * (W - L - R), x2: L + (i / n) * (W - L - R), y1: T, y2: H - B, stroke: 'var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }));
  m.w.forEach((v, i) => {
    if (m.deq[i] !== 0) root.append(svg('line', { x1: x(i), x2: x(i), y1: y(0), y2: y(m.deq[i]), stroke: 'var(--orange)', 'stroke-width': Math.max(2, (W / n) * 0.5) }));
    root.append(svg('circle', { cx: x(i), cy: y(v), r: 2.2, fill: 'var(--blue)', stroke: 'var(--ink)', 'stroke-width': 0.6 }));
  });
  return root;
}
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));

export function mount(root, example) {
  const breaks = !!example.breaksView, start = breaks ? example.breaks : example;
  const state = { bits: start.bits, scale: start.scale, outlier: breaks ? start.outlier : false };
  const bS = slider({ label: 'Bits per weight', min: 2, max: 8, step: 1, value: state.bits, format: String, onInput: (v) => { state.bits = v; render(); } });
  const sPick = segmented({ name: breaks ? 'scale-b' : 'scale', legend: 'Weights sharing a scale', value: state.scale, onChange: (v) => { state.scale = v; render(); },
    options: Object.entries(SCALES).map(([value, s]) => ({ value, label: s.label, title: s.title })) });
  sPick.root.classList.add('wide');
  const controls = [bS.root, el('div', { class: 'seg-field' }, el('span', {}, 'Weights sharing a scale'), sPick.root)];
  if (breaks) {
    const oPick = segmented({ name: 'outlier', legend: 'The row of weights', value: state.outlier ? 'one' : 'plain', onChange: (v) => { state.outlier = v === 'one'; render(); },
      options: [{ value: 'plain', label: 'Plain', title: 'All weights about the same size' }, { value: 'one', label: 'One large', title: 'One weight many times bigger than the rest' }] });
    oPick.root.classList.add('wide');
    controls.push(el('div', { class: 'seg-field' }, el('span', {}, 'The row of weights'), oPick.root));
  }
  const cards = { pic: el('div', { class: 'card' }), err: el('div', { class: 'card' }), size: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, controls), el('div', { class: 'cards rl q' }, cards.pic, cards.err, cards.size),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange bar: the value that is stored. ', el('span', { class: 'key blue' }), 'Blue dot: the original weight.'));

  function render() {
    const m = measure(example, state.bits, state.scale, state.outlier), n = m.w.length, L = levels(state.bits);
    cards.pic.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `${n} weights`), el('span', { class: 'tag' }, `${2 * L + 1} levels`)),
      chart(m, example, `${n} weights. Blue dots are the originals, orange bars the stored values at ${state.bits} bits. ${m.scales.length} scale${m.scales.length > 1 ? 's' : ''}.`),
      el('p', { class: 'story hide-s' }, `Each weight is rounded to the nearest of ${2 * L + 1} levels: whole numbers from ${-L} to ${L} times a scale. ${m.scales.length > 1 ? 'Dashed lines mark where a new scale starts.' : 'One scale covers the whole row.'}`));
    const small = state.outlier ? 'The 63 normal weights' : 'All weights';
    cards.err.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'What rounding costs')),
      el('div', { class: 'wrows' },
        row('Error', meter({ value: m.relSmall, max: 1, label: `Error is ${pct(m.relSmall)} of a typical weight` }), pct(m.relSmall)),
        row('Zeroed', meter({ value: m.zeros, max: m.smallCount, color: 'blue', label: `${m.zeros} of ${m.smallCount} weights became zero` }), `${m.zeros}`)),
      el('p', { class: 'story hide-s' }, `${small}: the rounding error is ${pct(m.relSmall)} of a typical weight, and ${m.zeros} of ${m.smallCount} were rounded to exactly zero.`));
    const full = modelBytes(example.params, 16);
    cards.size.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Model size'), el('span', { class: 'tag' }, `${fmt(m.bpw, 1)} bits each`)),
      el('div', { class: 'wrows' },
        row('16-bit', meter({ value: full, max: full, color: 'blue', label: `16-bit: ${formatBytes(full)}` }), formatBytes(full)),
        row('Now', meter({ value: m.bytes, max: full, label: `${state.bits}-bit: ${formatBytes(m.bytes)}` }), formatBytes(m.bytes))),
      el('p', { class: 'story hide-s' }, `For a model with ${example.params / 1e9} billion weights. Fewer bits and fewer shared scales shrink the file. Each scale costs 16 bits, so a scale for every ${SCALES[state.scale].size ?? 'row of thousands of'} weights adds ${SCALES[state.scale].size ? fmt(16 / SCALES[state.scale].size, 1) : '≈0'} bits to each.`));
  }
  render();
  return { state };
}
