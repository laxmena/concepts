// LoRA (Hu et al., 2021). The pretrained weight W (d x k) is frozen. Training learns B (d x r) and A (r x k), and the layer uses
//   W' = W + (alpha / r) * B A,     so the update  dW = (alpha / r) B A  has rank at most r and r(d + k) trainable numbers.
// The toy update here is built as dW = sum_i s_i u_i v_i^T from orthonormal columns of a Hadamard matrix, so its singular values are exactly s.
// By the Eckart-Young theorem the best rank-r approximation keeps the first r terms, and the leftover is the sum of the other s_i squared.
// LoRA learns B and A by gradient descent and never computes this SVD. The SVD shows the best that any rank r could do.

import { el, fmt, slider, segmented, meter } from '../../shared/lib.js';

/** Sylvester Hadamard matrix of size n (a power of 2), scaled by 1/sqrt(n) so its columns are orthonormal. */
export function hadamard(n) {
  const pop = (x) => { let c = 0; while (x) { c += x & 1; x >>= 1; } return c; };
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (pop(i & j) % 2 ? -1 : 1) / Math.sqrt(n)));
}
export const col = (M, j) => M.map((row) => row[j]);

/** The term s * u v^T as a matrix. */
const outer = (u, v, s) => u.map((a) => v.map((b) => s * a * b));
const add = (A, B) => A.map((row, i) => row.map((x, j) => x + B[i][j]));
const zeros = (n) => Array.from({ length: n }, () => new Array(n).fill(0));

/** The first `rank` terms of the update, which is the best rank-`rank` approximation of the full thing. */
export function update(spectrum, size, shift, rank = spectrum.length) {
  const H = hadamard(size);
  let M = zeros(size);
  for (let i = 0; i < Math.min(rank, spectrum.length); i++) M = add(M, outer(col(H, i), col(H, (i + shift) % size), spectrum[i]));
  return M;
}
export const sub = (A, B) => A.map((row, i) => row.map((x, j) => x - B[i][j]));
export const frobenius = (M) => Math.sqrt(M.reduce((s, row) => s + row.reduce((t, x) => t + x * x, 0), 0));

/** Factors B (size x r) and A (r x size) with B A equal to the rank-r approximation: each side takes sqrt(s). */
export function factors(spectrum, size, shift, rank) {
  const H = hadamard(size);
  const B = H.map((row) => Array.from({ length: rank }, (_, i) => row[i] * Math.sqrt(spectrum[i])));
  const A = Array.from({ length: rank }, (_, i) => col(H, (i + shift) % size).map((x) => x * Math.sqrt(spectrum[i])));
  return { B, A };
}
export const matmul = (X, Y) => X.map((row) => Y[0].map((_, j) => row.reduce((s, x, k) => s + x * Y[k][j], 0)));

/** Share of the update's squared size (its energy) kept by rank r, and the relative error. */
export function kept(spectrum, rank) {
  const total = spectrum.reduce((s, x) => s + x * x, 0), got = spectrum.slice(0, rank).reduce((s, x) => s + x * x, 0);
  return { energy: got / total, relError: Math.sqrt(1 - got / total) };
}

export const fullParams = (d, k) => d * k;
export const loraParams = (d, k, r) => r * (d + k);
export const loraShare = (d, k, r) => loraParams(d, k, r) / fullParams(d, k);

/** The layer's output with LoRA: x W + (alpha / r) (x B) A. The cheap order never builds the d x k update. */
export function loraForward(x, W, B, A, alpha) {
  const r = B[0].length, base = matmul([x], W)[0], low = matmul(matmul([x], B), A)[0];
  return base.map((v, j) => v + (alpha / r) * low[j]);
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const big = (n) => n.toLocaleString('en-US');
export function facts(ex) {
  const low = kept(ex.spectra.low.s, ex.rank), flat = kept(ex.spectra.flat.s, ex.rank), { d, k } = ex.real;
  const b = kept(ex.spectra[ex.breaks.spectrum].s, ex.breaks.rank);
  return {
    rank: String(ex.rank), keptLow: pct(low.energy), errLow: pct(low.relError), keptFlat: pct(flat.energy), errFlat: pct(flat.relError),
    d: big(d), k: big(k), full: big(fullParams(d, k)), lora: big(loraParams(d, k, ex.rank)), share: pct(loraShare(d, k, ex.rank), 2),
    r1: pct(kept(ex.spectra.low.s, 1).energy), r3: pct(kept(ex.spectra.low.s, 3).energy),
    bRank: String(ex.breaks.rank), bKept: pct(b.energy), bErr: pct(b.relError),
    flatR6: pct(kept(ex.spectra.flat.s, 6).energy),
  };
}

// ---------- drawing ----------

function heat(M, max, label) {
  const n = M.length;
  const root = el('div', { class: 'heat', style: `grid-template-columns: repeat(${n}, 1fr)`, role: 'img', 'aria-label': label });
  for (const row of M) for (const v of row) {
    const a = Math.min(1, Math.abs(v) / max), neg = v < 0;
    root.append(el('div', { class: `hc ${neg ? 'neg' : 'pos'}`, style: `--a:${(a * 100).toFixed(0)}%`, title: v.toFixed(2) }, neg && a > 0.12 ? '−' : ''));
  }
  return root;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const n = example.size, s = example.spectra.low.s, state = { rank: example.rank };
  const full = update(s, n, example.shift), max = Math.max(...full.flat().map(Math.abs));
  const rS = slider({ label: 'r: the rank of the update', min: 1, max: n, step: 1, value: state.rank, format: String, onInput: (v) => { state.rank = v; render(); } });
  const cards = { maps: el('div', { class: 'card' }), params: el('div', { class: 'card' }), kept: el('div', { class: 'card hide-s' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, rS.root), el('div', { class: 'cards rl' }, cards.maps, cards.params, cards.kept),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: positive numbers. ', el('span', { class: 'key blue' }), 'Blue, with a minus sign: negative numbers. Darker means larger. ', 'Orange bars: LoRA. Blue bars: full fine-tuning.'));
  function render() {
    const r = state.rank, low = update(s, n, example.shift, r), miss = sub(full, low), { energy, relError } = kept(s, r);
    const { d, k } = example.real, lp = loraParams(d, k, r), fp = fullParams(d, k);
    const map = (title, M, sub) => el('div', { class: 'hm' }, el('div', { class: 'hm-title' }, title), heat(M, max, `${title}: an ${n} by ${n} grid of numbers`), el('div', { class: 'hm-sub' }, sub));
    cards.maps.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'The update to one weight matrix'), el('span', { class: 'meta hide-s' }, `${n} × ${n} toy`)),
      el('div', { class: 'hms' }, map('Full update', full, `${n * n} numbers`), el('span', { class: 'hm-op', 'aria-hidden': 'true' }, '≈'), map(`LoRA, rank ${r}`, low, `${2 * n * r} numbers`), el('span', { class: 'hm-op', 'aria-hidden': 'true' }, '+'), map('Missed', miss, `${pct(1 - energy)} of strength`)),
      el('p', { class: 'story hide-s' }, 'Full fine-tuning can learn any update. LoRA can only learn a sum of r simple patterns, each one a column times a row.'));
    cards.params.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Numbers to train'), el('span', { class: 'meta hide-s' }, `a real ${big(d)} × ${big(k)} layer`)),
      el('p', { class: 'bar-text' }, `Full: ${big(fp)}`), meter({ value: 1, max: 1, color: 'blue', label: `Full fine-tuning trains ${big(fp)} numbers` }),
      el('p', { class: 'bar-text' }, `LoRA: ${big(lp)} (${pct(lp / fp, 2)})`), meter({ value: Math.max(lp / fp, 0.004), max: 1, label: `LoRA trains ${big(lp)} numbers` }));
    cards.kept.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'How much of the update is kept')),
      el('div', { class: 'score-line' }, meter({ value: energy, max: 1, label: `Rank ${r} keeps ${pct(energy)} of the update's strength` }), el('span', { class: 'num' }, pct(energy))),
      el('p', { class: 'story hide-s' }, `Rank ${r} keeps ${pct(energy)} of the update’s strength. The leftover is ${pct(relError)} of its size.`));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const n = example.size, state = { spectrum: example.breaks.spectrum, rank: example.breaks.rank };
  const pick = segmented({ name: 'spectrum', legend: 'Kind of update', value: state.spectrum,
    options: Object.entries(example.spectra).map(([value, sp]) => ({ value, label: sp.short, title: sp.label })), onChange: (v) => { state.spectrum = v; draw(); } });
  pick.root.classList.add('wide');
  const rS = slider({ label: 'r: the rank of the update', min: 1, max: n, step: 1, value: state.rank, format: String, onInput: (v) => { state.rank = v; draw(); } });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls one' }, el('div', { class: 'seg-field' }, el('span', {}, 'The update to learn is'), pick.root), rS.root), box);
  function draw() {
    const sp = example.spectra[state.spectrum].s, r = state.rank, full = update(sp, n, example.shift), max = Math.max(...full.flat().map(Math.abs));
    const low = update(sp, n, example.shift, r), k = kept(sp, r);
    const other = Object.entries(example.spectra).filter(([key]) => key !== state.spectrum)[0];
    const ok = kept(other[1].s, r);
    box.replaceChildren(el('div', { class: 'cards rl' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `${example.spectra[state.spectrum].label}, rank ${r}`)),
        el('div', { class: 'hms two' }, el('div', { class: 'hm' }, el('div', { class: 'hm-title' }, 'Full update'), heat(full, max, 'full update')), el('span', { class: 'hm-op', 'aria-hidden': 'true' }, '≈'), el('div', { class: 'hm' }, el('div', { class: 'hm-title' }, `Rank ${r}`), heat(low, max, `rank ${r} approximation`)))),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Strength kept at this rank')),
        el('p', { class: 'bar-text' }, `${example.spectra[state.spectrum].label}: ${pct(k.energy)}`),
        meter({ value: k.energy, max: 1, label: `${pct(k.energy)} kept` }),
        el('p', { class: 'bar-text' }, `${other[1].label}: ${pct(ok.energy)}`), meter({ value: ok.energy, max: 1, color: 'blue', label: `${other[0]}: ${pct(ok.energy)} kept` }),
        el('p', { class: 'story' }, k.energy >= 0.9 ? `Rank ${r} is enough here: ${pct(k.relError)} of the size is lost.` : `Rank ${r} loses ${pct(k.relError)} of the update’s size. It needs a higher rank to catch up.`))));
  }
  draw();
  return {};
}
