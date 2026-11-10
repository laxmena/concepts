// Calibration on a toy binary decision, using the shared model in shared/decision.js.
// The model's raw score z is divided by a temperature T before it becomes a probability. The real chance of being right
// uses its own temperature (trueT). Calibrated means T equals trueT. The 1,000 examples are evenly spaced, so nothing is random.

import { el, svg, fmt, slider, segmented, meter } from '../../shared/lib.js';
import { examples, confidence, chanceRight, reliability, ece } from '../../shared/decision.js';

export { examples, reliability, ece };
/** Among the decisions the model calls at least `cut` sure: how many, what it says, and how often it is really right. */
export function atLeast(zs, T, trueT, cut) {
  let n = 0, said = 0, right = 0;
  for (const z of zs) { const c = confidence(z, T); if (c >= cut) { n++; said += c; right += chanceRight(z, trueT); } }
  return { n, share: n / zs.length, said: n ? said / n : null, right: n ? right / n : null };
}
export const verdict = (T, trueT) => (Math.abs(T - trueT) < 0.05 ? 'calibrated' : T < trueT ? 'overconfident' : 'underconfident');

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;

export function facts(ex) {
  const zs = examples(ex.count, ex.spread), b = ex.breaks;
  const at = (T, tt, cut = ex.cut) => atLeast(zs, T, tt, cut);
  const e = (T, tt) => ece(reliability(zs, T, tt));
  return {
    count: ex.count.toLocaleString('en-US'), T: String(ex.T), trueT: String(ex.trueT), cut: pct(ex.cut),
    ece1: pct(e(ex.T, ex.trueT), 1), eceFixed: pct(e(ex.trueT, ex.trueT), 1), eceHigh: pct(e(4, ex.trueT), 1),
    said90: pct(at(ex.T, ex.trueT).said), right90: pct(at(ex.T, ex.trueT).right), share90: pct(at(ex.T, ex.trueT).share),
    bT: String(b.T), bNewTrueT: String(b.newTrueT), bEceOld: pct(e(b.T, ex.trueT), 1), bEceNew: pct(e(b.T, b.newTrueT), 1),
    bSaid: pct(at(b.T, b.newTrueT).said), bRight: pct(at(b.T, b.newTrueT).right),
  };
}

// ---------- drawing ----------
function diagram(bins, label) {
  const W = 400, H = 210, L = 44, R = 10, T = 10, B = 30;
  const x = (c) => L + ((c - 0.5) / 0.5) * (W - L - R), y = (a) => T + (1 - (a - 0.5) / 0.5) * (H - T - B);
  const root = svg('svg', { class: 'chart tall', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(0.5), y2: y(0.5) }), svg('line', { class: 'axis', x1: L, x2: L, y1: T, y2: y(0.5) }));
  for (const v of [0.5, 0.75, 1]) root.append(svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, pct(v)));
  for (const v of [0.5, 0.75, 1]) root.append(svg('text', { class: 'muted', x: x(v), y: H - 14, 'text-anchor': v === 0.5 ? 'start' : v === 1 ? 'end' : 'middle' }, pct(v)));
  root.append(svg('text', { class: 'muted', x: (L + W - R) / 2, y: H - 1, 'text-anchor': 'middle' }, 'what the model says'), svg('text', { class: 'muted', x: L + 4, y: T + 12 }, 'how often it is right ↑'));
  for (const b of bins) if (b.count) root.append(svg('rect', { class: 'bar-orange', x: x(b.lo) + 1, y: y(b.acc), width: x(b.hi) - x(b.lo) - 2, height: Math.max(0, y(0.5) - y(b.acc)) }));
  root.append(svg('line', { x1: x(0.5), y1: y(0.5), x2: x(1), y2: y(1), stroke: 'var(--ink)', 'stroke-width': 1.2, 'stroke-dasharray': '4 4' }));
  return root;
}
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));

export function mount(root, example) {
  const breaks = !!example.breaksView, zs = examples(example.count, example.spread);
  const state = { T: breaks ? example.breaks.T : example.T, newKind: false };
  const tS = slider({ label: 'Temperature T: scores are divided by this', min: 0.5, max: 4, step: 0.1, value: state.T, format: (v) => fmt(v, 1), onInput: (v) => { state.T = v; render(); } });
  const controls = [tS.root];
  if (breaks) {
    const kPick = segmented({ name: 'kind', legend: 'Kind of inputs', value: 'old', onChange: (v) => { state.newKind = v === 'new'; render(); },
      options: [{ value: 'old', label: 'Like the tuning data', title: 'The inputs the temperature was set on' }, { value: 'new', label: 'A new kind', title: 'Inputs that are harder than the tuning data' }] });
    kPick.root.classList.add('wide');
    controls.push(el('div', { class: 'seg-field' }, el('span', {}, 'Inputs it is used on'), kPick.root));
  }
  const cards = { pic: el('div', { class: 'card' }), ece: el('div', { class: 'card' }), top: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, controls), el('div', { class: 'cards rl q' }, cards.pic, cards.ece, cards.top),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange bar: how often the model is right in that group. Dashed line: what a calibrated model would show.'));
  function render() {
    const trueT = state.newKind ? example.breaks.newTrueT : example.trueT;
    const bins = reliability(zs, state.T, trueT), e = ece(bins), top = atLeast(zs, state.T, trueT, example.cut), v = verdict(state.T, trueT);
    cards.pic.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Says against right'), el('span', { class: 'tag' }, v)),
      diagram(bins, `Reliability diagram at temperature ${fmt(state.T, 1)}. Error ${pct(e, 1)}. The model is ${v}.`),
      el('p', { class: 'story hide-s' }, `Each bar is a group of decisions with similar stated confidence. A bar below the dashed line means the model says more than it delivers.`));
    cards.ece.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Calibration error')),
      el('div', { class: 'score-line' }, meter({ value: e, max: 0.25, label: `Calibration error ${pct(e, 1)}` }), el('span', { class: 'num' }, pct(e, 1))),
      el('p', { class: 'story hide-s' }, 'The average gap between what it says and how often it is right, weighted by group size.'));
    cards.top.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `When it says ${pct(example.cut)} or more`)),
      el('div', { class: 'wrows' }, top.n ? [row('Says', meter({ value: top.said, max: 1, color: 'blue', label: `Says ${pct(top.said)}` }), pct(top.said)), row('Right', meter({ value: top.right, max: 1, label: `Right ${pct(top.right)}` }), pct(top.right))] : el('p', { class: 'story' }, 'No decisions reach that confidence.')),
      el('p', { class: 'story hide-s' }, top.n ? `This is ${pct(top.share)} of all decisions. These are the ones a threshold would act on.` : ''));
  }
  render();
  return { state };
}
