// A map of the eval pages: what is graded, and who or what grades it. Pure data in example.json.
import { el, nextId } from '../../shared/lib.js';

/** Entries for one "what" column, in catalogue order. */
export const entriesFor = (entries, what) => entries.filter((e) => e.what.includes(what));

/** Does an entry match the "who grades" filter? "any" matches everything. */
export const matchesWho = (entry, who) => who === 'any' || entry.who.includes(who);

/** Entries that apply to every eval, whoever grades it. */
export const alwaysEntries = (entries) => entries.filter((e) => e.always);

export function facts(ex) {
  const pages = ex.entries.length;
  const answerCount = entriesFor(ex.entries, 'answer').length;
  const llm = ex.entries.filter((e) => e.who.includes('llm')).length;
  return { pages: String(pages), answerCount: String(answerCount), llm: String(llm) };
}

const link = (e) => el('a', { href: `../${e.slug}/` }, e.title);

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const state = { who: example.who };
  const selId = nextId('who'), select = el('select', { id: selId }, example.whoOptions.map((o) => el('option', { value: o.id }, o.label)));
  select.value = state.who; select.addEventListener('change', () => { state.who = select.value; render(); });
  const cards = example.whatOptions.map(() => el('div', { class: 'card' }));
  const always = el('p', { class: 'legend' });
  root.replaceChildren(el('div', { class: 'controls one' }, el('div', { class: 'field' }, el('label', { for: selId }, 'Who or what does the grading?'), select)), el('div', { class: 'cards three' }, cards), always);

  function render() {
    example.whatOptions.forEach((w, i) => {
      const list = entriesFor(example.entries, w.id), n = list.filter((e) => matchesWho(e, state.who)).length;
      cards[i].replaceChildren(
        el('div', { class: 'card-head' }, el('strong', {}, w.label), el('span', { class: 'meta hide-s' }, state.who === 'any' ? `${list.length} pages` : `${n} of ${list.length}`)),
        el('ul', { class: 'map-list' }, list.map((e) => el('li', { class: matchesWho(e, state.who) ? '' : 'off' }, link(e), el('span', { class: 'hide-s' }, ` ${e.use}`)))));
    });
    always.replaceChildren('Whatever you pick: ', ...alwaysEntries(example.entries).flatMap((e, i) => [i ? ' and ' : '', link(e), ` (${e.use.toLowerCase().replace(/\.$/, '')})`]), '.');
  }
  render();
  return { state };
}

/** "Where it breaks": every page's blind spot in one line. */
function mountBreaks(root, example) {
  root.replaceChildren(el('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': 'What each eval cannot see' },
    el('table', {}, el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'Eval'), el('th', { scope: 'col' }, 'What it cannot see'))),
      el('tbody', {}, example.entries.map((e) => el('tr', {}, el('td', {}, link(e)), el('td', {}, e.blind)))))));
  return {};
}
