// A decision model answers a typed question about a situation. Here the question is "which tool?" with a fixed list of options.
// It scores every option in one forward pass and turns the scores into probabilities that add up to 100% (a softmax).
// The scores below are made up by hand so the picture is clear. A real model learns them from labelled decisions.
// An LLM that writes its answer as text needs one forward pass per token it writes (counted here with a real tokenizer).

import { el, slider, segmented, meter } from '../../shared/lib.js';

/** Softmax, shifted by the maximum so large scores cannot overflow. */
export function softmax(scores) {
  const m = Math.max(...scores), e = scores.map((s) => Math.exp(s - m)), t = e.reduce((a, b) => a + b, 0);
  return e.map((x) => x / t);
}
/** Options and their scores for one request, with or without the extra "none of these" option. */
export function options(ex, request, none) {
  const r = ex.requests[request];
  const labels = none ? [...ex.tools, ex.noneLabel] : [...ex.tools];
  const scores = none ? [...r.scores, r.noneScore] : [...r.scores];
  return { labels, scores };
}
export function decide(ex, request, none) {
  const { labels, scores } = options(ex, request, none), probs = softmax(scores);
  const sorted = probs.map((p, i) => [p, i]).sort((a, b) => b[0] - a[0]);
  const best = sorted[0][1];
  return { labels, probs, best, confidence: sorted[0][0], second: sorted[1][0], margin: sorted[0][0] - sorted[1][0] };
}
/** Forward passes to answer: one for a decision model, one per written token for an LLM that writes its answer. */
export const passes = (ex, request) => ({ decision: 1, written: ex.requests[request].sayTokens });

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;

export function facts(ex) {
  const b = ex.breaks, a = decide(ex, 0, false), nf = decide(ex, 2, false), nfNone = decide(ex, 2, true);
  return {
    top: a.labels[a.best], topP: pct(a.confidence), tools: String(ex.tools.length),
    written: String(ex.requests[0].sayTokens), tokenizer: ex.tokenizer,
    bTop: nf.labels[nf.best], bTopP: pct(nf.confidence), bNone: pct(nfNone.confidence), bNoneLabel: nfNone.labels[nfNone.best], bText: ex.requests[b.request].text,
    bToolsSum: pct(nf.probs.reduce((s, x) => s + x, 0)),
  };
}

// ---------- drawing ----------
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));

export function mount(root, example) {
  const breaks = !!example.breaksView, start = breaks ? example.breaks : example;
  const state = { request: start.request, none: start.none };
  const rPick = segmented({ name: breaks ? 'req-b' : 'req', legend: 'Request', value: state.request, onChange: (v) => { state.request = Number(v); render(); },
    options: example.requests.map((r, i) => ({ value: i, label: r.short, title: r.text })) });
  rPick.root.classList.add('wide');
  const noneBox = el('input', { type: 'checkbox', id: breaks ? 'none-b' : 'none' });
  noneBox.checked = state.none;
  noneBox.addEventListener('change', () => { state.none = noneBox.checked; render(); });
  const oPick = { root: el('div', { class: 'check' }, noneBox, el('label', { for: noneBox.id }, 'Add a “None” option')) };
  const ask = el('p', { class: 'ask' });
  const cards = { probs: el('div', { class: 'card' }), passes: el('div', { class: 'card' }), conf: el('div', { class: 'card hide-s' }) };
  root.replaceChildren(el('div', { class: 'controls' }, el('div', { class: 'seg-field' }, el('span', {}, 'Request'), rPick.root), oPick.root),
    el('div', { class: 'cards rl' }, cards.probs, cards.passes, cards.conf),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: the option it picks. ', el('span', { class: 'key grey' }), 'Grey: the others. The scores are made up for this page.'));

  function render() {
    const r = example.requests[state.request], d = decide(example, state.request, state.none), ps = passes(example, state.request);
    cards.probs.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `“${r.text}”`), el('span', { class: 'tag' }, `picks ${d.labels[d.best]}`)),
      el('div', { class: 'wrows' }, d.labels.map((l, i) => row(l, meter({ value: d.probs[i], max: 1, color: i === d.best ? 'orange' : 'grey', label: `${l}: ${pct(d.probs[i])}` }), pct(d.probs[i])))),
      el('p', { class: 'story hide-s' }, `The probabilities add up to 100% over the options on the list. ${state.none ? 'The extra option lets the model say that nothing fits.' : 'Whatever is not on the list cannot win.'}`));
    cards.passes.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Passes through the model')),
      el('div', { class: 'wrows' }, row('Decision', meter({ value: ps.decision, max: ps.written, label: `A decision model: ${ps.decision} pass` }), String(ps.decision)),
        row('Writes', meter({ value: ps.written, max: ps.written, color: 'blue', label: `An LLM writing its answer: ${ps.written} passes` }), String(ps.written))),
      el('p', { class: 'story hide-s' }, `The LLM writes “${r.say}” That is ${ps.written} tokens, one pass each (${example.tokenizer}). Its answer is then text that code has to parse.`));
    cards.conf.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'How sure it is')),
      el('div', { class: 'score-line' }, meter({ value: d.confidence, max: 1, label: `Confidence ${pct(d.confidence)}` }), el('span', { class: 'num' }, pct(d.confidence))),
      el('p', { class: 'story hide-s' }, `The top option has ${pct(d.confidence)}, ${pct(d.margin)} ahead of the next one. Code can act on a number like this.`));
  }
  render();
  return { state };
}
