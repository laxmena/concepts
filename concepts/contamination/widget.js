// A toy model of benchmark contamination: the model has memorised the answers to a share m of the public test questions.
// It gets those right every time, and the rest right with its true ability a. A fresh, unseen test shows a.
// The sizes, drop and correlation quoted on the page come from Zhang et al. (2024), arXiv:2405.00332 (GSM1k).
import { el, fmt, slider, meter, nextId, radios } from '../../shared/lib.js';
import { seBernoulli } from '../../shared/stats.js';

/** Score on the public benchmark when a share m of its questions has been memorised. */
export const publicScore = (ability, m) => m + (1 - m) * ability;

/** What a fresh test of the same kind would show. */
export const freshScore = (ability) => ability;

/** Public score minus fresh score. Equals m * (1 - ability). */
export const gap = (ability, m) => publicScore(ability, m) - freshScore(ability);

/** z score of the gap between two independent tests of n questions each. */
export function gapZ(ability, m, n) {
  const a = publicScore(ability, m), b = freshScore(ability);
  const se = Math.sqrt(seBernoulli(a, n) ** 2 + seBernoulli(b, n) ** 2);
  return gap(ability, m) / se;
}

/** Rank models (1 is best) by a score. Ties share the better rank. */
export const ranks = (scores) => scores.map((s) => 1 + scores.filter((t) => t > s + 1e-12).length);

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const pts = (x, d = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(d)}`;

export function facts(ex) {
  const { ability: a, share: m, questions: n } = ex, z = gapZ(a, m, n);
  const f = { n: n.toLocaleString('en-US'), a: pct(a, 0), m: pct(m, 0), pub: pct(publicScore(a, m)), fresh: pct(freshScore(a)), gap: pts(gap(a, m)), z: fmt(z, 1),
    drop: String(ex.paper.drop), problems: ex.paper.problems.toLocaleString('en-US'), spearman: String(ex.paper.spearman) };
  const z20 = gapZ(a, 0.2, n); f.gap20 = pts(gap(a, 0.2)); f.z20 = fmt(z20, 1);
  const { x, y } = ex.breaks;
  for (const m2 of ex.breaks.shares) {
    const pub = [publicScore(x.ability, m2), publicScore(y.ability, 0)], fresh = [x.ability, y.ability];
    f[`pubFirst.${m2}`] = ranks(pub)[0] === 1 ? x.name : y.name; f[`freshFirst.${m2}`] = ranks(fresh)[0] === 1 ? x.name : y.name;
  }
  return f;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const n = example.questions, state = { m: example.share, a: example.ability };
  const mS = slider({ label: 'm: share of the public questions the model has memorised', min: 0, max: 0.3, step: 0.01, value: state.m, format: (v) => pct(v, 0), onInput: (v) => { state.m = v; render(); } });
  const aS = slider({ label: 'a: what the model can really do', min: 0.4, max: 0.95, step: 0.01, value: state.a, format: (v) => pct(v, 0), onInput: (v) => { state.a = v; render(); } });
  const cards = { pub: el('div', { class: 'card' }), fresh: el('div', { class: 'card' }), gap: el('div', { class: 'card' }), noise: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls' }, mS.root, aS.root), el('div', { class: 'cards' }, cards.pub, cards.fresh, cards.gap, cards.noise),
    el('p', { class: 'legend' }, `A toy model: memorised questions are always right, the rest follow the real ability. Both tests have ${n.toLocaleString('en-US')} questions, the size of GSM1k.`));
  function render() {
    const { m, a } = state, pub = publicScore(a, m), fresh = freshScore(a), g = gap(a, m), z = gapZ(a, m, n);
    const card = (box, title, v, bar, text, num) => box.replaceChildren(el('div', { class: 'card-head' }, el('strong', {}, title)), el('div', { class: 'score-line' }, bar, el('span', { class: 'num' }, num ?? pct(v, 1))), el('p', { class: 'story hide-s' }, text));
    card(cards.pub, 'Public benchmark', pub, meter({ value: pub, max: 1, label: `Public benchmark: ${pct(pub)}` }), 'The score the model reports. Its answers to the memorised share come for free.');
    card(cards.fresh, 'Fresh problems', fresh, meter({ value: fresh, max: 1, color: 'blue', label: `Fresh problems: ${pct(fresh)}` }), 'New questions of the same kind, never seen before. This is the real ability.');
    card(cards.gap, 'The gap', g, meter({ value: g, max: 0.15, label: `Gap: ${pts(g)} points` }), `The gap is m × (1 − a): memorising only helps on questions the model would have missed.`, `${pts(g)} pts`);
    const seen = Math.abs(z) > 1.96;
    card(cards.noise, 'More than noise?', z, meter({ value: Math.min(Math.abs(z), 4), max: 4, color: seen ? 'orange' : 'grey', label: `z score ${fmt(z, 1)}` }),
      seen ? `z is ${fmt(z, 1)}, past 1.96. With ${n.toLocaleString('en-US')} questions on each side this gap is too big to be luck.` : `z is ${fmt(z, 1)}, under 1.96. With ${n.toLocaleString('en-US')} questions on each side the gap could be luck, so this much contamination would go unnoticed.`, fmt(z, 1));
  }
  render();
  return { state };
}

/** "Where it breaks": a contaminated model can pass a clean one on the public test, and fall behind on fresh problems. */
function mountBreaks(root, example) {
  const { x, y, shares } = example.breaks, box = el('div', { 'aria-live': 'polite' });
  const group = radios({ name: nextId('share'), legend: `Share of the public questions ${x.name} has memorised`, value: shares[2], options: shares.map((s) => ({ value: s, label: pct(s, 0) })), onChange: draw });
  root.replaceChildren(group.root, box);
  function draw(m = shares[2]) {
    const pub = [publicScore(x.ability, m), publicScore(y.ability, 0)], fresh = [x.ability, y.ability], rp = ranks(pub), rf = ranks(fresh);
    const card = (name, i) => el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, name), el('span', { class: 'meta' }, i === 0 ? `memorised ${pct(m, 0)}` : 'memorised none')),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, `Public #${rp[i]}`), meter({ value: pub[i], max: 1, label: `${name} on the public test: ${pct(pub[i])}` }), el('span', { class: 'num' }, pct(pub[i]))),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, `Fresh #${rf[i]}`), meter({ value: fresh[i], max: 1, color: 'blue', label: `${name} on fresh problems: ${pct(fresh[i])}` }), el('span', { class: 'num' }, pct(fresh[i]))));
    box.replaceChildren(el('div', { class: 'cards' }, card(x.name, 0), card(y.name, 1)),
      el('p', { class: 'caption' }, rp[0] === 1 && rf[0] !== 1 ? `The public leaderboard puts ${x.name} first. On fresh problems ${y.name} is better. The ranking flipped.` : rp[0] === 1 ? `${x.name} is first on both.` : `${y.name} is first on both.`));
  }
  draw();
  return {};
}
