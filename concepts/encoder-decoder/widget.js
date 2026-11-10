// Encoder-only, decoder-only and encoder-decoder transformers use the same attention. What differs is the mask:
// which tokens each token is allowed to look at. A blocked pair gets a score of minus infinity before the softmax, so its weight is 0.
// Row i is the token looking, column j is the token it looks at. In the encoder-decoder picture the first `s` tokens are the source
// (read by the encoder) and the rest are the output (written by the decoder, which also looks at the whole source).
// Simplification: a real encoder-decoder has two separate stacks and the decoder cross-attends to the encoder's final outputs.

import { el, slider, segmented, meter } from '../../shared/lib.js';

export const MODES = {
  encoder: { label: 'Encoder', short: 'bidirectional encoder', trained: 'Guess hidden words from both sides', writes: 'No', example: 'BERT' },
  decoder: { label: 'Decoder', short: 'decoder-only model', trained: 'Predict the next token', writes: 'Yes', example: 'GPT, Llama' },
  encdec: { label: 'Both', short: 'encoder-decoder model', trained: 'Turn an input into an output', writes: 'Yes', example: 'T5, the original Transformer' },
};

/** canSee[i][j] is true when token i may look at token j. s is the source length (encoder-decoder only). */
export function mask(mode, n, s = 0) {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => {
    if (mode === 'encoder') return true;
    if (mode === 'decoder') return j <= i;
    return i < s ? j < s : j < s || j <= i;
  }));
}
export const visible = (m, i) => m[i].map((ok, j) => (ok ? j : -1)).filter((j) => j >= 0);
export const pairs = (m) => m.reduce((t, r) => t + r.filter(Boolean).length, 0);

// ---- cost of writing n tokens, counted in attention scores (one head, one layer) ----
/** A bidirectional model has to read the whole text again for every new token, because earlier vectors change. Step t: t x t scores. */
export const writeBidirectional = (n) => (n * (n + 1) * (2 * n + 1)) / 6;
/** A decoder with a KV cache: the new token scores against the t tokens so far. */
export const writeDecoder = (n) => (n * (n + 1)) / 2;
/** Encoder-decoder: encode the s source tokens once (s x s), then each output token looks at the t outputs so far and the s source tokens. */
export const writeEncDec = (s, n) => s * s + (n * (n + 1)) / 2 + n * s;

const num = (x) => Math.round(x).toLocaleString('en-US');
export function facts(ex) {
  const n = ex.tokens.single.length, s = ex.tokens.source.length, b = ex.breaks;
  const e = mask('encoder', n), d = mask('decoder', n), x = mask('encdec', n, s);
  const i = ex.token - 1, w = ex.tokens.single[i];
  return {
    n: String(n), s: String(s), word: w, pos: String(ex.token),
    encPairs: String(pairs(e)), decPairs: String(pairs(d)), xPairs: String(pairs(x)), total: String(n * n),
    decSees: String(visible(d, i).length), xFirstOut: String(visible(x, s).length),
    bN: String(b.tokens), bS: String(b.source),
    bBi: num(writeBidirectional(b.tokens)), bDec: num(writeDecoder(b.tokens)), bEd: num(writeEncDec(b.source, b.tokens)),
    bRatio: `${Math.round(writeBidirectional(b.tokens) / writeDecoder(b.tokens))}×`,
  };
}

// ---------- drawing ----------
function grid(m, labels, mode, s, selected) {
  const n = m.length;
  const root = el('div', { class: 'mgrid', role: 'img', style: `--n:${n}`,
    'aria-label': `Attention mask. ${pairs(m)} of ${n * n} pairs are allowed. Token ${selected + 1}, ${labels[selected]}, sees ${visible(m, selected).map((j) => labels[j]).join(', ')}.` });
  root.append(el('span', { class: 'mc-corner' }));
  labels.forEach((w, j) => root.append(el('span', { class: `mc-label col${mode === 'encdec' && j === s - 1 ? ' sep' : ''}` }, w)));
  m.forEach((row, i) => {
    root.append(el('span', { class: `mc-label row${i === selected ? ' on' : ''}${mode === 'encdec' && i === s - 1 ? ' sep' : ''}` }, labels[i]));
    row.forEach((ok, j) => root.append(el('span', { class: `mc${ok ? ' yes' : ' no'}${i === selected ? ' sel' : ''}${mode === 'encdec' && j === s - 1 ? ' sepc' : ''}${mode === 'encdec' && i === s - 1 ? ' sepr' : ''}` }, ok ? '✓' : ''))
    );
  });
  return root;
}
const line = (k, v) => el('div', { class: 'mrow' }, el('span', {}, k), el('strong', {}, v));

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const t = example.tokens, state = { mode: example.mode, token: example.token };
  const labelsFor = (mode) => (mode === 'encdec' ? [...t.source, ...t.target] : t.single);
  const pick = segmented({ name: 'mode', legend: 'Kind of model', value: state.mode, onChange: (v) => { state.mode = v; render(); },
    options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label, title: m.short + ' (' + (m.label === 'Both' ? 'encoder and decoder together' : m.label + ' only') + ')' })) });
  pick.root.classList.add('wide');
  const tS = slider({ label: 'Token that is looking', min: 1, max: t.single.length, step: 1, value: state.token, format: (v) => String(v), onInput: (v) => { state.token = v; render(); } });
  const cards = { grid: el('div', { class: 'card' }), sees: el('div', { class: 'card hide-s' }), facts: el('div', { class: 'card hide-s' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, el('div', { class: 'seg-field' }, el('span', {}, 'Kind of model'), pick.root), tS.root),
    el('div', { class: 'cards rl' }, cards.grid, cards.sees, cards.facts),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), '✓ in orange: the row’s token may look at the column’s token. Empty: blocked.'));
  function render() {
    const labels = labelsFor(state.mode), s = t.source.length, m = mask(state.mode, labels.length, s), i = state.token - 1, vis = visible(m, i);
    const info = MODES[state.mode];
    cards.grid.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Who may look at whom'), el('span', { class: 'tag' }, `${pairs(m)} of ${labels.length ** 2}`)),
      grid(m, labels, state.mode, s, i),
      el('p', { class: 'story hide-s' }, state.mode === 'encoder' ? 'Every token looks at every token, so the grid is full.' : state.mode === 'decoder' ? 'A token looks at itself and the tokens before it, so only the lower triangle is open.' : `The first ${s} tokens are the input and read each other freely. Each output token looks at the whole input and at the outputs before it.`));
    cards.sees.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `“${labels[i]}” looks at`), el('span', { class: 'tag' }, `${vis.length} of ${labels.length}`)),
      el('div', { class: 'toks' }, labels.map((w, j) => el('span', { class: vis.includes(j) ? 'tok merged' : 'tok raw', title: vis.includes(j) ? 'visible' : 'blocked' }, w))),
      el('p', { class: 'story' }, vis.length === labels.length ? 'It sees the whole text, the words after it as well.' : `It cannot see ${labels.length - vis.length} token${labels.length - vis.length === 1 ? '' : 's'}: ${labels.filter((_, j) => !vis.includes(j)).map((w) => `“${w}”`).join(', ')}.`));
    cards.facts.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `The ${info.short}`)),
      line('Trained to', info.trained), line('Writes text', info.writes), line('Examples', info.example),
      el('p', { class: 'story hide-s' }, 'The mask also sets how the model is trained, because training needs every token to have a fair question.'));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const b = example.breaks, state = { n: b.tokens, s: b.source };
  const nS = slider({ label: 'Tokens to write', min: 10, max: 500, step: 10, value: state.n, format: num, onInput: (v) => { state.n = v; draw(); } });
  const sS = slider({ label: 'Input length (for encoder-decoder)', min: 10, max: 500, step: 10, value: state.s, format: num, onInput: (v) => { state.s = v; draw(); } });
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls' }, nS.root, sS.root), box);
  function draw() {
    const n = state.n, rows = [['Encoder', writeBidirectional(n), 'blue'], ['Decoder', writeDecoder(n), 'orange'], ['Both', writeEncDec(state.s, n), 'grey']];
    const top = Math.max(...rows.map((r) => r[1])), log = (v) => Math.log10(Math.max(v, 1)) / Math.log10(top);
    box.replaceChildren(el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `Attention scores to write ${num(n)} tokens`)),
        el('div', { class: 'wrows' }, rows.map(([l, v, c]) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, l), meter({ value: log(v), max: 1, color: c, label: `${l}: ${num(v)} scores` }), el('span', { class: 'num sm' }, num(v))))),
        el('p', { class: 'story hide-s' }, 'Encoder: made to write by reading all the text again at every step. Decoder: with a KV cache. One head in one layer, on a log scale.')),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Why the gap')),
        el('p', { class: 'story' }, 'In a bidirectional model every new word changes what the earlier words mean, so their vectors cannot be saved. Each step reads the whole text again. A decoder’s earlier tokens never see the new one, so their keys and values are kept and only the new token is computed.'),
        el('p', { class: 'story hide-s' }, `At ${num(n)} tokens the rereading model does about ${Math.round(writeBidirectional(n) / writeDecoder(n))} times the work.`))));
  }
  draw();
  return {};
}
