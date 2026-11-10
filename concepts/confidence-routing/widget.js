// Confidence routing on the toy decision model in shared/decision.js. A cheap model decides when its confidence reaches the threshold.
// Everything else goes to a strong model (or a person), which is assumed to be right strongAccuracy of the time and to cost costRatio times as much.
// The accuracy and cost numbers are assumptions chosen for the picture. A calibrated model is one whose stated confidence is its real accuracy.

import { el, svg, slider, segmented, meter } from '../../shared/lib.js';
import { examples, route, confidence } from '../../shared/decision.js';

export { examples, route };
const run = (ex, zs, T, thr) => route(zs, T, ex.trueT, thr, ex.strongAccuracy, ex.cheapCost, ex.cheapCost * ex.costRatio);
/**
 * The whole trade-off: one point (cost, accuracy) for each share of decisions the cheap model keeps, from none to all.
 * The thresholds are the stated confidences themselves, so the same points come out for any temperature.
 * Cost is a share of always using the strong model.
 */
export function sweep(ex, zs, T, step = 4) {
  const order = zs.map(Math.abs).sort((a, b) => b - a); // the most sure decisions first (a decision and its mirror image tie, so step in even numbers)
  const out = [];
  for (let j = 0; j <= order.length; j += step) {
    const thr = j === 0 ? 1.01 : confidence(order[j - 1], T), r = run(ex, zs, T, thr);
    out.push({ thr, share: r.share, cost: r.cost, accuracy: r.accuracy });
  }
  return out;
}
export const alwaysStrong = (ex) => ({ cost: 1, accuracy: ex.strongAccuracy });

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;

export function facts(ex) {
  const zs = examples(ex.count, ex.spread), cal = run(ex, zs, ex.trueT, ex.threshold), hi = run(ex, zs, ex.trueT, 0.95), alone = run(ex, zs, ex.trueT, 0.5);
  const b = ex.breaks, over = run(ex, zs, b.T, b.threshold), calB = run(ex, zs, ex.trueT, b.threshold);
  return {
    count: ex.count.toLocaleString('en-US'), thr: pct(ex.threshold), ratio: String(ex.costRatio), strong: pct(ex.strongAccuracy),
    aloneAcc: pct(alone.accuracy), aloneCost: pct(alone.cost, 1),
    share: pct(cal.share), cheapRight: pct(cal.cheapAccuracy), acc: pct(cal.accuracy, 1), cost: pct(cal.cost, 1), saving: pct(1 - cal.cost),
    hiShare: pct(hi.share), hiAcc: pct(hi.accuracy, 1), hiCost: pct(hi.cost, 1),
    bThr: pct(b.threshold), bShare: pct(over.share), bSaid: pct(over.saidAccuracy), bRight: pct(over.cheapAccuracy), bAcc: pct(over.accuracy, 1), bCost: pct(over.cost, 1),
    calShare: pct(calB.share), calAcc: pct(calB.accuracy, 1), calCost: pct(calB.cost, 1),
  };
}

// ---------- drawing ----------
function chart(ex, zs, T, thr, ghostT, label) {
  const W = 400, H = 210, L = 46, R = 12, Tp = 10, B = 32, lo = 0.75, hi = 1;
  const x = (c) => L + (c / 1.03) * (W - L - R), y = (a) => Tp + (1 - (a - lo) / (hi - lo)) * (H - Tp - B);
  const root = svg('svg', { class: 'chart tall', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(lo), y2: y(lo) }), svg('line', { class: 'axis', x1: L, x2: L, y1: Tp, y2: y(lo) }));
  for (const v of [0.75, 0.875, 1]) root.append(svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, pct(v, v === 0.875 ? 1 : 0)));
  for (const v of [0, 0.5, 1]) root.append(svg('text', { class: 'muted', x: x(v), y: H - 16, 'text-anchor': v === 0 ? 'start' : v === 1 ? 'end' : 'middle' }, pct(v)));
  root.append(svg('text', { class: 'muted', x: (L + W - R) / 2, y: H - 2, 'text-anchor': 'middle' }, 'cost, against always using the strong model'), svg('text', { class: 'muted', x: L + 4, y: Tp + 12 }, 'accuracy ↑'));
  const pts = sweep(ex, zs, T);
  root.append(svg('polyline', { fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 1.5, points: pts.map((p) => `${x(p.cost).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ') }));
  const strong = alwaysStrong(ex), cheap = run(ex, zs, T, 0.5);
  root.append(svg('circle', { cx: x(strong.cost), cy: y(strong.accuracy), r: 5, fill: 'var(--blue)', stroke: 'var(--ink)', 'stroke-width': 1 }), svg('text', { x: x(strong.cost) - 8, y: y(strong.accuracy) - 9, 'text-anchor': 'end' }, 'always strong'),
    svg('circle', { cx: x(cheap.cost), cy: y(cheap.accuracy), r: 5, fill: 'var(--card)', stroke: 'var(--ink)', 'stroke-width': 1.2 }), svg('text', { x: x(cheap.cost) + 9, y: y(cheap.accuracy) + 4 }, 'always cheap'));
  if (ghostT != null) { const g = run(ex, zs, ghostT, thr); root.append(svg('circle', { cx: x(g.cost), cy: y(g.accuracy), r: 6, fill: 'var(--card)', stroke: 'var(--blue)', 'stroke-width': 2.5 })); }
  const me = run(ex, zs, T, thr);
  root.append(svg('circle', { cx: x(me.cost), cy: y(me.accuracy), r: 7, class: 'bar-orange', stroke: 'var(--ink)', 'stroke-width': 1 }));
  return root;
}
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));

export function mount(root, example) {
  const breaks = !!example.breaksView, zs = examples(example.count, example.spread);
  const state = { thr: breaks ? example.breaks.threshold : example.threshold, T: breaks ? example.breaks.T : example.T, ratio: example.costRatio };
  const tS = slider({ label: 'Act when confidence is at least', min: 0.5, max: 0.99, step: 0.01, value: state.thr, format: (v) => pct(v), onInput: (v) => { state.thr = v; render(); } });
  const controls = [tS.root];
  if (breaks) {
    const mPick = segmented({ name: 'model', legend: 'The cheap model', value: state.T === example.trueT ? 'cal' : 'over', onChange: (v) => { state.T = v === 'cal' ? example.trueT : example.breaks.T; render(); },
      options: [{ value: 'cal', label: 'Calibrated', title: 'Its stated confidence matches how often it is right' }, { value: 'over', label: 'Overconfident', title: 'It says more than it delivers' }] });
    mPick.root.classList.add('wide');
    controls.push(el('div', { class: 'seg-field' }, el('span', {}, 'The cheap model is'), mPick.root));
  } else {
    controls.push(slider({ label: 'The strong model costs this many times more', min: 5, max: 100, step: 5, value: state.ratio, format: (v) => `${v}×`, onInput: (v) => { state.ratio = v; render(); } }).root);
  }
  const cards = { pic: el('div', { class: 'card' }), who: el('div', { class: 'card' }), how: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, controls), el('div', { class: 'cards rl q' }, cards.pic, cards.who, cards.how),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange dot: your threshold. ', breaks ? [el('span', { class: 'key blue' }), 'Blue ring: where the same threshold lands for a calibrated model. '] : '', 'The line is every threshold from 50% up.'));
  function render() {
    const ex = { ...example, costRatio: state.ratio }, r = run(ex, zs, state.T, state.thr), ghost = breaks && state.T !== example.trueT ? example.trueT : null;
    cards.pic.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Cost against accuracy'), el('span', { class: 'tag' }, `${pct(r.accuracy, 1)} at ${pct(r.cost)}`)),
      chart(ex, zs, state.T, state.thr, ghost, `Cost against accuracy. At a threshold of ${pct(state.thr)} the result is ${pct(r.accuracy, 1)} accurate at ${pct(r.cost)} of the cost of always using the strong model.`),
      el('p', { class: 'story hide-s' }, 'Each point on the line is one threshold. Moving right buys accuracy and spends more.'));
    cards.who.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Who decides')),
      el('div', { class: 'wrows' }, row('Cheap', meter({ value: r.share, max: 1, label: `Cheap model: ${pct(r.share)}` }), pct(r.share)), row('Strong', meter({ value: 1 - r.share, max: 1, color: 'blue', label: `Strong model: ${pct(1 - r.share)}` }), pct(1 - r.share))),
      el('p', { class: 'story hide-s' }, `The cheap model keeps what it is at least ${pct(state.thr)} sure of. The rest is passed on.`));
    cards.how.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'The cheap model’s own calls')),
      r.share > 0 ? el('div', { class: 'wrows' }, row('Says', meter({ value: r.saidAccuracy, max: 1, color: 'blue', label: `It says ${pct(r.saidAccuracy)}` }), pct(r.saidAccuracy)), row('Right', meter({ value: r.cheapAccuracy, max: 1, label: `It is right ${pct(r.cheapAccuracy)}` }), pct(r.cheapAccuracy))) : el('p', { class: 'story' }, 'It is never sure enough at this bar.'),
      el('p', { class: 'story hide-s' }, r.share > 0 ? (r.saidAccuracy - r.cheapAccuracy > 0.02 ? `It says ${pct(r.saidAccuracy)} and is right ${pct(r.cheapAccuracy)}. The threshold is promising more than it delivers.` : 'What it says matches how often it is right.') : ''));
  }
  render();
  return { state };
}
