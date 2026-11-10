// A toy model of memory, enough to show why spacing works. It is not fitted to data.
// Recall after t days is R(t) = 0.9^(t / S), where S is the stability: the days it takes recall to fall to 90%.
// A review that succeeds multiplies S by 1 + G(1 - R), where R is the recall at that moment. Waiting longer (lower R) helps more;
// reviewing at once (R close to 1) helps almost nothing. Every review here is assumed to succeed.
// Real schedulers (for example FSRS in recent Anki) fit their own curve and parameters to a learner's answers; the numbers here are made up.

import { el, svg, fmt, slider, segmented, meter } from '../../shared/lib.js';

export const recall = (t, S) => 0.9 ** (t / S);
export const gain = (R, G) => 1 + G * (1 - R);
/** Days until recall falls to `target`, for stability S. */
export const daysUntil = (target, S) => (S * Math.log(target)) / Math.log(0.9);

/**
 * When you study, and how stable the memory is after each study.
 * kind: 'cram' (studies cramGap days apart), 'fixed' (every `gap` days), 'expanding' (each time recall reaches `target`).
 */
export function makeSchedule(kind, n, p) {
  const times = [0], S = [p.S0];
  for (let k = 1; k < n; k++) {
    const dt = kind === 'cram' ? p.cramGap : kind === 'fixed' ? p.gap : daysUntil(p.target ?? 0.9, S[k - 1]);
    times.push(times[k - 1] + dt);
    S.push(S[k - 1] * gain(recall(dt, S[k - 1]), p.gain));
  }
  return { times, S };
}
/** Recall at day t, or null before the first study. */
export function recallAt(t, sch) {
  let k = -1;
  for (let i = 0; i < sch.times.length; i++) if (sch.times[i] <= t + 1e-12) k = i;
  return k < 0 ? null : recall(t - sch.times[k], sch.S[k]);
}
/** Recall just before each study after the first. */
export const beforeEach = (sch) => sch.times.slice(1).map((t, i) => recall(t - sch.times[i], sch.S[i]));
export const lowestBefore = (sch) => (sch.times.length > 1 ? Math.min(...beforeEach(sch)) : null);
/** Points of the saw-tooth curve: recall drops until each study, then jumps back to 1. */
export function curvePoints(sch, horizon, step = 0.5) {
  const pts = [];
  const marks = sch.times.filter((t) => t <= horizon);
  const grid = new Set([horizon]);
  for (let t = 0; t < horizon; t += step) grid.add(Number(t.toFixed(6)));
  marks.forEach((t) => grid.add(t));
  const ts = [...grid].sort((a, b) => a - b);
  for (const t of ts) {
    const isMark = marks.includes(t);
    if (isMark && t > 0) pts.push([t, recallAt(t - 1e-9, sch)]);
    pts.push([t, recallAt(t, sch)]);
  }
  return pts;
}

const pct = (x, d = 0) => (x > 0 && x < 0.005 ? '<1%' : `${(x * 100).toFixed(d)}%`);
const day = (t) => (Number.isInteger(t) ? String(t) : t < 1 ? fmt(t, 2) : fmt(t, 1));
export const SCHEDULES = { cram: { label: 'Cram', title: 'All the reviews in one sitting, an hour apart' }, fixed: { label: 'Every 3 days', title: 'A review every 3 days' }, expanding: { label: 'Just in time', title: 'Review each time recall falls to 90%' } };

export function facts(ex) {
  const n = ex.reviews, p = { ...ex, target: 0.9 }, H = ex.horizon;
  const c = makeSchedule('cram', n, p), f = makeSchedule('fixed', n, p), e = makeSchedule('expanding', n, p);
  const b = ex.breaks, pb = { ...p, S0: b.S0 }, bf = makeSchedule('fixed', b.reviews, pb), be = makeSchedule('expanding', b.reviews, pb);
  const bEasy = makeSchedule('fixed', b.reviews, { ...pb, S0: 6 });
  return {
    n: String(n), horizon: String(H), S0: String(ex.S0),
    cramEnd: pct(recallAt(H, c)), fixedEnd: pct(recallAt(H, f)), expEnd: pct(recallAt(H, e)),
    expDays: e.times.map(day).join(', '), expLast: day(e.times[n - 1]), fixedLast: day(f.times[n - 1]),
    gainAt90: fmt(gain(0.9, ex.gain), 1), gainAt99: fmt(gain(0.99, ex.gain), 2), gainAt50: fmt(gain(0.5, ex.gain), 1),
    bS0: String(b.S0), bN: String(b.reviews), bFixedLow: pct(lowestBefore(bf)), bExpLow: pct(lowestBefore(be)), bExpLast: day(be.times[b.reviews - 1]), bFixedLast: day(bf.times[b.reviews - 1]),
    bEasyLow: pct(lowestBefore(bEasy)),
  };
}

// ---------- drawing ----------
function chart(horizon, lines, label) {
  const W = 400, H = 190, L = 46, R = 8, T = 10, B = 26;
  const x = (t) => L + (t / horizon) * (W - L - R), y = (r) => T + (1 - r) * (H - T - B);
  const root = svg('svg', { class: 'chart tall', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0) }), svg('line', { class: 'axis', x1: L, x2: L, y1: T, y2: y(0) }),
    svg('line', { x1: L, x2: W - R, y1: y(0.9), y2: y(0.9), stroke: 'var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 4' }),
    svg('text', { class: 'muted', x: L - 4, y: y(0.9) + 4, 'text-anchor': 'end' }, '90%'), svg('text', { class: 'muted', x: L - 4, y: y(1) + 4, 'text-anchor': 'end' }, '100%'), svg('text', { class: 'muted', x: L - 4, y: y(0) + 4, 'text-anchor': 'end' }, '0%'));
  for (let t = 0; t <= horizon; t += 15) root.append(svg('text', { class: 'muted', x: x(t), y: H - 8, 'text-anchor': t === horizon ? 'end' : 'middle' }, t === 0 ? '0' : t === horizon ? `${t} days` : String(t)));
  for (const ln of lines) {
    root.append(svg('polyline', { fill: 'none', stroke: ln.color, 'stroke-width': ln.width, 'stroke-linejoin': 'round', points: curvePoints(ln.sch, horizon).map(([t, r]) => `${x(t).toFixed(1)},${y(r).toFixed(1)}`).join(' ') }));
    for (const t of ln.sch.times) if (t <= horizon) root.append(svg('circle', { cx: x(t), cy: y(0), r: ln.width > 2 ? 3 : 2, fill: ln.color, stroke: 'var(--ink)', 'stroke-width': 0.6 }));
  }
  return root;
}
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));
const days = (sch, H) => el('div', { class: 'toks' }, sch.times.filter((t) => t <= H).map((t) => el('span', { class: 'tok merged' }, day(t))));

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const p = { ...example, target: 0.9 }, H = example.horizon, state = { n: example.reviews, kind: example.schedule };
  const nS = slider({ label: 'Reviews', min: 1, max: 8, step: 1, value: state.n, format: String, onInput: (v) => { state.n = v; render(); } });
  const pick = segmented({ name: 'schedule', legend: 'When you review', value: state.kind, onChange: (v) => { state.kind = v; render(); },
    options: Object.entries(SCHEDULES).map(([value, s]) => ({ value, label: s.label, title: s.title })) });
  pick.root.classList.add('wide');
  const cards = { pic: el('div', { class: 'card' }), end: el('div', { class: 'card' }), when: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, nS.root, el('div', { class: 'seg-field' }, el('span', {}, 'When you review'), pick.root)), el('div', { class: 'cards rl q' }, cards.pic, cards.end, cards.when),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: the schedule you picked. ', el('span', { class: 'key blue' }), 'Blue: the same number of reviews as a cram. Dots on the axis are review days.'));
  function render() {
    const sch = makeSchedule(state.kind, state.n, p), cram = makeSchedule('cram', state.n, p), end = recallAt(H, sch), endC = recallAt(H, cram);
    cards.pic.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Recall over time'), el('span', { class: 'meta hide-s' }, 'toy model')),
      chart(H, [{ sch: cram, color: 'var(--blue)', width: 1.5 }, { sch, color: 'var(--orange)', width: 2.5 }], `Recall over ${H} days. ${SCHEDULES[state.kind].label} ends at ${pct(end)}, a cram ends at ${pct(endC)}.`),
      el('p', { class: 'story hide-s' }, 'Recall falls a little every day. Each review lifts it back to 100% and makes the fall slower.'));
    cards.end.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `Recall on day ${H}`)),
      el('div', { class: 'wrows' }, row('Yours', meter({ value: end, max: 1, label: `Your schedule: ${pct(end)}` }), pct(end)), row('Cram', meter({ value: endC, max: 1, color: 'blue', label: `Cram: ${pct(endC)}` }), pct(endC))),
      el('p', { class: 'story hide-s' }, `Same ${state.n} review${state.n === 1 ? '' : 's'}, different timing.`));
    cards.when.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Review days'), el('span', { class: 'tag' }, `${state.n} review${state.n === 1 ? '' : 's'}`)),
      days(sch, H), el('p', { class: 'story hide-s' }, state.kind === 'expanding' ? 'Each gap is as long as the memory can take, so the gaps grow.' : state.kind === 'fixed' ? 'Equal gaps. The memory gets stronger, but the gap stays the same.' : 'Back to back. Recall is still near 100% at each review, so little is gained.'));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const b = example.breaks, H = example.horizon, state = { S0: b.S0 };
  const sS = slider({ label: 'Days until recall hits 90% after the first study', min: 0.5, max: 6, step: 0.5, value: state.S0, format: String, onInput: (v) => { state.S0 = v; draw(); } });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls one' }, sS.root), box, el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: review just in time, when recall reaches 90%. ', el('span', { class: 'key blue' }), 'Blue: a review every 3 days.'));
  function draw() {
    const p = { ...example, S0: state.S0, target: 0.9 }, fixed = makeSchedule('fixed', b.reviews, p), exp = makeSchedule('expanding', b.reviews, p);
    const lf = lowestBefore(fixed), le = lowestBefore(exp);
    box.replaceChildren(el('div', { class: 'cards rl q' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Recall over time')),
        chart(H, [{ sch: fixed, color: 'var(--blue)', width: 1.5 }, { sch: exp, color: 'var(--orange)', width: 2.5 }], `Recall over ${H} days for an item that reaches 90% after ${state.S0} days. Every 3 days dips to ${pct(lf)} before a review.`),
        el('p', { class: 'story hide-s' }, 'The same fixed schedule is too slow for a slippery item and too fast for a sticky one.')),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Lowest recall before a review')),
        el('div', { class: 'wrows' }, row('Just in time', meter({ value: le, max: 1, label: `Just in time: ${pct(le)}` }), pct(le)), row('Every 3 days', meter({ value: lf, max: 1, color: 'blue', label: `Every 3 days: ${pct(lf)}` }), pct(lf))),
        el('p', { class: 'story hide-s' }, lf < 0.7 ? `At ${pct(lf)} you would often have forgotten it by then. This page assumes every review works.` : 'Recall stays high, but see how soon the last review comes.')),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `${b.reviews} reviews end on day`)),
        el('div', { class: 'wrows' }, row('Just in time', meter({ value: exp.times[b.reviews - 1], max: H, label: `Just in time: day ${day(exp.times[b.reviews - 1])}` }), day(exp.times[b.reviews - 1])), row('Every 3 days', meter({ value: fixed.times[b.reviews - 1], max: H, color: 'blue', label: `Every 3 days: day ${day(fixed.times[b.reviews - 1])}` }), day(fixed.times[b.reviews - 1]))),
        el('p', { class: 'story hide-s' }, `The same ${b.reviews} reviews, spread over ${day(exp.times[b.reviews - 1])} days just in time and ${day(fixed.times[b.reviews - 1])} days on a fixed gap.`))));
  }
  draw();
  return {};
}
