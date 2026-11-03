// RAG evals, split the way the RAGAS paper does (Es et al., 2023): faithfulness, answer relevance, context relevance.
// Here each passage is one sentence, and "needed" is marked by hand, so the sentence-level scores can be computed exactly.
// Real RAGAS asks a language model to extract the statements, check them, and regenerate questions.
import { el, fmt, meter, nextId } from '../../shared/lib.js';

/** A statement counts as supported when at least one passage that supports it was retrieved. */
export const isSupported = (statement, retrievedIds) => statement.supportedBy.some((id) => retrievedIds.includes(id));

/** RAGAS faithfulness: F = |V| / |S|, supported statements over all statements. */
export function faithfulness(statements, retrievedIds) {
  if (!statements.length) return 0;
  return statements.filter((s) => isSupported(s, retrievedIds)).length / statements.length;
}

/** RAGAS context relevance: needed sentences over all sentences in the context. Here a passage is one sentence. */
export function contextRelevance(passages, retrievedIds) {
  const got = passages.filter((p) => retrievedIds.includes(p.id));
  return got.length ? got.filter((p) => p.needed).length / got.length : 0;
}

/** Not in the RAGAS paper's three, but the obvious question for the retrieval step: was everything needed retrieved? */
export function contextRecall(passages, retrievedIds) {
  const need = passages.filter((p) => p.needed);
  return need.length ? need.filter((p) => retrievedIds.includes(p.id)).length / need.length : 1;
}

export function verdict(answer, retrievedIds) {
  const f = faithfulness(answer.statements, retrievedIds);
  const missing = answer.statements.filter((s) => !isSupported(s, retrievedIds)).length;
  if (f === 1 && answer.correct) return 'Every claim is in the context, and the answer is right.';
  if (f === 1) return answer.relevant ? 'Faithful and still wrong: the context it used does not hold the right answer.' : 'Faithful, but it answers a different question.';
  if (f === 0 && answer.correct) return 'Right answer, but nothing in the retrieved context supports it. It is not grounded.';
  return `${missing} of ${answer.statements.length} claims are not in the context. That part is made up.`;
}

export function facts(ex) {
  const f = {}, by = new Map(ex.answers.map((a) => [a.id, a]));
  for (const a of ex.answers) { f[`F.${a.id}`] = fmt(faithfulness(a.statements, ex.retrieved), 2); f[`Fb.${a.id}`] = fmt(faithfulness(a.statements, ex.breaks.retrieved), 2); }
  f.CR = fmt(contextRelevance(ex.passages, ex.retrieved), 2); f.recall = fmt(contextRecall(ex.passages, ex.retrieved), 2);
  f.gold = ex.gold; f.question = ex.question;
  f.CRb = fmt(contextRelevance(ex.passages, ex.breaks.retrieved), 2); f.recallb = fmt(contextRecall(ex.passages, ex.breaks.retrieved), 2);
  f.noAnswer = String(by.size);
  return f;
}

export function mount(root, example) {
  const breaksView = !!example.breaksView;
  const retrieved = new Set(breaksView ? example.breaks.retrieved : example.retrieved);
  const shown = breaksView ? example.answers.filter((a) => example.breaks.answers.includes(a.id)) : example.answers;
  const cards = el('div', { class: 'cards' }), stats = el('div', { class: 'stats' });
  const boxes = example.passages.map((p) => {
    const id = nextId('ps'), box = el('input', { type: 'checkbox', id }); box.checked = retrieved.has(p.id);
    box.addEventListener('change', () => { box.checked ? retrieved.add(p.id) : retrieved.delete(p.id); render(); });
    return el('div', { class: 'check passage' }, box, el('label', { for: id }, el('strong', {}, `${p.label}: `), el('span', { class: 'hide-s' }, `“${p.text}”`)));
  });
  const stat = (label) => { const n = el('span', { class: 'stat-num' }); return { n, root: el('div', { class: 'stat' }, el('span', { class: 'stat-label' }, label), n) }; };
  const sCR = stat('Context relevance'), sRec = stat('Context recall');
  stats.append(sCR.root, sRec.root);
  root.replaceChildren(
    el('p', { class: 'meta question' }, `${example.question} Right answer: ${example.gold}.`),
    el('fieldset', { class: 'field' }, el('legend', { class: 'sr-s' }, 'Passages the retriever returned'), ...boxes),
    stats, cards);

  function render() {
    const ids = [...retrieved];
    sCR.n.textContent = fmt(contextRelevance(example.passages, ids), 2); sRec.n.textContent = fmt(contextRecall(example.passages, ids), 2);
    cards.replaceChildren(...shown.map((a) => {
      const f = faithfulness(a.statements, ids);
      return el('div', { class: 'card' },
        el('div', { class: 'card-head' }, el('strong', {}, `Answer ${a.id}`), el('span', { class: a.correct ? 'tag' : 'meta' }, a.correct ? 'right' : 'wrong'), el('span', { class: 'meta hide-s' }, a.relevant ? 'on topic' : 'off topic')),
        el('p', { class: 'show-s answer-line' }, `“${a.text}”`),
        el('ul', { class: 'claims hide-s' }, a.statements.map((s) => el('li', {}, isSupported(s, ids) ? '✓ ' : '✗ ', s.text))),
        el('div', { class: 'score-line' }, el('span', { class: 'meta' }, 'Faithful'), meter({ value: f, max: 1, label: `Answer ${a.id}: faithfulness ${fmt(f, 2)}` }), el('span', { class: 'num' }, fmt(f, 2))),
        el('p', { class: 'story hide-s' }, verdict(a, ids)));
    }));
  }
  render();
  return {};
}
