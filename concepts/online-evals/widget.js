// Online evals: planning an A/B test, and why peeking breaks it.
// Sample size per arm for two proportions: n = (z_alpha/2 + z_beta)^2 * (p0(1-p0) + p1(1-p1)) / delta^2.
import { el, svg, fmt, slider, meter, nextId, radios } from '../../shared/lib.js';
import { normalQuantile, mulberry32, normalSample } from '../../shared/stats.js';

const zSum = (alpha, power) => normalQuantile(1 - alpha / 2) + normalQuantile(power);

/** Users needed in EACH arm to detect a lift of delta over a baseline rate p0. */
export function sampleSizePerArm({ p0, delta, alpha = 0.05, power = 0.8 }) {
  const p1 = p0 + delta;
  return (zSum(alpha, power) ** 2 * (p0 * (1 - p0) + p1 * (1 - p1))) / (delta * delta);
}

/** The smallest lift that nPerArm users per arm can detect (inverse of the above, by bisection). */
export function minDetectableLift({ p0, nPerArm, alpha = 0.05, power = 0.8 }) {
  let lo = 1e-6, hi = Math.min(0.999 - p0, 0.9);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sampleSizePerArm({ p0, delta: mid, alpha, power }) > nPerArm) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

export const daysNeeded = (nPerArm, usersPerDay) => Math.ceil((2 * nPerArm) / usersPerDay);

/**
 * One A/A test: both arms are identical, so any "win" is a false alarm. The z statistic is checked at `looks` equally spaced
 * moments. Returns the z at each look and the first look where |z| > 1.96, or null. Uses Gaussian increments, so z at look j
 * is the running sum over sqrt(j) steps.
 */
export function simulateAA(rng, looks, zCrit = 1.959964) {
  let sum = 0; const z = []; let firstCrossing = null;
  for (let j = 1; j <= looks; j++) {
    sum += normalSample(rng);
    const zj = sum / Math.sqrt(j);
    z.push(zj);
    if (firstCrossing === null && Math.abs(zj) > zCrit) firstCrossing = j;
  }
  return { z, firstCrossing };
}

/** Share of A/A tests that declare a winner at some look when you stop at the first one. */
export function falseWinRate(looks, trials, seed) {
  const rng = mulberry32(seed); let wins = 0;
  for (let t = 0; t < trials; t++) if (simulateAA(rng, looks).firstCrossing !== null) wins++;
  return wins / trials;
}

export const SIZES = [500, 1000, 2000, 5000, 20000];
const num = (x) => Math.round(x).toLocaleString('en-US');
const pts = (x) => `${(x * 100).toFixed(1)}`;

export function facts(ex) {
  const n = sampleSizePerArm({ p0: ex.p0, delta: ex.lift }), n4 = sampleSizePerArm({ p0: ex.p0, delta: ex.lift / 4 });
  const week = minDetectableLift({ p0: ex.p0, nPerArm: (ex.perDay * 7) / 2 });
  const f = { p0: `${(ex.p0 * 100).toFixed(0)}`, lift: pts(ex.lift), perDay: num(ex.perDay), n: num(Math.ceil(n)), days: String(daysNeeded(Math.ceil(n), ex.perDay)), n4: num(Math.ceil(n4)), ratio: fmt(n4 / n, 1), week: pts(week) };
  for (const l of ex.breaks.looksList) f[`fw.${l}`] = `${(falseWinRate(l, ex.breaks.trials, ex.breaks.seed) * 100).toFixed(0)}%`;
  f.miller = '26.1';
  return f;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const state = { p0: example.p0, lift: example.lift, size: example.perDay };
  const pS = slider({ label: 'Baseline rate (for example, thumbs-up)', min: 0.02, max: 0.5, step: 0.01, value: state.p0, format: (v) => `${(v * 100).toFixed(0)}%`, onInput: (v) => { state.p0 = v; render(); } });
  const lS = slider({ label: 'Lift you want to detect, in points', min: 0.005, max: 0.1, step: 0.005, value: state.lift, format: (v) => `+${pts(v)}`, onInput: (v) => { state.lift = v; render(); } });
  const tS = slider({ label: 'Users per day (both arms)', min: 0, max: SIZES.length - 1, step: 1, value: SIZES.indexOf(state.size), format: (i) => num(SIZES[i]), onInput: (i) => { state.size = SIZES[i]; render(); } });
  const cards = { n: el('div', { class: 'card' }), days: el('div', { class: 'card' }), week: el('div', { class: 'card' }), small: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls' }, pS.root, lS.root, tS.root), el('div', { class: 'cards' }, cards.n, cards.days, cards.week, cards.small),
    el('p', { class: 'legend' }, 'Significance 5% (two-sided), power 80%. The baseline and lift are rates of a yes/no metric.'));
  function render() {
    const { p0, lift, size } = state, n = Math.ceil(sampleSizePerArm({ p0, delta: lift })), d = daysNeeded(n, size);
    const week = minDetectableLift({ p0, nPerArm: (size * 7) / 2 }), n4 = Math.ceil(sampleSizePerArm({ p0, delta: lift / 4 }));
    const card = (box, title, value, unit, text) => box.replaceChildren(el('div', { class: 'card-head' }, el('strong', {}, title)),
      el('div', { class: 'score-line' }, el('span', { class: 'num' }, value), el('span', { class: 'meta' }, unit)), el('p', { class: 'story hide-s' }, text));
    card(cards.n, 'Users per arm', num(n), 'in each of A and B', `To see a rise from ${(p0 * 100).toFixed(0)}% to ${((p0 + lift) * 100).toFixed(1)}% eight times in ten, each arm needs ${num(n)} users.`);
    card(cards.days, 'Days to run', String(d), d === 1 ? 'day' : 'days', `With ${num(size)} users a day split in two, ${num(2 * n)} users take ${d} day${d === 1 ? '' : 's'}.`);
    card(cards.week, 'Detectable in a week', `+${pts(week)}`, 'points', `One week of traffic can only see lifts of about ${pts(week)} points or more.`);
    card(cards.small, 'A quarter of the lift', num(n4), 'users per arm', `A lift 4 times smaller needs about ${fmt(n4 / n, 0)} times the users. The users needed grow with 1 over the lift squared.`);
  }
  render();
  return { state };
}

/** "Where it breaks": peeking. Look at an A/A test again and again and stop at the first win. */
function mountBreaks(root, example) {
  const { trials, seed, looksList, pathSeed } = example.breaks;
  const state = { looks: looksList.at(-2) };
  const out = el('div', { 'aria-live': 'polite' });
  const group = radios({ name: nextId('looks'), legend: 'You check the result', value: state.looks, options: looksList.map((l) => ({ value: l, label: l === 1 ? 'once, at the end' : `${l} times` })), onChange: (v) => { state.looks = v; draw(); } });
  root.replaceChildren(group.root, out);
  function draw() {
    const { looks } = state, rate = falseWinRate(looks, trials, seed), path = simulateAA(mulberry32(pathSeed), looks);
    const W = 360, H = 130, L = 46, R = 8, T = 8, B = 22, y = (v) => T + (1 - (v + 3) / 6) * (H - T - B), x = (j) => L + (looks === 1 ? (W - L - R) / 2 : ((j - 1) / (looks - 1)) * (W - L - R));
    const chart = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `z statistic of one A/A test at ${looks} checks.${path.firstCrossing ? ` It crosses the 1.96 line at check ${path.firstCrossing}.` : ' It never crosses the 1.96 line.'}` });
    for (const v of [-1.96, 0, 1.96]) chart.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(v), y2: y(v), 'stroke-dasharray': v === 0 ? '' : '4 3' }), svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, v === 0 ? '0' : v > 0 ? '+1.96' : '−1.96'));
    chart.append(svg('polyline', { class: 'curve-grey', fill: 'none', 'stroke-width': 2, points: path.z.map((z, j) => `${x(j + 1).toFixed(1)},${y(Math.max(-3, Math.min(3, z))).toFixed(1)}`).join(' ') }));
    path.z.forEach((z, j) => chart.append(svg('circle', { class: Math.abs(z) > 1.959964 ? 'bar-orange' : '', fill: Math.abs(z) > 1.959964 ? undefined : 'var(--card)', stroke: 'var(--ink)', cx: x(j + 1), cy: y(Math.max(-3, Math.min(3, z))), r: 3.5 })));
    chart.append(svg('text', { class: 'muted', x: L, y: H - 6 }, 'check 1'), svg('text', { class: 'muted', x: W - R, y: H - 6, 'text-anchor': 'end' }, `check ${looks}`));
    out.replaceChildren(el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'False win rate'), el('span', { class: 'meta' }, 'nothing really changed')),
        el('div', { class: 'score-line' }, meter({ value: rate, max: 0.3, ghost: 0.05, label: `False win rate ${(rate * 100).toFixed(0)}%, promised 5%` }), el('span', { class: 'num' }, `${(rate * 100).toFixed(0)}%`)),
        el('p', { class: 'story' }, `You promised 5%. Checking ${looks === 1 ? 'once' : `${looks} times and stopping at the first win`} gives ${(rate * 100).toFixed(0)}% (${trials.toLocaleString('en-US')} simulated tests).`)),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'One test where A and B are the same')), chart,
        el('p', { class: 'story' }, path.firstCrossing ? `At check ${path.firstCrossing} the line crosses ±1.96. An early stop would call this a win.` : 'This one never crosses ±1.96.'))));
  }
  draw();
  return {};
}
