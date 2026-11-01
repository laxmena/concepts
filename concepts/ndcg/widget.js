// nDCG@k. The maths is pure and exported; mount() only draws.
//   discount(rank) = 1 / log2(rank + 1)
//   DCG@k          = sum over the first k results of grade * discount(rank)
//   ideal DCG@k    = DCG@k of the best possible order of the graded results
//   nDCG@k         = DCG@k / ideal DCG@k      (0 when nothing is relevant)
// Gain is the grade itself. Some texts use 2^grade - 1, which stretches the gap between grades.
// A result with no grade (null) counts as 0 and is left out of the ideal list: that is what real evaluation tools do.

import { el, svg, fmt, slider, stackedBar, meter, segmented, sortableList } from '../../shared/lib.js';

export const discount = (rank) => 1 / Math.log2(rank + 1);

export function dcg(grades, k) {
  let sum = 0;
  for (let i = 0; i < Math.min(k, grades.length); i++) sum += (grades[i] ?? 0) * discount(i + 1);
  return sum;
}

/** The best order of the known grades, cut to k. Ungraded (null) entries are not in it. */
export function idealGrades(pool, k) {
  return pool.filter((g) => g != null).sort((a, b) => b - a).slice(0, k);
}

/** grades: grades in ranked order (null = no label). pool: every grade that was judged (defaults to the ranking itself). */
export function scoreRanking({ grades, k, pool = grades }) {
  const ideal = idealGrades(pool, k);
  const d = dcg(grades, k);
  const best = dcg(ideal, k);
  const rows = grades.map((g, i) => ({
    rank: i + 1, grade: g, discount: discount(i + 1), points: (g ?? 0) * discount(i + 1),
    idealGrade: ideal[i] ?? 0, idealPoints: (ideal[i] ?? 0) * discount(i + 1), counted: i < k,
  }));
  return { dcg: d, ideal: best, ndcg: best > 0 ? d / best : 0, rows };
}

/** Score several rankings of the same pool of documents. docs: [{id, grade}]; rankings: arrays of ids. */
export function pooledScores({ docs, rankings, k }) {
  const byId = new Map(docs.map((d) => [d.id, d]));
  const seen = [...new Set(rankings.flat())];
  const pool = seen.map((id) => byId.get(id).grade);
  return rankings.map((r) => scoreRanking({ grades: r.map((id) => byId.get(id).grade), k, pool }));
}

// ---------- drawing ----------

const MAX_GRADE = 3;

export function mount(root, example) {
  const state = { k: example.k };
  const items = example.results.map((r) => ({ ...r }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const listeners = [];

  const kSlider = slider({ label: 'k: how many results count', min: 1, max: items.length, step: 1, value: state.k,
    format: (v) => String(v), onInput: (v) => { state.k = v; render(); } });

  const dcgNum = el('span', { class: 'stat-num' }), idealNum = el('span', { class: 'stat-num' }), ndcgNum = el('span', { class: 'stat-num big' });
  const dcgLabel = el('span', { class: 'stat-label' }), idealLabel = el('span', { class: 'stat-label' }), ndcgLabel = el('span', { class: 'stat-label' });
  const stats = el('div', { class: 'stats' },
    el('div', { class: 'stat' }, el('span', { class: 'key orange' }), dcgLabel, dcgNum),
    el('div', { class: 'stat' }, el('span', { class: 'key blue' }), idealLabel, idealNum),
    el('div', { class: 'stat' }, ndcgLabel, ndcgNum));
  const meterBox = el('div');
  const status = el('p', { class: 'sr-only', role: 'status' });

  const list = sortableList({
    items,
    announce: (msg) => { status.textContent = msg; },
    onReorder: () => render(),
    createRow: (item, { handle }) => {
      const grade = segmented({ name: `grade-${item.id}`, legend: `Grade for ${item.title}`, value: item.grade,
        options: example.gradeNames.map((n, v) => ({ value: v, label: String(v), title: n })),
        onChange: (v) => { item.grade = v; render(); } });
      const refs = { disc: el('span', { class: 'disc' }), bar: el('div', { class: 'pbar' }), pts: el('span', { class: 'pts' }) };
      return { refs, el: el('div', { class: 'rank-row' }, handle, el('div', { class: 'rtitle' }, item.title), grade.root, refs.disc, refs.bar, refs.pts) };
    },
  });

  root.replaceChildren(
    el('div', { class: 'controls one' }, kSlider.root),
    stats, meterBox,
    el('div', { class: 'rank-head', 'aria-hidden': 'true' }, el('span', {}, 'Rank'), el('span', {}, 'Result'), el('span', {}, 'Grade'), el('span', {}, 'Weight'), el('span', {}, 'Points earned'), el('span', {})),
    list.root,
    el('p', { class: 'legend' }, 'Grades: ', example.gradeNames.map((n, v) => `${v} ${n.toLowerCase()}`).join(', '), '. Drag a rank number to move a result, or focus it and press the up or down arrow key. Dim rows under the dashed line are outside k and do not count. ',
      el('span', { class: 'key orange' }), 'Orange: points this result earns. ', el('span', { class: 'key blue' }), 'Blue: points the best order would put at this rank.'),
    status);

  function render() {
    const order = list.order();
    const grades = order.map((id) => byId.get(id).grade);
    const r = scoreRanking({ grades, k: state.k });
    order.forEach((id, i) => {
      const row = list.rows.get(id), x = r.rows[i];
      row.handle.textContent = String(i + 1);
      row.handle.setAttribute('aria-label', `Rank ${i + 1}: ${byId.get(id).title}${x.counted ? '' : ', outside k'}. Press the up or down arrow key to move it.`);
      row.el.classList.toggle('dim', !x.counted);
      row.el.classList.toggle('cut', i === state.k);
      row.refs.disc.textContent = `× ${fmt(x.discount, 2)}`;
      row.refs.pts.textContent = x.counted ? fmt(x.points, 2) : '–';
      row.refs.bar.replaceChildren(meter({ value: x.counted ? x.points : 0, max: MAX_GRADE, ghost: x.counted ? x.idealPoints : null,
        label: `Rank ${i + 1}: ${fmt(x.points, 2)} points, best order ${fmt(x.idealPoints, 2)}` }));
    });
    dcgLabel.textContent = `DCG@${state.k} (your order)`;
    idealLabel.textContent = `Best possible`;
    ndcgLabel.textContent = `nDCG@${state.k}`;
    dcgNum.textContent = fmt(r.dcg, 2); idealNum.textContent = fmt(r.ideal, 2); ndcgNum.textContent = fmt(r.ndcg, 2);
    meterBox.replaceChildren(meter({ value: r.ndcg, max: 1, label: `nDCG@${state.k} is ${fmt(r.ndcg, 2)} out of 1` }));
    listeners.forEach((fn) => fn({ ...state, result: r }));
  }
  render();
  return { state, subscribe: (fn) => { listeners.push(fn); fn({ ...state, result: scoreRanking({ grades: list.order().map((id) => byId.get(id).grade), k: state.k }) }); } };
}

/** Three small pictures, one per idea. The last follows the main widget. */
export function mountLessons(root, example, api) {
  const n = example.results.length;
  const W = 360, step = W / n, H = 120, top = 18, tall = 70;
  const columns = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img',
    'aria-label': 'Rank weights from rank 1 to rank 10: ' + Array.from({ length: n }, (_, i) => fmt(discount(i + 1), 2)).join(', ') });
  for (let i = 0; i < n; i++) {
    const h = discount(i + 1) * tall, cx = step * i + step / 2;
    columns.append(
      svg('rect', { class: 'bar-orange', x: cx - 11, y: top + tall - h, width: 22, height: h }),
      svg('text', { x: cx, y: top + tall - h - 4, 'text-anchor': 'middle', style: 'font-size:11px' }, fmt(discount(i + 1), 2)),
      svg('text', { class: 'muted', x: cx, y: top + tall + 15, 'text-anchor': 'middle' }, String(i + 1)));
  }
  columns.append(svg('text', { class: 'muted', x: 0, y: H - 2 }, 'rank'));

  const row = (label, value, max, color) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, label),
    stackedBar({ segments: [{ value }], max, color, label: `${label}: ${fmt(value, 2)}` }), el('span', { class: 'num' }, fmt(value, 2)));
  const same = el('div', {}, [1, 4, 10].map((rank) => row(`A perfect result (3) at rank ${rank}`, MAX_GRADE * discount(rank), MAX_GRADE, 'orange')));
  const liveBox = el('div'), liveCap = el('p', { class: 'caption' });

  const lesson = (title, ...kids) => el('div', { class: 'lesson' }, el('h3', {}, title), ...kids);
  root.replaceChildren(
    lesson('A high rank counts more.', columns, el('p', { class: 'caption' }, 'Each rank has a weight. Rank 1 counts in full, rank 3 counts half, and by rank 10 a result counts under a third.')),
    lesson('Points are grade times weight.', same, el('p', { class: 'caption' }, 'The same perfect result earns 3.00 at the top and only 0.87 at the bottom. Where you put a good result matters.')),
    lesson('nDCG is your score next to the best score.', liveBox, liveCap));

  api.subscribe(({ k, result: r }) => {
    liveBox.replaceChildren(
      row(`Your order, DCG@${k}`, r.dcg, Math.max(r.ideal, 1e-9), 'orange'),
      row(`Best order, DCG@${k}`, r.ideal, Math.max(r.ideal, 1e-9), 'blue'));
    liveCap.textContent = r.ideal > 0
      ? `Your order earns ${Math.round(r.ndcg * 100)}% of the points the best order could earn. That share is nDCG, ${fmt(r.ndcg, 2)}. It is 1 only when no better order exists.`
      : 'No result has a grade above 0, so there is nothing to score.';
  });
}

/** "Where it breaks": a result nobody judged counts as 0. */
export function mountBreaks(root, example) {
  const cfg = example.breaks;
  const state = { judged: false };
  const box = el('div', { 'aria-live': 'polite' });
  const toggle = el('input', { type: 'checkbox', id: 'ndcg-judge-toggle' });
  toggle.addEventListener('change', () => { state.judged = toggle.checked; draw(); });
  root.replaceChildren(
    el('div', { class: 'check' }, toggle, el('label', { for: 'ndcg-judge-toggle' }, 'Ask a judge to grade the new page (they give it a 3)')),
    box);

  function draw() {
    const docs = cfg.docs.map((d) => (state.judged && d.hiddenGrade != null ? { ...d, grade: d.hiddenGrade } : d));
    const byId = new Map(docs.map((d) => [d.id, d]));
    const [a, b] = pooledScores({ docs, rankings: [cfg.systemA, cfg.systemB], k: cfg.k });
    const system = (name, ids, r, color, ahead) => el('div', { class: 'sys' },
      el('div', { class: 'sys-head' }, el('strong', {}, name), ahead ? el('span', { class: 'tag' }, 'ahead') : null),
      el('div', { class: 'gtiles' }, ids.map((id) => {
        const g = byId.get(id).grade;
        return el('span', { class: g == null ? 'gtile unknown' : 'gtile', title: byId.get(id).title }, g == null ? '?' : String(g));
      })),
      el('div', { class: 'score-line' }, stackedBar({ segments: [{ value: r.ndcg }], max: 1, color, label: `${name}: nDCG@${cfg.k} ${fmt(r.ndcg, 2)}` }),
        el('span', { class: 'num' }, fmt(r.ndcg, 2))),
      el('p', { class: 'bar-text muted' }, `nDCG@${cfg.k}`));
    box.replaceChildren(
      el('div', { class: 'systems' },
        system('Old system', cfg.systemA, a, 'blue', a.ndcg > b.ndcg),
        system('New system', cfg.systemB, b, 'orange', b.ndcg > a.ndcg)),
      el('p', { class: 'caption' }, state.judged
        ? 'With a grade of 3 on the new page, the new system is ahead. Its best result was always better. The metric just could not see it.'
        : 'The new system put a page at rank 1 that no judge ever graded. It shows as “?”, counts as 0, and the new system loses.'));
  }
  draw();
}
