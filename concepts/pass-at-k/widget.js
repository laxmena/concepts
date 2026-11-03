// pass@k for code evals. The estimator is equation 1 of Chen et al. (2021), "Evaluating Large Language Models Trained on Code".
import { el, svg, slider, stackedBar, nextId } from '../../shared/lib.js';
import { chooseRatio } from '../../shared/stats.js';

/** Unbiased pass@k: draw k of the n samples without replacement; the chance at least one of the c correct ones is drawn. */
export function passAtK(n, c, k) {
  if (n - c < k) return 1;
  return 1 - chooseRatio(n, n - c, k); // C(n-c, k) / C(n, k)
}

/** The opposite question: the chance that all k draws are correct, C(c, k) / C(n, k). Used for agents (tau-bench "pass^k"). */
export function passHatK(n, c, k) {
  return chooseRatio(n, c, k);
}

/** The tempting shortcut 1 - (1 - c/n)^k. The paper shows it always reads too low. */
export function naivePassAtK(n, c, k) {
  return 1 - Math.pow(1 - c / n, k);
}

/** k values for a curve: 1, 2, 3, ... then spread out, never above n. */
export function curveKs(n, count = 36) {
  const set = new Set();
  for (let i = 0; i < count; i++) set.add(Math.min(n, Math.max(1, Math.round(Math.pow(n, i / (count - 1))))));
  return [...set].sort((a, b) => a - b);
}

// --- "Where it breaks": weak tests let wrong code pass. Real functions, run for real. ---
export const CANDIDATES = [
  { id: 'A', note: 'largest of the list', correct: true, fn: (xs) => Math.max(...xs) },
  { id: 'B', note: 'first item', correct: false, fn: (xs) => xs[0] },
  { id: 'C', note: 'last item', correct: false, fn: (xs) => xs[xs.length - 1] },
  { id: 'D', note: 'larger of the first two', correct: false, fn: (xs) => Math.max(xs[0], xs[1]) },
];

/** Which candidates pass every test in the suite. */
export function runSuite(tests, suiteIds) {
  const suite = tests.filter((t) => suiteIds.includes(t.id));
  return CANDIDATES.map((c) => ({ ...c, results: suite.map((t) => c.fn(t.input) === t.expect), passes: suite.every((t) => c.fn(t.input) === t.expect) }));
}

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function facts(ex) {
  const { n, c, k } = ex;
  const f = {
    n: String(n), c: String(c), k: String(k), p1: pct(c / n, 0), pk: pct(passAtK(n, c, k)), naive: pct(naivePassAtK(n, c, k)),
    hat: pct(passHatK(n, c, k)), pkAll: pct(passAtK(n, c, n), 0), hatAll: pct(passHatK(n, c, n), 0),
  };
  const one = runSuite(ex.breaks.tests, ex.breaks.suite);
  f.passing = String(one.filter((x) => x.passes).length);
  f.weakShare = pct(one.filter((x) => x.passes).length / one.length, 0);
  const all = runSuite(ex.breaks.tests, ex.breaks.tests.map((t) => t.id));
  f.strongShare = pct(all.filter((x) => x.passes).length / all.length, 0);
  return f;
}

function curveSvg({ n, c, k }) {
  const W = 360, H = 118, L = 38, R = 8, T = 8, B = 22;
  const ks = curveKs(n), x = (kk) => L + (n === 1 ? 0 : (Math.log(kk) / Math.log(n)) * (W - L - R)), y = (v) => T + (1 - v) * (H - T - B);
  const line = (fn, cls) => svg('polyline', { class: cls, fill: 'none', 'stroke-width': 2.5, points: ks.map((kk) => `${x(kk).toFixed(1)},${y(fn(n, c, kk)).toFixed(1)}`).join(' ') });
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `pass at k as k grows from 1 to ${n}, with ${c} of ${n} samples correct. At k = ${k}: pass at k ${pct(passAtK(n, c, k))}, all k correct ${pct(passHatK(n, c, k))}.` });
  for (const v of [0, 0.5, 1]) root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(v), y2: y(v), 'stroke-dasharray': v === 0 ? '' : '2 3' }), svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, `${v * 100}%`));
  for (const t of [1, 10, 100].filter((t) => t <= n)) root.append(svg('text', { class: 'muted', x: x(t), y: H - 6, 'text-anchor': t === 1 ? 'start' : 'middle' }, `k=${t}`));
  root.append(line(passAtK, 'curve-orange'), line(passHatK, 'curve-grey'),
    svg('line', { x1: x(k), x2: x(k), y1: T, y2: H - B, stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
    svg('circle', { class: 'bar-orange', cx: x(k), cy: y(passAtK(n, c, k)), r: 4 }), svg('circle', { cx: x(k), cy: y(passHatK(n, c, k)), r: 4, fill: 'var(--ink-2)' }));
  return root;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const state = { n: example.n, c: example.c, k: example.k };
  const nS = slider({ label: 'n: samples per problem', min: 2, max: 200, step: 1, value: state.n, format: String, onInput: (v) => { state.n = v; render(); } });
  const cS = slider({ label: 'c: samples that pass the tests', min: 0, max: state.n, step: 1, value: state.c, format: String, onInput: (v) => { state.c = v; render(); } });
  const kS = slider({ label: 'k: tries you get', min: 1, max: state.n, step: 1, value: state.k, format: String, onInput: (v) => { state.k = v; render(); } });
  const cards = { one: el('div', { class: 'card' }), at: el('div', { class: 'card' }), hat: el('div', { class: 'card' }), curve: el('div', { class: 'card' }) };
  root.replaceChildren(
    el('div', { class: 'controls' }, nS.root, cS.root, kS.root),
    el('div', { class: 'cards' }, cards.one, cards.at, cards.hat, cards.curve),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: pass@k, the chance at least one of k tries passes. ', el('span', { class: 'key blue' }), 'Blue: the naive shortcut. Grey: the chance all k tries pass.'));

  function render() {
    state.c = Math.min(state.c, state.n); state.k = Math.min(state.k, state.n);
    cS.input.max = state.n; kS.input.max = state.n; cS.input.value = state.c; kS.input.value = state.k;
    cS.root.querySelector('output').textContent = String(state.c); kS.root.querySelector('output').textContent = String(state.k);
    const { n, c, k } = state;
    const p1 = c / n, at = passAtK(n, c, k), naive = naivePassAtK(n, c, k), hat = passHatK(n, c, k);
    const card = (box, title, meta, value, bar, text) => box.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, title), el('span', { class: 'meta hide-s' }, meta)),
      el('div', { class: 'score-line' }, bar, el('span', { class: 'num' }, pct(value, 1))), el('p', { class: 'story hide-s' }, text));
    card(cards.one, 'pass@1', `${c} of ${n} samples`, p1, stackedBar({ segments: [{ value: p1 }], max: 1, label: `pass at 1: ${pct(p1)}` }), 'One try. The share of samples that pass the tests.');
    card(cards.at, `pass@${k}`, 'at least one passes', at,
      stackedBar({ segments: [{ value: at }], max: 1, ghost: { value: naive, max: 1 }, label: `pass at ${k}: ${pct(at)}, naive shortcut ${pct(naive)}` }),
      `With ${k} tries, ${pct(at)} of problems get a pass. The naive shortcut says ${pct(naive)}: lower, always.`);
    card(cards.hat, `All ${k} pass`, 'every try passes', hat,
      stackedBar({ segments: [{ value: hat }], max: 1, color: 'grey', label: `All ${k} tries pass: ${pct(hat)}` }),
      'The reverse question. It is what an agent that must work every time needs.');
    cards.curve.replaceChildren(el('div', { class: 'card-head' }, el('strong', {}, 'As k grows'), el('span', { class: 'meta hide-s' }, 'log scale')), curveSvg(state));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const { tests } = example.breaks;
  const on = new Set(example.breaks.suite);
  const box = el('div', { 'aria-live': 'polite' });
  const group = el('fieldset', { class: 'field' }, el('legend', {}, 'Tests in the suite'));
  for (const t of tests) {
    const id = nextId('t'), input = el('input', { type: 'checkbox', id });
    input.checked = on.has(t.id);
    input.addEventListener('change', () => { input.checked ? on.add(t.id) : on.delete(t.id); draw(); });
    group.append(el('div', { class: 'check' }, input, el('label', { for: id }, `largest([${t.input.join(', ')}]) is ${t.expect}`)));
  }
  root.replaceChildren(group, box);
  function draw() {
    const rows = runSuite(tests, [...on]);
    const pass = rows.filter((r) => r.passes).length;
    box.replaceChildren(
      el('div', { class: 'cards' }, rows.map((r) => el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, `Solution ${r.id}`), el('span', { class: r.passes ? 'tag' : 'meta' }, on.size ? (r.passes ? 'passes' : 'fails') : 'no tests')),
        el('p', { class: 'story' }, `Returns the ${r.note}.`),
        el('p', { class: 'bar-text muted' }, r.correct ? 'Actually correct.' : 'Actually wrong.')))),
      el('p', { class: 'caption' }, `${pass} of ${rows.length} solutions pass these tests. Only 1 is right. pass@1 reads ${pct(pass / rows.length, 0)}.`));
  }
  draw();
  return {};
}
