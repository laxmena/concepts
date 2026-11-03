// Agent evals: pass@k versus pass^k (Yao et al., 2024, tau-bench) and outcome versus step grading.
import { el, svg, fmt, slider, meter, nextId } from '../../shared/lib.js';
import { passAtK, passHatK } from '../pass-at-k/widget.js';

/** Average over tasks. passes[i] is how many of the n trials of task i succeeded. */
export const meanOverTasks = (passes, n, fn, k) => passes.reduce((s, c) => s + fn(n, c, k), 0) / passes.length;
export const avgPassAt = (passes, n, k) => meanOverTasks(passes, n, passAtK, k);
export const avgPassHat = (passes, n, k) => meanOverTasks(passes, n, passHatK, k);

/** Grade one run. outcome looks only at the end state; steps also needs every step to follow the rules. */
export function gradeRun(run) {
  const outcome = run.endState, steps = run.steps.every((s) => s.ok);
  return { outcome, stepsOk: steps, both: outcome && steps };
}

const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;

export function facts(ex) {
  const f = { n: String(ex.trials), p1Retail: String(ex.paper.pass1Retail), p1Airline: String(ex.paper.pass1Airline), p8Retail: String(ex.paper.pass8Retail) };
  for (const m of ex.mixes) {
    for (const k of [1, 2, 4, 8]) { f[`at.${m.id}.${k}`] = pct(avgPassAt(m.passes, ex.trials, k), 0); f[`hat.${m.id}.${k}`] = pct(avgPassHat(m.passes, ex.trials, k), 0); }
  }
  f.k = String(ex.k);
  const [clean, lucky] = ex.breaks.runs.map(gradeRun);
  f.cleanOk = clean.both ? 'pass' : 'fail'; f.luckyOutcome = lucky.outcome ? 'pass' : 'fail'; f.luckyBoth = lucky.both ? 'pass' : 'fail';
  return f;
}

function curveSvg(passes, n, k) {
  const W = 360, H = 118, L = 38, R = 8, T = 8, B = 22, ks = Array.from({ length: n }, (_, i) => i + 1);
  const x = (kk) => L + ((kk - 1) / (n - 1)) * (W - L - R), y = (v) => T + (1 - v) * (H - T - B);
  const line = (fn, cls) => svg('polyline', { class: cls, fill: 'none', 'stroke-width': 2.5, points: ks.map((kk) => `${x(kk).toFixed(1)},${y(fn(passes, n, kk)).toFixed(1)}`).join(' ') });
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': `For k from 1 to ${n}: pass at k rises from ${pct(avgPassAt(passes, n, 1))} to ${pct(avgPassAt(passes, n, n))}; all k pass falls from ${pct(avgPassHat(passes, n, 1))} to ${pct(avgPassHat(passes, n, n))}.` });
  for (const v of [0, 0.5, 1]) root.append(svg('line', { class: 'axis', x1: L, x2: W - R, y1: y(v), y2: y(v), 'stroke-dasharray': v === 0 ? '' : '2 3' }), svg('text', { class: 'muted', x: L - 4, y: y(v) + 4, 'text-anchor': 'end' }, `${v * 100}%`));
  for (const t of [1, 4, 8].filter((t) => t <= n)) root.append(svg('text', { class: 'muted', x: x(t), y: H - 6, 'text-anchor': t === 1 ? 'start' : t === n ? 'end' : 'middle' }, `k=${t}`));
  root.append(line(avgPassAt, 'curve-orange'), line(avgPassHat, 'curve-grey'), svg('line', { x1: x(k), x2: x(k), y1: T, y2: H - B, stroke: 'currentColor', 'stroke-width': 1, 'stroke-dasharray': '3 3' }),
    svg('circle', { class: 'bar-orange', cx: x(k), cy: y(avgPassAt(passes, n, k)), r: 4 }), svg('circle', { cx: x(k), cy: y(avgPassHat(passes, n, k)), r: 4, fill: 'var(--ink-2)' }));
  return root;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const n = example.trials, by = new Map(example.mixes.map((m) => [m.id, m]));
  const state = { mix: example.mix, k: example.k };
  const selId = nextId('mix'), select = el('select', { id: selId }, example.mixes.map((m) => el('option', { value: m.id }, m.label)));
  select.value = state.mix; select.addEventListener('change', () => { state.mix = select.value; render(); });
  const kS = slider({ label: 'k: runs in a row', min: 1, max: n, step: 1, value: state.k, format: String, onInput: (v) => { state.k = v; render(); } });
  const tiles = el('div', { class: 'dots tasks', role: 'img' });
  const cards = { one: el('div', { class: 'card' }), at: el('div', { class: 'card' }), hat: el('div', { class: 'card' }), curve: el('div', { class: 'card' }) };
  root.replaceChildren(
    el('div', { class: 'controls' }, el('div', { class: 'field' }, el('label', { for: selId }, 'The agent’s tasks'), select), kS.root),
    el('p', { class: 'meta hide-s' }, `Passes out of ${n} runs, one tile per task:`), tiles,
    el('div', { class: 'cards' }, cards.one, cards.at, cards.hat, cards.curve),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: pass@k, at least one of k runs works. ', el('span', { class: 'key grey' }), 'Grey: pass^k, all k runs work.'));

  function render() {
    const { passes } = by.get(state.mix), k = state.k;
    tiles.setAttribute('aria-label', `Passes out of ${n} runs for each task: ${passes.join(', ')}`);
    tiles.replaceChildren(...passes.map((c) => el('span', { class: `dot task-tile ${c === n ? 'always' : c === 0 ? 'never' : 'sometimes'}` }, String(c))));
    const p1 = avgPassAt(passes, n, 1), at = avgPassAt(passes, n, k), hat = avgPassHat(passes, n, k);
    const card = (box, title, meta, v, bar, text) => box.replaceChildren(el('div', { class: 'card-head' }, el('strong', {}, title), el('span', { class: 'meta hide-s' }, meta)),
      el('div', { class: 'score-line' }, bar, el('span', { class: 'num' }, pct(v, 1))), el('p', { class: 'story hide-s' }, text));
    card(cards.one, 'One run', 'pass^1 = pass@1', p1, meter({ value: p1, max: 1, label: `One run: ${pct(p1)}` }), 'The usual headline number. It is the same for all three task sets.');
    card(cards.at, `Any of ${k} runs`, `pass@${k}`, at, meter({ value: at, max: 1, label: `pass at ${k}: ${pct(at)}` }), 'Good when you can run many times and check the result, like code with tests.');
    card(cards.hat, `All ${k} runs`, `pass^${k}`, hat, meter({ value: hat, max: 1, color: 'grey', label: `pass hat ${k}: ${pct(hat)}` }), 'What a customer-service agent needs: it must work every time.');
    cards.curve.replaceChildren(el('div', { class: 'card-head' }, el('strong', {}, 'As k grows')), curveSvg(passes, n, k));
  }
  render();
  return { state };
}

/** "Where it breaks": a clean run and a lucky run both end in the right state. */
function mountBreaks(root, example) {
  const id = nextId('steps'), box = el('input', { type: 'checkbox', id }), out = el('div', { 'aria-live': 'polite' });
  box.addEventListener('change', draw);
  root.replaceChildren(el('div', { class: 'check' }, box, el('label', { for: id }, 'Also grade every step against the rules')), out);
  function draw() {
    out.replaceChildren(el('div', { class: 'cards' }, example.breaks.runs.map((run) => {
      const g = gradeRun(run), ok = box.checked ? g.both : g.outcome;
      return el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, run.name), el('span', { class: ok ? 'tag' : 'meta' }, ok ? 'pass' : 'fail')),
        el('ul', { class: 'claims' }, run.steps.map((s) => el('li', {}, s.ok ? '✓ ' : '✗ ', s.text))),
        el('p', { class: 'bar-text' }, `End state matches the goal: ${run.endState ? 'yes' : 'no'}.`),
        el('p', { class: 'story' }, box.checked ? (g.both ? 'Every step followed the rules.' : 'The end state is right, but one step broke a rule.') : 'Only the end state is checked, so both runs pass.'));
    })));
  }
  draw();
  return {};
}
