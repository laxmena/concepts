// Precision@k, recall@k and reciprocal rank for one ranked list with yes/no relevance.
import { el, fmt, slider, meter, sortableList, radios, nextId } from '../../shared/lib.js';

const top = (rels, k) => rels.slice(0, k);
const count = (rels) => rels.filter(Boolean).length;

/** Share of the top k results that are relevant. */
export const precisionAtK = (rels, k) => (k > 0 ? count(top(rels, k)) / k : 0);

/** Share of ALL relevant documents (total) that show up in the top k. */
export const recallAtK = (rels, k, total) => (total > 0 ? count(top(rels, k)) / total : 0);

/** 1 / rank of the first relevant result; 0 when there is none. */
export function reciprocalRank(rels) {
  const i = rels.findIndex(Boolean);
  return i < 0 ? 0 : 1 / (i + 1);
}

/** Mean reciprocal rank over several queries. */
export const meanReciprocalRank = (queries) => queries.reduce((s, r) => s + reciprocalRank(r), 0) / queries.length;

/** Best precision@k any ranking could reach when only `total` documents are relevant. */
export const bestPrecisionAtK = (total, k) => Math.min(total, k) / k;

export function facts(ex) {
  const rels = ex.results.map((r) => r.relevant), k = ex.k;
  const swapped = rels.slice(); [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
  return {
    k: String(k), total: String(ex.total), inTop: String(count(top(rels, k))),
    p: fmt(precisionAtK(rels, k), 2), r: fmt(recallAtK(rels, k, ex.total), 2), rr: fmt(reciprocalRank(rels), 2),
    rrBest: fmt(reciprocalRank(swapped), 2), pSwapped: fmt(precisionAtK(swapped, k), 2),
    perfect1: fmt(bestPrecisionAtK(1, ex.breaks.k), 2), perfect3: fmt(bestPrecisionAtK(3, ex.breaks.k), 2),
  };
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const items = example.results.map((r) => ({ ...r }));
  const byId = new Map(items.map((i) => [i.id, i]));
  const state = { k: example.k, total: example.total };
  const relevantCount = () => items.filter((i) => i.relevant).length;
  const kS = slider({ label: 'k: how many results you look at', min: 1, max: items.length, step: 1, value: state.k, format: String, onInput: (v) => { state.k = v; render(); } });
  const tS = slider({ label: 'R: relevant pages in the whole collection', min: 1, max: 20, step: 1, value: state.total, format: String, onInput: (v) => { state.total = v; render(); } });
  const stat = (label) => { const n = el('span', { class: 'stat-num' }), l = el('span', { class: 'stat-label' }, label); return { n, l, root: el('div', { class: 'stat' }, l, n) }; };
  const sP = stat(''), sR = stat(''), sM = stat('Reciprocal rank');
  const status = el('p', { class: 'sr-only', role: 'status' });
  const list = sortableList({
    items, announce: (m) => { status.textContent = m; }, onReorder: () => render(),
    createRow: (item, { handle }) => {
      const id = nextId('rel');
      const box = el('input', { type: 'checkbox', id }); box.checked = item.relevant;
      box.addEventListener('change', () => { item.relevant = box.checked; render(); });
      const mark = el('span', { class: 'mark' });
      return { refs: { mark }, el: el('div', { class: 'rank-row simple' }, handle, el('div', { class: 'rtitle' }, item.title),
        el('div', { class: 'check' }, box, el('label', { for: id }, 'Relevant'), mark)) };
    },
  });
  const cut = el('p', { class: 'legend' });
  root.replaceChildren(
    el('p', { class: 'meta question' }, `Query: “${example.query}”`),
    el('div', { class: 'controls' }, kS.root, tS.root),
    el('div', { class: 'stats' }, sP.root, sR.root, sM.root),
    list.root, cut, status);

  function render() {
    state.total = Math.max(state.total, relevantCount());
    tS.input.value = state.total; tS.root.querySelector('output').textContent = String(state.total);
    const order = list.order(), rels = order.map((id) => byId.get(id).relevant), { k, total } = state;
    order.forEach((id, i) => {
      const row = list.rows.get(id), item = byId.get(id);
      row.handle.textContent = String(i + 1);
      row.handle.setAttribute('aria-label', `Rank ${i + 1}: ${item.title}${i < k ? '' : ', outside k'}. Press the up or down arrow key to move it.`);
      row.el.classList.toggle('dim', i >= k);
      row.el.classList.toggle('cut', i === k);
      row.refs.mark.textContent = item.relevant ? (i < k ? '✓ counts' : '✓') : '';
    });
    sP.l.textContent = `Precision@${k}`; sR.l.textContent = `Recall@${k}`;
    sP.n.textContent = fmt(precisionAtK(rels, k), 2); sR.n.textContent = fmt(recallAtK(rels, k, total), 2); sM.n.textContent = fmt(reciprocalRank(rels), 2);
    cut.textContent = `${count(top(rels, k))} relevant pages in the top ${k}. Precision divides by ${k}, recall divides by ${total}, reciprocal rank looks only at the first relevant page. Drag a rank number to move a result, or focus it and press the arrow keys. Rows below the dashed line are outside k.`;
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const { k, totals } = example.breaks;
  const box = el('div', { 'aria-live': 'polite' });
  const group = radios({ name: nextId('tot'), legend: 'The collection has this many relevant pages', value: totals[0], options: totals.map((t) => ({ value: t, label: String(t) })), onChange: draw });
  root.replaceChildren(group.root, box);
  function draw(total = totals[0]) {
    const rels = Array.from({ length: k }, (_, i) => i < total);
    const card = (title, v, text) => el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, title)),
      el('div', { class: 'score-line' }, meter({ value: v, max: 1, label: `${title}: ${fmt(v, 2)}` }), el('span', { class: 'num' }, fmt(v, 2))), el('p', { class: 'story' }, text));
    box.replaceChildren(
      el('p', { class: 'caption' }, `A perfect system puts all ${Math.min(total, k)} relevant page${total === 1 ? '' : 's'} at the top of the list.`),
      el('div', { class: 'cards' },
        card(`Precision@${k}`, precisionAtK(rels, k), `Only ${Math.min(total, k)} of ${k} slots can be relevant, so even a perfect list cannot score above ${fmt(bestPrecisionAtK(total, k), 2)}.`),
        card(`Recall@${k}`, recallAtK(rels, k, total), 'Everything relevant is in the list, so recall is full.'),
        card('Reciprocal rank', reciprocalRank(rels), 'The first result is relevant, so this is 1.')));
  }
  draw();
  return {};
}
