// Ranking models from head-to-head votes. Elo (1/(1+10^((Rb-Ra)/400)), update K*(S-E)) and the Bradley-Terry fit
// P(a beats b) = 1/(1+e^(xi_b - xi_a)) that Chatbot Arena (Chiang et al., 2024) uses, shown on the Elo scale.
import { el, fmt, slider, meter, nextId } from '../../shared/lib.js';
import { mulberry32 } from '../../shared/stats.js';

/** Chance that a player rated ra beats one rated rb. */
export const expectedScore = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

/** One vote. scoreA is 1 if A won and 0 if B won. Returns the two new ratings. */
export function eloUpdate(ra, rb, scoreA, k) {
  const ea = expectedScore(ra, rb);
  return [ra + k * (scoreA - ea), rb + k * (1 - scoreA - (1 - ea))];
}

/** Play the votes in order. A game is { a, b, winner } with indexes of the models. */
export function eloReplay(games, k, n, start = 1000) {
  const r = Array(n).fill(start);
  for (const g of games) [r[g.a], r[g.b]] = eloUpdate(r[g.a], r[g.b], g.winner === g.a ? 1 : 0, k);
  return r;
}

/**
 * Bradley-Terry ratings by the MM algorithm (Hunter, 2004), on the Elo scale and centred on 1000.
 * prior adds a small fractional win and loss against every opponent, so a model with no wins stays finite.
 * Order of the games does not matter.
 */
export function bradleyTerry(games, n, { prior = 0, iterations = 1500 } = {}) {
  const wins = Array(n).fill((prior * (n - 1)) / 2), played = new Map();
  for (const g of games) {
    wins[g.winner] += 1;
    const key = Math.min(g.a, g.b) * n + Math.max(g.a, g.b);
    played.set(key, (played.get(key) ?? 0) + 1);
  }
  if (prior > 0) for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) played.set(i * n + j, (played.get(i * n + j) ?? 0) + prior);
  let p = Array(n).fill(1);
  for (let it = 0; it < iterations; it++) {
    const next = p.map((pi, i) => {
      let denom = 0;
      for (const [key, c] of played) { const a = Math.floor(key / n), b = key % n; if (a === i || b === i) denom += c / (pi + p[a === i ? b : a]); }
      return denom > 0 ? wins[i] / denom : pi;
    });
    const gm = Math.exp(next.reduce((s, x) => s + Math.log(x), 0) / n);
    p = next.map((x) => x / gm);
  }
  const scale = 400 / Math.LN10, r = p.map((x) => scale * Math.log(x)), mean = r.reduce((s, x) => s + x, 0) / n;
  return r.map((x) => x - mean + 1000);
}

/** Random pairs, each decided by the hidden true strengths. */
export function simulateVotes(rng, truth, count) {
  const out = [], n = truth.length;
  for (let i = 0; i < count; i++) {
    const a = Math.floor(rng() * n); let b = Math.floor(rng() * (n - 1)); if (b >= a) b++;
    out.push({ a, b, winner: rng() < expectedScore(truth[a], truth[b]) ? a : b });
  }
  return out;
}

/** Win counts per model. */
export function record(games, n) {
  const won = Array(n).fill(0), played = Array(n).fill(0);
  for (const g of games) { won[g.winner]++; played[g.a]++; played[g.b]++; }
  return { won, played };
}

export function facts(ex) {
  const n = ex.names.length, games = simulateVotes(mulberry32(ex.seed), ex.truth, ex.startVotes);
  const fwd = eloReplay(games, ex.k, n), rev = eloReplay(games.slice().reverse(), ex.k, n), bt = bradleyTerry(games, n, { prior: 0.1 });
  const f = { votes: String(ex.startVotes), k: String(ex.k), maxShift: fmt(Math.max(...fwd.map((x, i) => Math.abs(x - rev[i]))), 0) };
  ex.names.forEach((name, i) => { f[`elo${i}`] = fmt(fwd[i], 0); f[`bt${i}`] = fmt(bt[i], 0); f[`rev${i}`] = fmt(rev[i], 0); });
  const c = bradleyTerry(cycleGames(ex.breaks.cycle), 3);
  f.cycleLow = fmt(Math.min(...c), 0); f.cycleHigh = fmt(Math.max(...c), 0);
  return f;
}

export function cycleGames(cycle) {
  return cycle.flatMap((m) => [...Array(m.aWins).fill({ a: m.a, b: m.b, winner: m.a }), ...Array(m.of - m.aWins).fill({ a: m.a, b: m.b, winner: m.b })]);
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const n = example.names.length;
  const state = { k: example.k, reverse: example.reverse };
  let rng = mulberry32(example.seed), games = simulateVotes(rng, example.truth, example.startVotes), next = nextPair();
  function nextPair() { const a = Math.floor(rng() * n); let b = Math.floor(rng() * (n - 1)); if (b >= a) b++; return [a, b]; }

  const kS = slider({ label: 'K: how far one vote moves a rating', min: 4, max: 64, step: 4, value: state.k, format: String, onInput: (v) => { state.k = v; render(); } });
  const more = el('button', { type: 'button' }, 'Simulate 20 votes'), reset = el('button', { type: 'button' }, 'Start over');
  more.addEventListener('click', () => { games = games.concat(simulateVotes(rng, example.truth, 20)); render(); });
  reset.addEventListener('click', () => { rng = mulberry32(example.seed); games = []; next = nextPair(); render(); });
  const revId = nextId('rev'), revBox = el('input', { type: 'checkbox', id: revId });
  revBox.addEventListener('change', () => { state.reverse = revBox.checked; render(); });
  const count = el('span', { class: 'meta' });
  const cards = example.names.map(() => el('div', { class: 'card' }));
  const pairText = el('p', { class: 'meta' }), voteA = el('button', { type: 'button' }), voteB = el('button', { type: 'button' });
  const vote = (side) => { const [a, b] = next; games = games.concat([{ a, b, winner: side === 0 ? a : b }]); next = nextPair(); render(); };
  voteA.addEventListener('click', () => vote(0)); voteB.addEventListener('click', () => vote(1));

  root.replaceChildren(
    el('div', { class: 'controls' }, kS.root, el('div', { class: 'buttons' }, more, reset, count)),
    el('div', { class: 'toggles' }, el('div', { class: 'check' }, revBox, el('label', { for: revId }, 'Replay the same votes in reverse order'))),
    el('div', { class: 'cards' }, cards),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: Elo, updated one vote at a time. ', el('span', { class: 'key blue' }), 'Blue: Bradley-Terry fit to all votes at once. Votes come from hidden strengths that this page made up.'),
    el('details', {}, el('summary', {}, 'Cast votes yourself'), pairText, el('div', { class: 'buttons' }, voteA, voteB)));

  function render() {
    const list = state.reverse ? games.slice().reverse() : games;
    const elo = eloReplay(list, state.k, n), bt = bradleyTerry(games, n, { prior: 0.1, iterations: 400 }), rec = record(games, n);
    const rank = elo.map((x, i) => ({ x, i })).sort((a, b) => b.x - a.x).map((o) => o.i);
    count.textContent = `${games.length} votes`;
    const [a, b] = next;
    pairText.textContent = `Which answer is better, from ${example.names[a]} or ${example.names[b]}?`;
    voteA.textContent = `${example.names[a]} wins`; voteB.textContent = `${example.names[b]} wins`;
    const scale = (v) => Math.max(0, Math.min(600, v - 700));
    cards.forEach((card, i) => card.replaceChildren(
      el('div', { class: 'card-head' }, el('span', { class: 'rank' }, `#${rank.indexOf(i) + 1}`), el('strong', {}, example.names[i]), el('span', { class: 'meta hide-s' }, `won ${rec.won[i]} of ${rec.played[i]}`)),
      el('div', { class: 'score-line' }, meter({ value: scale(elo[i]), max: 600, ghost: scale(bt[i]), label: `${example.names[i]}: Elo ${fmt(elo[i], 0)}, fit ${fmt(bt[i], 0)}` }), el('span', { class: 'num' }, fmt(elo[i], 0))),
      el('p', { class: 'bar-text muted' }, `Fit to all votes: ${fmt(bt[i], 0)}`)));
  }
  render();
  return { state };
}

/** "Where it breaks": a cycle of wins gives every model the same rating. */
function mountBreaks(root, example) {
  const names = example.breaks.names, games = cycleGames(example.breaks.cycle), bt = bradleyTerry(games, names.length);
  root.replaceChildren(el('div', { class: 'cards' },
    ...example.breaks.cycle.map((m) => el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `${names[m.a]} vs ${names[m.b]}`)),
      el('div', { class: 'score-line' }, meter({ value: m.aWins, max: m.of, label: `${names[m.a]} wins ${m.aWins} of ${m.of}` }), el('span', { class: 'num' }, `${m.aWins}/${m.of}`)),
      el('p', { class: 'story' }, `${names[m.a]} wins ${m.aWins} of ${m.of} votes.`))),
    el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Fitted ratings')),
      ...names.map((nm, i) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, nm), meter({ value: bt[i] - 700, max: 600, label: `${nm}: ${fmt(bt[i], 0)}` }), el('span', { class: 'num' }, fmt(bt[i], 0)))),
      el('p', { class: 'story' }, 'All three tie. A single rating cannot say that A beats B, B beats C and C beats A.'))));
  return {};
}
