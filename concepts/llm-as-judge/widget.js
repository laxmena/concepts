// LLM-as-judge: the measured biases of three 2023 judge models, from Zheng et al. (2023), "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena".
import { el, fmt, radios, meter, nextId } from '../../shared/lib.js';

/** Percentages from the paper are shares of 80 MT-bench questions, so they turn back into whole counts. */
export function toCounts(judge, n = 80) {
  const c = { consistent: Math.round((judge.consistent * n) / 100), first: Math.round((judge.first * n) / 100), second: Math.round((judge.second * n) / 100), error: Math.round((judge.error * n) / 100) };
  return c;
}

/** Swap the order and keep a verdict only when both orders agree. What is left is the consistent share. */
export const usableAfterSwap = (counts) => counts.consistent;

/** The verdict rule: a win only if the answer wins in both orders; otherwise a tie. */
export function swapVerdict(firstOrder, secondOrder) {
  return firstOrder === secondOrder ? firstOrder : 'tie';
}

/** How many of the padded answers the judge preferred, out of the number of answers tested. */
export const paddingFails = (judge, total = 23) => Math.round((judge.paddingFail * total) / 100);

export function facts(ex) {
  const f = {}, n = ex.questions;
  for (const j of ex.judges) {
    const c = toCounts(j, n);
    f[`${j.id}.consistent`] = String(c.consistent); f[`${j.id}.first`] = String(c.first); f[`${j.id}.second`] = String(c.second);
    f[`${j.id}.pad`] = String(paddingFails(j, ex.paddedAnswers));
  }
  f.n = String(n); f.padded = String(ex.paddedAnswers);
  f.agreeJudge = String(ex.agreement.gpt4WithHumans); f.agreeHuman = String(ex.agreement.humansWithHumans);
  f.fewShot = fmt(ex.fixes.consistencyFewShot, 1); f.before = fmt(ex.fixes.consistencyBefore, 1);
  return f;
}

const dots = (kinds, label) => el('div', { class: 'dots', role: 'img', 'aria-label': label }, kinds.map((k) => el('span', { class: `dot ${k.cls}` }, k.mark)));

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const byId = new Map(example.judges.map((j) => [j.id, j]));
  const state = { judge: example.judge, swap: example.swap };
  const group = radios({ name: nextId('judge'), legend: 'Judge', value: state.judge, options: example.judges.map((j) => ({ value: j.id, label: j.name })), onChange: (v) => { state.judge = v; render(); } });
  const swapId = nextId('swap'), swapBox = el('input', { type: 'checkbox', id: swapId });
  swapBox.checked = state.swap; swapBox.addEventListener('change', () => { state.swap = swapBox.checked; render(); });
  const cards = { pos: el('div', { class: 'card' }), agree: el('div', { class: 'card' }), fix: el('div', { class: 'card' }), math: el('div', { class: 'card' }) };
  root.replaceChildren(
    el('div', { class: 'toggles' }, group.root, el('div', { class: 'check' }, swapBox, el('label', { for: swapId }, 'Swap the order, keep verdicts that agree'))),
    el('div', { class: 'cards' }, cards.pos, cards.agree),
    el('details', {}, el('summary', {}, 'Show what helps'), el('div', { class: 'cards' }, cards.fix, cards.math)),
    el('p', { class: 'legend' }, 'Tiles: = same winner in both orders, 1 prefers the first answer shown, 2 prefers the second, ! unusable output. Numbers are from the paper.'));

  function render() {
    const j = byId.get(state.judge), c = toCounts(j, example.questions);
    const kinds = [
      ...Array(c.consistent).fill({ cls: 'same', mark: '=' }), ...Array(c.first).fill({ cls: state.swap ? 'drop' : 'first', mark: '1' }),
      ...Array(c.second).fill({ cls: state.swap ? 'drop' : 'second', mark: '2' }), ...Array(c.error).fill({ cls: state.swap ? 'drop' : 'err', mark: '!' })];
    cards.pos.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `${j.name}: ${example.questions} pairs of near-equal answers`)),
      dots(kinds, `${j.name} gave the same winner in both orders ${c.consistent} times, preferred the first answer ${c.first} times, the second ${c.second} times, and failed ${c.error} times.`),
      el('p', { class: 'story' }, state.swap
        ? `Keeping only verdicts that agree leaves ${usableAfterSwap(c)} of ${example.questions}. The other ${example.questions - c.consistent} count as ties.`
        : `The answers were almost the same, yet ${j.name} preferred the one shown first ${c.first} times and the one shown second ${c.second} times.`));
    const a = example.agreement;
    const row = (label, v) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, label), meter({ value: v, max: 100, label: `${label}: ${v}%`, color: label.startsWith('GPT') ? 'orange' : 'blue' }), el('span', { class: 'num' }, `${v}%`));
    cards.agree.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Agreement with people'), el('span', { class: 'meta hide-s' }, 'GPT-4 only')),
      row('GPT-4 and humans', a.gpt4WithHumans), row('Humans and humans', a.humansWithHumans),
      el('p', { class: 'story' }, 'On MT-bench, without ties, GPT-4 agreed with experts about as often as experts agreed with each other.'));
    const f = example.fixes;
    cards.fix.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Fix 1: show examples')),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, 'Before'), meter({ value: f.consistencyBefore, max: 100, label: `GPT-4 consistency before: ${f.consistencyBefore}%` }), el('span', { class: 'num' }, `${fmt(f.consistencyBefore, 1)}%`)),
      el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, 'With examples'), meter({ value: f.consistencyFewShot, max: 100, label: `GPT-4 consistency with examples: ${f.consistencyFewShot}%` }), el('span', { class: 'num' }, `${fmt(f.consistencyFewShot, 1)}%`)),
      el('p', { class: 'story' }, 'Adding worked examples to the prompt made GPT-4 consistent more often. The paper notes that being consistent does not mean being right.'));
    cards.math.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Fix 2: math answers'), el('span', { class: 'meta hide-s' }, `wrong, of ${f.mathOutOf}`)),
      ...f.math.map((m) => el('div', { class: 'mini' }, el('span', { class: 'mini-label' }, m.label), meter({ value: m.wrong, max: f.mathOutOf, label: `${m.label}: ${m.wrong} of ${f.mathOutOf} judged wrong` }), el('span', { class: 'num' }, `${m.wrong}`))),
      el('p', { class: 'story hide-s' }, 'GPT-4 called a wrong answer correct 14 times in 20. Showing it the reference answer cut that to 3.'));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const bk = example.breaks, byId = new Map(example.judges.map((j) => [j.id, j]));
  const box = el('div', { 'aria-live': 'polite' });
  const group = radios({ name: nextId('bj'), legend: 'Judge', value: example.judge, options: example.judges.map((j) => ({ value: j.id, label: j.name })), onChange: draw });
  root.replaceChildren(group.root, box);
  function draw(id = example.judge) {
    const j = byId.get(id), fails = paddingFails(j, example.paddedAnswers), total = example.paddedAnswers;
    const kinds = [...Array(fails).fill({ cls: 'first', mark: '✗' }), ...Array(total - fails).fill({ cls: 'same', mark: '✓' })];
    box.replaceChildren(el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Two answers, same content')),
        el('p', { class: 'words' }, el('span', { class: 'muted' }, 'Original: '), bk.original),
        el('p', { class: 'words' }, el('span', { class: 'muted' }, 'Padded: '), bk.padded),
        el('p', { class: 'bar-text muted' }, 'An illustration of the paper’s “repetitive list” test.')),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `${j.name}: ${total} padded answers`)),
        dots(kinds, `${j.name} preferred the padded answer ${fails} times out of ${total}.`),
        el('p', { class: 'story' }, `${j.name} preferred the padded answer ${fails} of ${total} times. ✗ means it was fooled, ✓ means it held.`))));
  }
  draw();
  return {};
}
