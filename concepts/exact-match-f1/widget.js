// Exact match and token F1, as in the SQuAD v1.1 evaluation (Rajpurkar et al., 2016).
// Cleaning: lowercase, drop punctuation, drop the words a / an / the, collapse spaces.
import { el, fmt, editableList, stackedBar, nextId } from '../../shared/lib.js';

export function normalize(text) {
  return text.toLowerCase().replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '').replace(/\b(a|an|the)\b/g, ' ').split(/\s+/).filter(Boolean).join(' ');
}
export const tokens = (text) => normalize(text).split(' ').filter(Boolean);

/** Which answer tokens count toward the overlap. A word counts as often as the reference has it. */
export function overlapTokens(predTokens, refTokens) {
  const left = new Map();
  for (const t of refTokens) left.set(t, (left.get(t) ?? 0) + 1);
  return predTokens.map((token) => {
    const n = left.get(token) ?? 0;
    if (n > 0) left.set(token, n - 1);
    return { token, shared: n > 0 };
  });
}

/** Score one answer against one reference. */
export function scoreOne(prediction, reference) {
  const p = tokens(prediction), g = tokens(reference);
  const em = normalize(prediction) === normalize(reference);
  const same = overlapTokens(p, g).filter((x) => x.shared).length;
  if (same === 0) return { em, f1: 0, precision: 0, recall: 0, same, predLen: p.length, refLen: g.length };
  const precision = same / p.length, recall = same / g.length;
  return { em, f1: (2 * precision * recall) / (precision + recall), precision, recall, same, predLen: p.length, refLen: g.length };
}

/** With several accepted answers, keep the best score. The SQuAD script takes the max for each metric. */
export function scoreAnswer(prediction, references) {
  const all = references.filter((r) => r.trim()).map((r) => ({ ...scoreOne(prediction, r), reference: r }));
  if (!all.length) return { ...scoreOne(prediction, ''), reference: '' };
  const best = all.reduce((a, b) => (b.f1 > a.f1 ? b : a));
  return { ...best, em: all.some((x) => x.em) };
}

export function story(s) {
  if (s.em) return 'Same as the reference once cleaned, so exact match is 1.';
  if (s.same === 0) return 'Shares no word with the reference, so F1 is 0.';
  return `Shares ${s.same} of its ${s.predLen} words with the ${s.refLen}-word reference. Precision ${fmt(s.precision, 2)}, recall ${fmt(s.recall, 2)}.`;
}

export function facts(ex) {
  const refs = ex.references;
  const f = { question: ex.question, reference: refs[0] };
  for (const a of ex.answers) { const s = scoreAnswer(a.text, refs); f[`f1.${a.id}`] = fmt(s.f1, 2); f[`em.${a.id}`] = s.em ? '1' : '0'; }
  for (const a of ex.breaks.answers) f[`bf1.${a.id}`] = fmt(scoreAnswer(a.text, refs).f1, 2);
  return f;
}

function answerCard(a, refs, { showRight } = {}) {
  const s = scoreAnswer(a.text, refs);
  const chips = overlapTokens(tokens(a.text), tokens(s.reference));
  return el('div', { class: 'card' },
    el('div', { class: 'card-head' }, el('strong', {}, `Answer ${a.id}`), el('span', { class: s.em ? 'tag' : 'meta' }, `exact match ${s.em ? 1 : 0}`)),
    el('p', { class: 'words answer-text hide-s' }, `“${a.text}”`),
    el('p', { class: 'words' }, el('span', { class: 'muted' }, 'Cleaned: '), chips.length ? chips.map((c) => (c.shared ? el('span', { class: 'tile match' }, c.token) : ` ${c.token} `)) : '(empty)'),
    el('div', { class: 'score-line' }, stackedBar({ segments: [{ value: s.f1 }], max: 1, label: `Answer ${a.id}: F1 ${fmt(s.f1, 2)}, exact match ${s.em ? 1 : 0}` }), el('span', { class: 'meta' }, 'F1'), el('span', { class: 'num' }, fmt(s.f1, 2))),
    showRight ? el('p', { class: 'story' }, a.right ? 'A person would mark this right.' : 'A person would mark this wrong.') : el('p', { class: 'story' }, story(s)));
}

export function mount(root, example) {
  const refId = nextId('ref');
  const refInput = el('input', { type: 'text', id: refId, value: example.references.join(' | '), autocomplete: 'off', spellcheck: 'false' });
  const state = { refs: example.references.slice() };
  const cards = el('div', { class: 'cards' });
  const answers = example.breaksView ? example.breaks.answers.map((a) => ({ ...a })) : example.answers.map((a) => ({ ...a }));
  const draw = () => cards.replaceChildren(...answers.map((a) => answerCard(a, state.refs, { showRight: example.breaksView })));
  refInput.addEventListener('input', () => { state.refs = refInput.value.split('|').map((x) => x.trim()); draw(); });
  const list = editableList({ items: answers, noun: 'Answer', min: 1, max: 6, onChange: draw, onRowChange: () => {} });
  draw();
  root.replaceChildren(
    el('p', { class: 'meta question' }, example.breaksView ? 'Question: Who wrote Pride and Prejudice? Reference: Jane Austen.' : example.question),
    ...(example.breaksView ? [] : [el('div', { class: 'controls one' }, el('div', { class: 'field' }, el('label', { for: refId }, 'Reference answer (separate several accepted answers with |)'), refInput))]),
    cards,
    ...(example.breaksView ? [] : [
      el('p', { class: 'legend' }, el('span', { class: 'key orange' }, ''), 'Orange words are the ones the metric counts as shared with the reference.'),
      el('details', {}, el('summary', {}, 'Try your own answers'), list.root)]));
  return { state };
}
