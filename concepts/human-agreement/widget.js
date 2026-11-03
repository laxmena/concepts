// Cohen's kappa for two raters and two labels. kappa = (po - pe) / (1 - pe).
// Interpretation bands: Landis and Koch (1977), as listed on Wikipedia (which says they are opinion, not evidence).
import { el, fmt, nextId, meter } from '../../shared/lib.js';

/** table = [[both yes, A yes B no], [A no B yes, both no]]. Rows are rater A, columns are rater B. */
export function kappa(table) {
  const [[a, b], [c, d]] = table, n = a + b + c + d;
  if (n === 0) return { n, po: 0, pe: 0, kappa: null, aYes: 0, bYes: 0, chanceYes: 0, chanceNo: 0 };
  const po = (a + d) / n, aYes = (a + b) / n, bYes = (a + c) / n;
  const chanceYes = aYes * bYes, chanceNo = (1 - aYes) * (1 - bYes), pe = chanceYes + chanceNo;
  return { n, po, pe, kappa: pe === 1 ? null : (po - pe) / (1 - pe), aYes, bYes, chanceYes, chanceNo };
}

export function landisKoch(k) {
  if (k === null) return 'undefined';
  if (k < 0) return 'no agreement';
  if (k <= 0.2 + 1e-9) return 'slight';
  if (k <= 0.4 + 1e-9) return 'fair';
  if (k <= 0.6 + 1e-9) return 'moderate';
  if (k <= 0.8 + 1e-9) return 'substantial';
  return 'almost perfect';
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const kfmt = (k) => (k === null ? 'n/a' : fmt(k, 2));

export function facts(ex) {
  const by = new Map(ex.presets.map((p) => [p.id, p])), f = {};
  for (const p of ex.presets) { const r = kappa(p.table); f[`po.${p.id}`] = pct(r.po); f[`pe.${p.id}`] = pct(r.pe); f[`k.${p.id}`] = kfmt(r.kappa); f[`word.${p.id}`] = landisKoch(r.kappa); f[`n.${p.id}`] = String(r.n); }
  const g = kappa(by.get('grant').table);
  f.aYes = pct(g.aYes); f.bYes = pct(g.bYes); f.chanceYes = pct(g.chanceYes); f.chanceNo = pct(g.chanceNo);
  return f;
}

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const by = new Map(example.presets.map((p) => [p.id, p]));
  const table = by.get(example.preset).table.map((r) => r.slice());
  const selId = nextId('preset');
  const select = el('select', { id: selId }, example.presets.map((p) => el('option', { value: p.id }, p.label)));
  select.value = example.preset;
  select.addEventListener('change', () => { by.get(select.value).table.forEach((r, i) => r.forEach((v, j) => { table[i][j] = v; inputs[i][j].value = v; })); render(); });
  const group = { root: el('div', { class: 'field' }, el('label', { for: selId }, 'Start from'), select) };
  const cell = (i, j, label) => {
    const input = el('input', { type: 'number', min: 0, max: 999, step: 1, value: table[i][j], 'aria-label': label });
    input.addEventListener('input', () => { table[i][j] = Math.max(0, Math.floor(Number(input.value) || 0)); render(); });
    return input;
  };
  const inputs = [[cell(0, 0, 'Both say yes'), cell(0, 1, 'A says yes, B says no')], [cell(1, 0, 'A says no, B says yes'), cell(1, 1, 'Both say no')]];
  const grid = el('div', { class: 'agree-grid' },
    el('span', {}), el('span', { class: 'meta' }, 'B says yes'), el('span', { class: 'meta' }, 'B says no'),
    el('span', { class: 'meta' }, 'A says yes'), inputs[0][0], inputs[0][1],
    el('span', { class: 'meta' }, 'A says no'), inputs[1][0], inputs[1][1]);
  const cards = { po: el('div', { class: 'card' }), pe: el('div', { class: 'card' }), k: el('div', { class: 'card' }), why: el('div', { class: 'card hide-s' }) };
  root.replaceChildren(
    el('div', { class: 'agree-top' }, grid, group.root),
    el('div', { class: 'cards' }, cards.po, cards.pe, cards.k, cards.why));

  function render() {
    const r = kappa(table);
    const card = (box, title, meta, value, bar, text, num) => box.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, title), el('span', { class: 'meta hide-s' }, meta)),
      el('div', { class: 'score-line' }, bar, el('span', { class: 'num' }, num ?? pct(value))), el('p', { class: 'story hide-s' }, text));
    card(cards.po, 'Agreement', 'what you see', r.po, meter({ value: r.po, max: 1, label: `Observed agreement ${pct(r.po)}` }), `They gave the same label on ${table[0][0] + table[1][1]} of ${r.n} items.`);
    card(cards.pe, 'Chance agreement', 'what luck gives', r.pe, meter({ value: r.pe, max: 1, color: 'blue', label: `Agreement expected by chance ${pct(r.pe)}` }), 'How often two raters with these habits would agree if they labelled at random.');
    const k = r.kappa;
    card(cards.k, 'Kappa', k === null ? '' : landisKoch(k), k ?? 0, meter({ value: k === null ? 0 : Math.max(0, k), max: 1, label: `Kappa ${kfmt(k)}` }), 'Agreement beyond chance, as a share of the most that could be beyond chance.', kfmt(k));
    cards.why.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Where chance comes from')),
      el('p', { class: 'bar-text' }, `A says yes ${pct(r.aYes)}, B says yes ${pct(r.bYes)}.`),
      el('p', { class: 'bar-text' }, `Both yes by luck: ${pct(r.chanceYes)}. Both no by luck: ${pct(r.chanceNo)}.`),
      el('p', { class: 'story' }, `Chance agreement is their sum, ${pct(r.pe)}.`));
  }
  render();
  return {};
}

function mountBreaks(root, example) {
  const by = new Map(example.presets.map((p) => [p.id, p]));
  root.replaceChildren(el('div', { class: 'cards' }, example.breaks.ids.map((id) => {
    const p = by.get(id), r = kappa(p.table);
    return el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, p.label)),
      el('p', { class: 'bar-text' }, `yes/yes ${p.table[0][0]} · yes/no ${p.table[0][1]} · no/yes ${p.table[1][0]} · no/no ${p.table[1][1]}`),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, 'Agree'), meter({ value: r.po, max: 1, label: `Agreement ${pct(r.po)}` }), el('span', { class: 'num' }, pct(r.po))),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, 'Kappa'), meter({ value: Math.max(0, r.kappa), max: 1, color: 'blue', label: `Kappa ${kfmt(r.kappa)}` }), el('span', { class: 'num' }, kfmt(r.kappa))),
      el('p', { class: 'story' }, `Chance agreement is ${pct(r.pe)}.`));
  })));
  return {};
}
