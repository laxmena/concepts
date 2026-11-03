// Error bars for eval scores. Formulas follow Miller (2024), "Adding Error Bars to Evals", arXiv:2411.00640.
// Scores are 0/1 per question, models answer deterministically (no per-question sampling noise).
import { el, svg, slider, radios, nextId } from '../../shared/lib.js';
import { normalQuantile, seBernoulli, wilson } from '../../shared/stats.js';

const Z95 = normalQuantile(0.975);

/** One model's score with its 95% range: score ± 1.96 standard errors (Miller, equations 2 and 3). */
export function scoreStats(p, n) {
  const se = seBernoulli(p, n);
  return { p, n, se, half: Z95 * se, low: p - Z95 * se, high: p + Z95 * se };
}

/** Variance of the question-level difference between two models. rho = how much they agree on which questions are hard. */
export function omega2({ pA, pB, rho = 0 }) {
  const vA = pA * (1 - pA), vB = pB * (1 - pB);
  return vA + vB - 2 * rho * Math.sqrt(vA * vB);
}

/** The gap B - A with its 95% range. Unpaired is rho = 0 (equation 4); paired uses the question-level differences (equation 7). */
export function diffStats({ pA, pB, n, paired, rho }) {
  const w2 = omega2({ pA, pB, rho: paired ? rho : 0 });
  const se = Math.sqrt(w2 / n);
  const diff = pB - pA;
  return { diff, se, low: diff - Z95 * se, high: diff + Z95 * se, z: se > 0 ? diff / se : 0, omega2: w2 };
}

/** Miller equation 9: questions needed to see a gap delta with significance alpha and power 1 - beta. */
export function questionsNeeded({ delta, omega2: w2, sigmaA2 = 0, sigmaB2 = 0, kA = 1, kB = 1, alpha = 0.05, power = 0.8 }) {
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  return (z * z * (w2 + sigmaA2 / kA + sigmaB2 / kB)) / (delta * delta);
}

/** Miller equation 10: the smallest gap that n questions can detect. */
export function minDetectable({ n, omega2: w2, sigmaA2 = 0, sigmaB2 = 0, kA = 1, kB = 1, alpha = 0.05, power = 0.8 }) {
  const z = normalQuantile(1 - alpha / 2) + normalQuantile(power);
  return z * Math.sqrt((w2 + sigmaA2 / kA + sigmaB2 / kB) / n);
}

/** Simple range and Wilson range for k correct out of n. */
export function simpleVsWilson(k, n) {
  const p = k / n;
  const s = scoreStats(p, n);
  return { p, simple: { low: Math.max(0, s.low), high: Math.min(1, s.high) }, wilson: wilson(p, n) };
}

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const pts = (x, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}`;

export function facts(ex) {
  const a = scoreStats(ex.pA, ex.n), b = scoreStats(ex.pB, ex.n);
  const un = diffStats({ ...ex, paired: false }), pa = diffStats({ ...ex, paired: true });
  const delta = ex.pB - ex.pA;
  const f = {
    n: ex.n.toLocaleString('en-US'), seA: pct(a.se), halfA: pct(a.half), lowA: pct(a.low), highA: pct(a.high),
    halfB: pct(b.half), gap: pts(delta), seGap: pct(un.se), halfGap: pct(Z95 * un.se),
    gapLow: pts(un.low), gapHigh: pts(un.high), halfGapPaired: pct(Z95 * pa.se),
    needUnpaired: Math.ceil(questionsNeeded({ delta, omega2: un.omega2, power: ex.power })).toLocaleString('en-US'),
    needPaired: Math.ceil(questionsNeeded({ delta, omega2: pa.omega2, power: ex.power })).toLocaleString('en-US'),
    rho: String(ex.rho),
  };
  const big = diffStats({ ...ex, n: 1000, paired: false });
  f.gapLow1000 = pts(big.low); f.gapHigh1000 = pts(big.high);
  for (const c of ex.breaks.cases) {
    const w = simpleVsWilson(c, c);
    f[`wilsonLow.${c}`] = pct(w.wilson.low);
  }
  return f;
}

/** A range drawn on a number line. Prints the numbers too, so colour is never the only signal. */
function rangeSvg({ low, high, point, min, max, color, zero, label, ticks }) {
  const W = 360, H = 44, x = (v) => 8 + ((Math.max(min, Math.min(max, v)) - min) / (max - min)) * (W - 16);
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('line', { class: 'axis', x1: 8, x2: W - 8, y1: 22, y2: 22 }));
  for (const t of ticks) {
    root.append(svg('line', { class: 'axis', x1: x(t.v), x2: x(t.v), y1: 18, y2: 26 }), svg('text', { class: 'muted', x: x(t.v), y: 41, 'text-anchor': t.v === min ? 'start' : t.v === max ? 'end' : 'middle' }, t.text));
  }
  if (zero != null) root.append(svg('line', { class: 'axis', x1: x(zero), x2: x(zero), y1: 6, y2: 38, 'stroke-dasharray': '3 3', style: 'stroke-width:1.5' }));
  const w = Math.max(2, x(high) - x(low));
  root.append(svg('rect', { class: `bar-${color}`, x: x(low), y: 14, width: w, height: 16 }), svg('line', { x1: x(point), x2: x(point), y1: 10, y2: 34, stroke: 'currentColor', 'stroke-width': 2.5 }));
  return root;
}

export function mount(root, example) {
  const sizes = example.sizes;
  const state = { n: example.n, pA: example.pA, pB: example.pB, paired: example.paired, rho: example.rho, power: example.power, bn: example.breaks.cases[0] };
  const out = { a: el('div', { class: 'card' }), b: el('div', { class: 'card' }), gap: el('div', { class: 'card' }), need: el('div', { class: 'card' }) };

  const nS = slider({ label: 'n: how many questions', min: 0, max: sizes.length - 1, step: 1, value: sizes.indexOf(state.n), format: (i) => sizes[i].toLocaleString('en-US'), onInput: (i) => { state.n = sizes[i]; render(); } });
  const aS = slider({ label: 'Model A score', min: 0.5, max: 0.98, step: 0.01, value: state.pA, format: (v) => pct(v, 0), onInput: (v) => { state.pA = v; render(); } });
  const bS = slider({ label: 'Model B score', min: 0.5, max: 0.98, step: 0.01, value: state.pB, format: (v) => pct(v, 0), onInput: (v) => { state.pB = v; render(); } });
  const rhoS = slider({ label: 'Agreement on which questions are hard', min: 0, max: 0.9, step: 0.05, value: state.rho, format: (v) => v.toFixed(2), onInput: (v) => { state.rho = v; render(); } });
  const pairId = nextId('paired');
  const pairBox = el('input', { type: 'checkbox', id: pairId });
  pairBox.checked = state.paired;
  pairBox.addEventListener('change', () => { state.paired = pairBox.checked; render(); });

  if (example.breaksView) return mountBreaks(root, example);

  root.replaceChildren(
    el('div', { class: 'controls' }, nS.root, el('div', {}), aS.root, bS.root),
    el('div', { class: 'toggles' }, el('div', { class: 'check' }, pairBox, el('label', { for: pairId }, 'Compare question by question (paired)')), rhoS.root),
    el('div', { class: 'cards' }, out.a, out.b, out.gap, out.need),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: model B, the one being tested. ', el('span', { class: 'key blue' }), 'Blue: model A, the baseline. The bar is the 95% range, the tick is the score.'));

  function render() {
    rhoS.root.hidden = !state.paired;
    const { n } = state;
    const a = scoreStats(state.pA, n), b = scoreStats(state.pB, n);
    const g = diffStats({ pA: state.pA, pB: state.pB, n, paired: state.paired, rho: state.rho });
    const tk = [0, 0.25, 0.5, 0.75, 1].map((v) => ({ v, text: `${v * 100}%` }));
    const modelCard = (card, name, s, color, color2) => card.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, name), el('span', { class: 'meta hide-s' }, `${n.toLocaleString('en-US')} questions`)),
      el('div', { class: 'score-line' }, el('span', { class: 'num' }, pct(s.p, 0)), el('span', { class: 'bar-text' }, `± ${pct(s.half)}`)),
      rangeSvg({ low: s.low, high: s.high, point: s.p, min: 0.4, max: 1, color, label: `${name}: ${pct(s.p, 0)}, range ${pct(s.low)} to ${pct(s.high)}`, ticks: [0.4, 0.6, 0.8, 1].map((v) => ({ v, text: `${Math.round(v * 100)}%` })) }),
      el('p', { class: 'story hide-s' }, `Could be anywhere from ${pct(s.low)} to ${pct(s.high)}.`));
    modelCard(out.a, 'Model A', a, 'blue');
    modelCard(out.b, 'Model B', b, 'orange');
    const lim = 0.15;
    const inside = g.low <= 0 && g.high >= 0;
    out.gap.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'The gap, B minus A'), el('span', { class: 'meta' }, state.paired ? 'paired' : 'unpaired')),
      el('div', { class: 'score-line' }, el('span', { class: 'num' }, `${pts(g.diff)} pts`), el('span', { class: 'bar-text' }, `± ${pct(Z95 * g.se)}`)),
      rangeSvg({ low: g.low, high: g.high, point: g.diff, min: -lim, max: lim, zero: 0, color: 'orange', label: `Gap ${pts(g.diff)} points, range ${pts(g.low)} to ${pts(g.high)}`, ticks: [-0.15, 0, 0.15].map((v) => ({ v, text: `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v * 100)}` })) }),
      el('p', { class: 'story' }, g.diff === 0 ? 'No gap to measure.' : inside
        ? `Can’t tell. The range ${pts(g.low)} to ${pts(g.high)} includes 0.`
        : `The range ${pts(g.low)} to ${pts(g.high)} stays on one side of 0, so the gap looks real.`));
    const delta = Math.abs(g.diff);
    const need = delta > 0 ? Math.ceil(questionsNeeded({ delta, omega2: g.omega2, power: state.power })) : null;
    out.need.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Questions needed'), el('span', { class: 'meta' }, '80% power')),
      el('div', { class: 'score-line' }, el('span', { class: 'num' }, need ? need.toLocaleString('en-US') : '–')),
      el('p', { class: 'bar-text muted hide-s' }, need ? `You have ${n.toLocaleString('en-US')}.` : ''),
      el('p', { class: 'story hide-s' }, need
        ? `To see a gap this size 8 times out of 10, ${state.paired ? 'comparing question by question' : 'comparing the two scores'}, you need about ${need.toLocaleString('en-US')} questions.`
        : 'Set the two scores apart to see how many questions it takes.'));
  }
  render();
  return { state };
}

/** "Where it breaks": a perfect score on a small test. */
function mountBreaks(root, example) {
  const cases = example.breaks.cases;
  const box = el('div', { 'aria-live': 'polite' });
  const seg = radios({ name: nextId('case'), legend: 'A model answers every question right. The test has', value: cases[0], options: cases.map((c) => ({ value: c, label: `${c} questions` })), onChange: draw });
  root.replaceChildren(seg.root, box);
  function draw(c = cases[0]) {
    const w = simpleVsWilson(c, c);
    const row = (name, r, color, text) => el('div', { class: 'card' },
      el('div', { class: 'card-head' }, el('strong', {}, name)),
      rangeSvg({ low: r.low, high: r.high, point: 1, min: 0.6, max: 1, color, label: `${name}: ${pct(r.low)} to ${pct(r.high)}`, ticks: [0.6, 0.8, 1].map((v) => ({ v, text: `${Math.round(v * 100)}%` })) }),
      el('p', { class: 'story' }, text));
    box.replaceChildren(el('div', { class: 'cards' },
      row('Simple range (± 1.96 SE)', w.simple, 'blue', `${pct(w.simple.low, 0)} to ${pct(w.simple.high, 0)}. No width at all, which claims certainty.`),
      row('Wilson range', w.wilson, 'orange', `${pct(w.wilson.low)} to ${pct(w.wilson.high, 0)}. ${c} answers can’t rule out a lot of misses.`)));
  }
  draw();
  return {};
}
