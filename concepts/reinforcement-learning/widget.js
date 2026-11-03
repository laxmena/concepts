// Reinforcement learning on a tiny grid, with tabular Q-learning (Watkins, 1989; Sutton and Barto, chapter 6).
//   Q(s,a) <- Q(s,a) + alpha * (r + gamma * max_a' Q(s',a') - Q(s,a)),  and the max term is 0 when s' ends the episode.
// The world is deterministic: reaching the goal pays +1, falling in the pit pays -1, everything else pays 0.
// The "break" view adds a coin cell that pays a small bonus on every visit, and solves the world exactly with value iteration.

import { el, svg, fmt, slider, meter } from '../../shared/lib.js';
import { mulberry32 } from '../../shared/stats.js';

export const ACTIONS = [
  { name: 'up', d: [-1, 0], glyph: '↑' }, { name: 'down', d: [1, 0], glyph: '↓' },
  { name: 'left', d: [0, -1], glyph: '←' }, { name: 'right', d: [0, 1], glyph: '→' },
];

export const makeEnv = (ex) => ({ rows: ex.rows, cols: ex.cols, start: ex.start, goal: ex.goal, pit: ex.pit, coin: ex.coin });
export const idx = (env, [r, c]) => r * env.cols + c;
export const cell = (env, i) => [Math.floor(i / env.cols), i % env.cols];
const same = (a, b) => a[0] === b[0] && a[1] === b[1];
export const isTerminal = (env, s) => same(s, env.goal) || same(s, env.pit);

/** One move. Walls keep you where you are. The coin pays `bonus` whenever a move puts you on it. */
export function step(env, s, a, bonus = 0) {
  const d = ACTIONS[a].d;
  const next = [Math.min(env.rows - 1, Math.max(0, s[0] + d[0])), Math.min(env.cols - 1, Math.max(0, s[1] + d[1]))];
  if (same(next, env.goal)) return { next, reward: 1, done: true };
  if (same(next, env.pit)) return { next, reward: -1, done: true };
  return { next, reward: same(next, env.coin) && !same(next, s) ? bonus : 0, done: false };
}

export const newQ = (env) => Array.from({ length: env.rows * env.cols }, () => [0, 0, 0, 0]);

/** The Q-learning update. Mutates and returns the new value of Q[s][a]. */
export function qUpdate(Q, s, a, reward, sNext, done, alpha, gamma) {
  const target = reward + (done ? 0 : gamma * Math.max(...Q[sNext]));
  Q[s][a] += alpha * (target - Q[s][a]);
  return Q[s][a];
}

/** Epsilon-greedy: with chance epsilon pick any action, otherwise a best one (ties broken at random). */
export function chooseAction(qs, epsilon, rng) {
  if (rng() < epsilon) return Math.floor(rng() * 4);
  const best = Math.max(...qs), ties = [0, 1, 2, 3].filter((a) => qs[a] === best);
  return ties[Math.floor(rng() * ties.length)];
}

export function runEpisode(env, Q, { alpha, gamma, epsilon, bonus = 0 }, rng, maxSteps = 100) {
  let s = env.start.slice(), steps = 0, total = 0, outcome = 'timeout';
  const path = [s];
  while (steps < maxSteps) {
    const a = chooseAction(Q[idx(env, s)], epsilon, rng);
    const { next, reward, done } = step(env, s, a, bonus);
    qUpdate(Q, idx(env, s), a, reward, idx(env, next), done, alpha, gamma);
    s = next; steps++; total += reward; path.push(s);
    if (done) { outcome = same(s, env.goal) ? 'goal' : 'pit'; break; }
  }
  return { steps, total, outcome, path };
}

/** The best value of each cell, V(s) = max_a Q(s,a), and the arrow to show (null when every action looks the same). */
export const valueOf = (Q, i) => Math.max(...Q[i]);
export function bestAction(qs) {
  const best = Math.max(...qs);
  if (best === Math.min(...qs)) return null;
  return qs.indexOf(best);
}

/** Exact solution by value iteration: repeat V(s) = max_a [r + gamma V(s')] until nothing changes. */
export function valueIteration(env, gamma, bonus = 0) {
  const n = env.rows * env.cols, V = new Array(n).fill(0);
  const q = (i) => ACTIONS.map((_, a) => { const { next, reward, done } = step(env, cell(env, i), a, bonus); return reward + (done ? 0 : gamma * V[idx(env, next)]); });
  for (let sweep = 0; sweep < 5000; sweep++) {
    let change = 0;
    for (let i = 0; i < n; i++) {
      if (isTerminal(env, cell(env, i))) continue;
      const v = Math.max(...q(i));
      change = Math.max(change, Math.abs(v - V[i])); V[i] = v;
    }
    if (change < 1e-12) break;
  }
  const Q = V.map((_, i) => (isTerminal(env, cell(env, i)) ? [0, 0, 0, 0] : q(i)));
  return { V, Q };
}

/** Follow the best action from the start. Ties go to the first action in the order up, down, left, right. */
export function greedyPath(env, Q, bonus, maxSteps) {
  let s = env.start.slice(), coins = 0, reached = false;
  const path = [s];
  for (let t = 0; t < maxSteps; t++) {
    const qs = Q[idx(env, s)], best = Math.max(...qs), a = qs.findIndex((v) => Math.abs(v - best) < 1e-12);
    const r = step(env, s, a, bonus);
    if (bonus > 0 && r.reward === bonus) coins++;
    s = r.next; path.push(s);
    if (r.done) { reached = same(s, env.goal); break; }
  }
  return { path, coins, reached, steps: path.length - 1 };
}

/** The smallest bonus (in steps of 0.01) at which the best policy no longer reaches the goal. */
export function hackThreshold(env, gamma, maxSteps, top = 1) {
  for (let b = 0; b <= top + 1e-9; b = Math.round((b + 0.01) * 100) / 100) {
    const { Q } = valueIteration(env, gamma, b);
    if (!greedyPath(env, Q, b, maxSteps).reached) return b;
  }
  return null;
}

/** Train from scratch for some episodes with a seeded random source. Same seed, same result, so the prose can quote it. */
export function train(ex, episodes, overrides = {}) {
  const env = makeEnv(ex), p = { alpha: ex.alpha, gamma: ex.gamma, epsilon: ex.epsilon, ...overrides };
  const Q = newQ(env), rng = mulberry32(ex.seed), log = [];
  for (let e = 0; e < episodes; e++) log.push(runEpisode(env, Q, p, rng, ex.maxSteps));
  return { env, Q, log };
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
export function facts(ex) {
  const env = makeEnv(ex), { V } = valueIteration(env, ex.gamma);
  const d = Math.abs(ex.goal[0] - ex.start[0]) + Math.abs(ex.goal[1] - ex.start[1]);
  const t = train(ex, ex.firstRun), first = t.log.slice(0, 10), last = t.log.slice(-10);
  const wins = (l) => l.filter((x) => x.outcome === 'goal').length;
  const avgSteps = (l) => l.filter((x) => x.outcome === 'goal').reduce((s, x) => s + x.steps, 0) / Math.max(1, wins(l));
  const b = ex.breaks;
  return {
    gamma: String(ex.gamma), epsilon: String(ex.epsilon), alpha: String(ex.alpha), shortest: String(d),
    best: fmt(V[idx(env, ex.start)], 2), runs: String(ex.firstRun),
    learned: fmt(valueOf(t.Q, idx(env, ex.start)), 2),
    firstWins: String(wins(first)), lastWins: String(wins(last)), lastSteps: fmt(avgSteps(last), 1),
    threshold: fmt(hackThreshold(env, ex.gamma, b.rolloutSteps), 2), bonus: fmt(b.bonus, 2), rollout: String(b.rolloutSteps),
    goalReward: '1', discountedGoal: fmt(ex.gamma ** (d - 1), 2),
  };
}

// ---------- drawing ----------

const glyph = (a) => (a == null ? '·' : ACTIONS[a].glyph);

/** The grid. Orange shading is the value of a cell, an arrow is the best action, a dark outline marks the cells the last run visited. */
function gridView(env, Q, { visited = new Set(), values = true, coinLabel = null } = {}) {
  const root = el('div', { class: 'gw', style: `grid-template-columns: repeat(${env.cols}, 1fr)`, role: 'img',
    'aria-label': `Grid of ${env.rows} by ${env.cols} cells. Start bottom left, goal +1 top right, pit minus 1 just below the goal.` });
  for (let i = 0; i < env.rows * env.cols; i++) {
    const s = cell(env, i);
    let cls = 'gcell', tag = '', main = '', sub = '';
    if (same(s, env.goal)) { cls += ' goal'; tag = '+1'; main = 'goal'; }
    else if (same(s, env.pit)) { cls += ' pit'; tag = '−1'; main = 'pit'; }
    else {
      const v = valueOf(Q, i), a = bestAction(Q[i]);
      main = glyph(a); if (values) sub = fmt(v, 2);
      cls += ' live'; root.append(el('div', { class: cls + (visited.has(i) ? ' seen' : ''), style: `--v:${Math.max(0, Math.min(1, v)).toFixed(3)}` },
        el('span', { class: 'garrow' }, main), sub ? el('span', { class: 'gnum' }, sub) : null,
        same(s, env.start) ? el('span', { class: 'gtag' }, 'start') : (coinLabel && same(s, env.coin) ? el('span', { class: 'gtag' }, coinLabel) : null)));
      continue;
    }
    root.append(el('div', { class: cls }, el('span', { class: 'garrow' }, tag), el('span', { class: 'gtag' }, main)));
  }
  return root;
}

function stepsCurve(log, maxSteps) {
  const W = 300, H = 120, L = 30, R = 8, T = 8, B = 22, n = Math.max(log.length, 10);
  const x = (i) => L + (i / (n - 1)) * (W - L - R), y = (v) => T + (1 - v / maxSteps) * (H - T - B);
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `Steps per episode over ${log.length} episodes. ${log.length ? `Last episode took ${log[log.length - 1].steps} steps.` : 'No episodes yet.'}` });
  for (const v of [0, maxSteps]) root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(v), y2: y(v), 'stroke-dasharray': v === 0 ? '' : '2 3' }), svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
  root.append(svg('text', { class: 'muted', x: L, y: H - 6 }, 'episode 1'), svg('text', { class: 'muted', x: W - R, y: H - 6, 'text-anchor': 'end' }, `${n}`));
  if (log.length > 1) root.append(svg('polyline', { class: 'curve-grey', fill: 'none', 'stroke-width': 1.5, points: log.map((e, i) => `${x(i).toFixed(1)},${y(e.steps).toFixed(1)}`).join(' ') }));
  log.forEach((e, i) => root.append(svg('circle', { cx: x(i), cy: y(e.steps), r: 3, class: e.outcome === 'goal' ? 'bar-orange' : '', fill: e.outcome === 'goal' ? null : 'var(--card)', stroke: e.outcome === 'goal' ? null : 'var(--ink)', 'stroke-width': 1.2 })));
  return root;
}

const outcomeText = (e) => (!e ? 'No episode yet. Press Run 1 episode.' : e.outcome === 'goal' ? `Reached the goal in ${e.steps} steps.` : e.outcome === 'pit' ? `Fell in the pit after ${e.steps} steps.` : `Ran out of steps (${e.steps}) without finding the goal.`);

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const env = makeEnv(example), state = { gamma: example.gamma, epsilon: example.epsilon, Q: newQ(env), rng: mulberry32(example.seed), log: [] };
  const gS = slider({ label: 'γ: how much a later reward counts', min: 0.5, max: 0.99, step: 0.01, value: state.gamma, format: (v) => v.toFixed(2), onInput: (v) => { state.gamma = v; reset(); } });
  const eS = slider({ label: 'ε: how often it tries a random move', min: 0, max: 1, step: 0.05, value: state.epsilon, format: (v) => v.toFixed(2), onInput: (v) => { state.epsilon = v; render(); } });
  const btn = (text, fn) => el('button', { type: 'button', onclick: fn }, ...[text].flat());
  const cards = { grid: el('div', { class: 'card' }), last: el('div', { class: 'card' }), curve: el('div', { class: 'card hide-s' }) };
  root.replaceChildren(
    el('div', { class: 'controls' }, gS.root, eS.root),
    el('div', { class: 'row-actions' }, btn(['Run 1', el('span', { class: 'hide-s' }, ' episode')], () => run(1)), btn([`Run ${example.firstRun}`, el('span', { class: 'hide-s' }, ' episodes')], () => run(example.firstRun)), btn('Start over', () => reset())),
    el('div', { class: 'cards rl' }, cards.grid, cards.last, cards.curve),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: how much reward the agent expects from that cell. Arrow: its best move so far. Dark outline: cells the last episode visited. ', el('span', { class: 'key blue' }), 'Blue: the best value possible.'));

  function reset() { state.Q = newQ(env); state.rng = mulberry32(example.seed); state.log = []; render(); }
  function run(n) {
    for (let i = 0; i < n; i++) state.log.push(runEpisode(env, state.Q, { alpha: example.alpha, gamma: state.gamma, epsilon: state.epsilon }, state.rng, example.maxSteps));
    render();
  }
  function render() {
    const last = state.log[state.log.length - 1], visited = new Set(last ? last.path.map((c) => idx(env, c)) : []);
    const best = valueIteration(env, state.gamma).V[idx(env, env.start)], learned = valueOf(state.Q, idx(env, env.start));
    cards.grid.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'What it has learned'), el('span', { class: 'meta hide-s' }, `${state.log.length} episodes`)),
      gridView(env, state.Q, { visited }),
      el('p', { class: 'story hide-s' }, 'Reward only appears at the goal and the pit. Everything else it works out by passing value backwards.'));
    cards.last.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Last episode'), el('span', { class: last ? 'tag' : 'meta' }, last ? last.outcome === 'goal' ? 'goal' : last.outcome === 'pit' ? 'pit' : 'timeout' : 'none')),
      el('p', { class: 'bar-text' }, outcomeText(last)),
      el('div', { class: 'score-line' }, meter({ value: Math.max(0, learned), max: 1, ghost: best, label: `Start cell value ${fmt(learned, 2)}, best possible ${fmt(best, 2)}` }), el('span', { class: 'num' }, fmt(learned, 2))),
      el('p', { class: 'story hide-s' }, `Value of the start cell: ${fmt(learned, 2)} learned, ${fmt(best, 2)} best possible. The goal is ${Math.abs(env.goal[0] - env.start[0]) + Math.abs(env.goal[1] - env.start[1])} steps away, so the best is γ to the power ${Math.abs(env.goal[0] - env.start[0]) + Math.abs(env.goal[1] - env.start[1]) - 1}.`));
    cards.curve.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Steps per episode'), el('span', { class: 'meta hide-s' }, 'dots: orange = goal')),
      stepsCurve(state.log, example.maxSteps),
      el('p', { class: 'story hide-s' }, 'Early episodes wander. Once the goal has been found, they shorten toward the best route.'));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const env = makeEnv(example), { rolloutSteps } = example.breaks, state = { bonus: example.breaks.bonus };
  const threshold = hackThreshold(env, example.gamma, rolloutSteps);
  const bS = slider({ label: 'Coin: bonus each time the agent steps on it', min: 0, max: 0.3, step: 0.01, value: state.bonus, format: (v) => `+${v.toFixed(2)}`, onInput: (v) => { state.bonus = v; draw(); } });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls' }, bS.root), box);
  function draw() {
    const { V, Q } = valueIteration(env, example.gamma, state.bonus), r = greedyPath(env, Q, state.bonus, rolloutSteps);
    const visited = new Set(r.path.map((c) => idx(env, c)));
    box.replaceChildren(el('div', { class: 'cards rl' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Best policy for this reward'), el('span', { class: 'meta hide-s' }, 'outline: where it goes')),
        gridView(env, Q, { visited, values: false, coinLabel: `coin +${state.bonus.toFixed(2)}` })),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `First ${rolloutSteps} steps`), el('span', { class: r.reached ? 'tag' : 'meta' }, r.reached ? 'reaches goal' : 'never finishes')),
        el('p', { class: 'story' }, r.reached ? `It reaches the goal in ${r.steps} steps${r.coins ? ` and picks up the coin ${r.coins} time${r.coins > 1 ? 's' : ''} on the way` : ''}.` : `It never reaches the goal. It collects the coin ${r.coins} times by stepping off and back on.`),
        el('p', { class: 'bar-text' }, `Value of the start cell: ${fmt(V[idx(env, env.start)], 2)}`)),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Where it flips')),
        el('div', { class: 'score-line' }, meter({ value: state.bonus, max: 0.3, ghost: threshold, label: `Coin bonus ${state.bonus.toFixed(2)}, loop starts at ${fmt(threshold, 2)}` }), el('span', { class: 'num' }, `+${fmt(threshold, 2)}`)),
        el('p', { class: 'story' }, `With γ = ${example.gamma}, at +${fmt(threshold, 2)} a visit or more, farming the coin is worth more than finishing, because the coin can be collected again and again.`))));
  }
  draw();
  return {};
}
