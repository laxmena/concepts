// RLHF, the last step. A reward model r(y) scores replies. The policy is pushed toward high reward, with a penalty
// beta * KL(policy || reference) that keeps it near the model it started from. For a fixed set of replies this has an exact answer:
//   maximise  sum_y p(y) r(y) - beta * KL(p || ref)   =>   p*(y) = ref(y) exp(r(y) / beta) / Z      (Rafailov et al. 2023, eq. 4)
// The reward numbers and the quality numbers here are made up to show the shape. Real reward models are learned from comparisons.

import { el, svg, fmt, slider, meter } from '../../shared/lib.js';

export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
/** Bradley-Terry: the chance the reward model says the chosen reply beats the rejected one. */
export const winProb = (rChosen, rRejected) => sigmoid(rChosen - rRejected);
/** The reward model's training loss for one comparison, -log sigmoid(r_chosen - r_rejected). */
export const comparisonLoss = (rChosen, rRejected) => -Math.log(winProb(rChosen, rRejected));

/** The best policy for a given beta. Large beta stays at the reference, small beta piles onto the top reward. */
export function optimalPolicy(ref, reward, beta) {
  const top = Math.max(...reward);
  const w = ref.map((p, i) => p * Math.exp((reward[i] - top) / beta)); // shifted by the top reward so it cannot overflow
  const z = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / z);
}
export const expectation = (p, v) => p.reduce((s, x, i) => s + x * v[i], 0);
export const kl = (p, q) => p.reduce((s, x, i) => (x > 0 ? s + x * Math.log(x / q[i]) : s), 0);
/** The objective being maximised: expected reward minus beta times KL. */
export const objective = (p, ref, reward, beta) => expectation(p, reward) - beta * kl(p, ref);

export const betaOf = (logBeta) => 10 ** logBeta;

/** Everything about one beta: the policy, the reward model's score, the quality people would give, and the distance moved. */
export function atBeta(ex, beta) {
  const ref = ex.replies.map((r) => r.ref), rew = ex.replies.map((r) => r.reward), q = ex.replies.map((r) => r.quality);
  const p = optimalPolicy(ref, rew, beta);
  return { beta, p, proxy: expectation(p, rew), quality: expectation(p, q), kl: kl(p, ref) };
}

export function curve(ex, points = 61) {
  const out = [];
  for (let i = 0; i < points; i++) out.push(atBeta(ex, i === 0 ? Infinity : betaOf(ex.maxLogBeta - (i / (points - 1)) * (ex.maxLogBeta - ex.minLogBeta))));
  return out;
}
/** The point on the curve where the quality people would give is highest, and the first point where it drops below the start. */
export function qualityTurn(ex, points = 601) {
  const c = curve(ex, points), start = c[0].quality;
  let best = c[0], below = null;
  for (const pt of c) { if (pt.quality > best.quality) best = pt; if (below === null && pt.quality < start - 1e-12) below = pt; }
  return { best, below, start };
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export function facts(ex) {
  const b = atBeta(ex, betaOf(ex.logBeta)), r0 = atBeta(ex, Infinity), k = atBeta(ex, betaOf(ex.breaks.logBeta));
  const turn = qualityTurn(ex);
  const f = { beta: fmt(betaOf(ex.logBeta), 1), proxy: fmt(b.proxy, 2), proxyRef: fmt(r0.proxy, 2), kl: fmt(b.kl, 2),
    winGood: pct(winProb(1, 0), 0), lossGood: fmt(comparisonLoss(1, 0), 2), lossBad: fmt(comparisonLoss(0, 1), 2),
    bBeta: fmt(k.beta, 2), bProxy: fmt(k.proxy, 2), bQuality: fmt(k.quality, 2), qualityRef: fmt(turn.start, 2),
    peakBeta: fmt(turn.best.beta, 1), peakQuality: fmt(turn.best.quality, 2), belowBeta: fmt(turn.below.beta, 2), bWrong: pct(k.p[ex.replies.findIndex((r) => r.id === 'wrong')]) };
  ex.replies.forEach((r, i) => { f[`p_${r.id}`] = pct(b.p[i]); f[`ref_${r.id}`] = pct(r.ref); });
  return f;
}

// ---------- drawing ----------

function changeCurve(ex, current) {
  const W = 330, H = 190, L = 34, R = 10, T = 12, B = 34, c = curve(ex), kmax = Math.max(...c.map((p) => p.kl)) * 1.02;
  const p0 = c[0], dp = c.map((p) => p.proxy - p0.proxy), dq = c.map((p) => p.quality - p0.quality);
  const lo = Math.min(...dq, 0) - 0.3, hi = Math.max(...dp, 0) + 0.1;
  const x = (v) => L + (v / kmax) * (W - L - R), y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Change from the starting model as the policy moves further away. The reward model score rises to ${fmt(Math.max(...dp), 2)} more. The quality people would give peaks at ${fmt(Math.max(...dq), 2)} more, then falls to ${fmt(Math.min(...dq), 2)}. Now: reward ${fmt(current.proxy - p0.proxy, 2)}, quality ${fmt(current.quality - p0.quality, 2)}.` });
  const line = (vals, cls) => svg('polyline', { class: cls, fill: 'none', 'stroke-width': 2.5, points: c.map((p, i) => `${x(p.kl).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ') });
  root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(0), y2: y(0), 'stroke-dasharray': '3 3' }), svg('line', { class: 'axis', x1: L, x2: L, y1: T, y2: H - B }),
    svg('text', { class: 'muted', x: L - 4, y: y(0) + 4, 'text-anchor': 'end' }, '0'),
    svg('text', { class: 'muted', x: (L + W - R) / 2, y: H - 6, 'text-anchor': 'middle' }, 'distance moved from the start (KL)'),
    svg('text', { class: 'muted', x: L, y: H - B + 14 }, '0'), svg('text', { class: 'muted', x: W - R, y: H - B + 14, 'text-anchor': 'end' }, fmt(kmax, 1)),
    line(dp, 'curve-orange'), svg('polyline', { fill: 'none', stroke: 'var(--blue)', 'stroke-width': 2.5, points: c.map((p, i) => `${x(p.kl).toFixed(1)},${y(dq[i]).toFixed(1)}`).join(' ') }),
    svg('text', { x: x(c[c.length - 1].kl) - 6, y: y(dp[dp.length - 1]) - 6, 'text-anchor': 'end' }, 'reward model'),
    svg('text', { x: x(c[c.length - 1].kl) - 6, y: y(dq[dq.length - 1]) + 16, 'text-anchor': 'end' }, 'what people think'),
    svg('line', { x1: x(current.kl), x2: x(current.kl), y1: T, y2: H - B, stroke: 'var(--ink)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
    svg('circle', { class: 'bar-orange', cx: x(current.kl), cy: y(current.proxy - p0.proxy), r: 4.5 }),
    svg('circle', { cx: x(current.kl), cy: y(current.quality - p0.quality), r: 4.5, fill: 'var(--blue)' }));
  return root;
}

const betaSlider = (ex, value, onInput) => slider({ label: 'β: leash tightness (low = loose)', min: ex.minLogBeta, max: ex.maxLogBeta, step: 0.05, value,
  format: (v) => fmt(betaOf(v), 2), onInput });

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const state = { logBeta: example.logBeta };
  const bS = betaSlider(example, state.logBeta, (v) => { state.logBeta = v; render(); });
  const cards = { replies: el('div', { class: 'card' }), score: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, bS.root),
    el('div', { class: 'cards rl' }, cards.replies, cards.score),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: how likely the tuned model is to give that reply. ', el('span', { class: 'key blue' }), 'Blue: how likely the starting model was.'));
  const ref = example.replies.map((r) => r.ref), maxReward = Math.max(...example.replies.map((r) => r.reward));
  function render() {
    const a = atBeta(example, betaOf(state.logBeta)), r0 = expectation(ref, example.replies.map((r) => r.reward));
    cards.replies.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Which reply it gives'), el('span', { class: 'meta hide-s' }, `“${example.prompt}”`)),
      el('div', { class: 'wrows rrows' }, example.replies.map((r, i) => el('div', { class: 'wrow' },
        el('span', { class: 'wword', title: r.text }, r.label),
        meter({ value: a.p[i], max: 1, ghost: r.ref, label: `${r.label}: ${pct(a.p[i])}, was ${pct(r.ref)}` }),
        el('span', { class: 'num sm' }, pct(a.p[i]))))),
      el('p', { class: 'story hide-s' }, 'The thin blue bar is where each reply started. Hover a name to read the reply.'));
    cards.score.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Reward model score'), el('span', { class: 'meta hide-s' }, 'average over replies')),
      el('div', { class: 'score-line' }, meter({ value: Math.max(0, a.proxy), max: maxReward, ghost: Math.max(0, r0), label: `Reward score ${fmt(a.proxy, 2)}, start ${fmt(r0, 2)}` }), el('span', { class: 'num' }, fmt(a.proxy, 2))),
      el('p', { class: 'bar-text' }, `Starting model: ${fmt(r0, 2)}`),
      el('div', { class: 'card-head' }, el('strong', {}, 'Distance moved'), el('span', { class: 'meta hide-s' }, 'KL, in nats')),
      el('div', { class: 'score-line' }, el('span', { class: 'num' }, fmt(a.kl, 2))),
      el('p', { class: 'story hide-s' }, 'Lower β lets the model chase reward further from where it started. The penalty β × KL is what holds it back.'));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const state = { logBeta: example.breaks.logBeta };
  const bS = betaSlider(example, state.logBeta, (v) => { state.logBeta = v; draw(); });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls one' }, bS.root), box);
  const turn = qualityTurn(example), wrongIdx = example.replies.findIndex((r) => r.id === 'wrong');
  function draw() {
    const a = atBeta(example, betaOf(state.logBeta)), r0 = atBeta(example, Infinity);
    const dq = a.quality - r0.quality, dp = a.proxy - r0.proxy;
    box.replaceChildren(el('div', { class: 'cards rl' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Change from the starting model')), changeCurve(example, a)),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `At β = ${fmt(a.beta, 2)}`), el('span', { class: dq < 0 ? 'tag' : 'meta' }, dq < 0 ? 'worse than the start' : 'better than the start')),
        el('p', { class: 'bar-text' }, `Reward model score: ${fmt(a.proxy, 2)} (${dp >= 0 ? '+' : '−'}${fmt(Math.abs(dp), 2)})`),
        meter({ value: Math.max(0, a.proxy), max: Math.max(...example.replies.map((r) => r.reward)), label: `Reward model score ${fmt(a.proxy, 2)}` }),
        el('p', { class: 'bar-text' }, `Quality people would give: ${fmt(a.quality, 2)} (${dq >= 0 ? '+' : '−'}${fmt(Math.abs(dq), 2)})`),
        meter({ value: Math.max(0, a.quality), max: 1, color: 'blue', label: `Quality ${fmt(a.quality, 2)}` }),
        el('p', { class: 'story' }, `The tuned model gives the polished wrong reply ${pct(a.p[wrongIdx])} of the time. It started at ${pct(example.replies[wrongIdx].ref)}.`))));
  }
  draw();
  return { turn };
}
