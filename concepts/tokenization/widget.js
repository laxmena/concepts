// Byte-pair encoding (BPE), the way most language-model tokenizers are built.
// Start with bytes. Count every adjacent pair across the training text. Merge the most common pair into a new token. Repeat.
// To tokenize new text, cut it into bytes and apply the same merges in the same order.
// Simplifications: words are split on spaces and the space itself is free (real tokenizers keep it attached to the next word),
// and the training text is a few dozen words, so merges happen in a few dozen steps, not 100,000.
// A token is a string of hex digits, two per byte, so a merge is plain string joining and a token can be shown as bytes.

import { el, slider, segmented, meter } from '../../shared/lib.js';

const hex = (b) => b.toString(16).padStart(2, '0');
export const toBytes = (s) => [...new TextEncoder().encode(s)].map(hex);
/** The text of a token, or null when it ends in the middle of a character (so it cannot be shown as text). */
export function tokenText(t) {
  const bytes = new Uint8Array(t.match(/../g).map((h) => parseInt(h, 16)));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
export const byteLength = (t) => t.length / 2;

function mergeInto(word, a, b) {
  const out = [];
  for (let i = 0; i < word.length; i++) {
    if (i < word.length - 1 && word[i] === a && word[i + 1] === b) { out.push(a + b); i++; } else out.push(word[i]);
  }
  return out;
}

/** Learn up to `count` merges. corpus: [[word, timesSeen], ...]. Ties go to the pair seen first. */
export function train(corpus, count) {
  let words = corpus.map(([w, n]) => ({ toks: toBytes(w), n }));
  const merges = [];
  while (merges.length < count) {
    const pairs = new Map();
    for (const { toks, n } of words) for (let i = 0; i < toks.length - 1; i++) {
      const k = `${toks[i]}|${toks[i + 1]}`;
      pairs.set(k, (pairs.get(k) ?? 0) + n);
    }
    let best = null, bestN = 0;
    for (const [k, n] of pairs) if (n > bestN) { best = k; bestN = n; }
    if (!best) break;
    const [a, b] = best.split('|');
    merges.push({ a, b, token: a + b, count: bestN });
    words = words.map(({ toks, n }) => ({ toks: mergeInto(toks, a, b), n }));
  }
  return merges;
}

/** Tokens for one word: its bytes, then every merge in the order it was learned. */
export function encodeWord(word, merges) {
  let toks = toBytes(word);
  for (const m of merges) toks = mergeInto(toks, m.a, m.b);
  return toks;
}
/** Tokens for a phrase, as one list per word. */
export const encode = (text, merges) => text.split(/\s+/).filter(Boolean).map((w) => encodeWord(w, merges));
export const countTokens = (text, merges) => encode(text, merges).reduce((s, w) => s + w.length, 0);
export const countBytes = (text) => text.split(/\s+/).filter(Boolean).reduce((s, w) => s + toBytes(w).length, 0);
export const countChars = (text) => text.split(/\s+/).filter(Boolean).reduce((s, w) => s + [...w].length, 0);

const num = (x) => x.toLocaleString('en-US');
const one = (x) => (Math.round(x * 10) / 10).toFixed(1);

export function facts(ex) {
  const m = train(ex.english, ex.merges);
  const bn = ex.breaks.merges, bEn = train(ex.english, bn), bBoth = train([...ex.english, ...ex.tamil], bn);
  const { en, ta } = ex.sentences, r = ex.real.rows;
  return {
    merges: String(ex.merges), bMerges: String(bn),
    enText: en, taText: ta,
    enChars: String(countChars(en)), taChars: String(countChars(ta)), enBytes: String(countBytes(en)), taBytes: String(countBytes(ta)),
    enTokens0: String(countTokens(en, [])), taTokens0: String(countTokens(ta, [])),
    enTokens: String(countTokens(en, m)),
    firstMerges: m.slice(0, 3).map((x) => `“${tokenText(x.a)}” + “${tokenText(x.b)}”`).join(', '), firstCount: String(m[0].count),
    bEnTokens: String(countTokens(en, bEn)), bTaTokensEn: String(countTokens(ta, bEn)), bTaTokensBoth: String(countTokens(ta, bBoth)),
    realEn: String(ex.real.enTokens), realTa4: String(r[0].ta), realTa4o: String(r[1].ta),
    realRatio: `${one(r[0].ta / ex.real.enTokens)}×`, realRatio4o: `${one(r[1].ta / ex.real.enTokens)}×`,
    lib: ex.real.library,
  };
}
export { num };

// ---------- drawing ----------
function tok(t) {
  const text = tokenText(t), n = byteLength(t);
  if (text === null) return el('span', { class: 'tok raw', title: `${n} byte${n > 1 ? 's' : ''}, part of a character` }, t);
  return el('span', { class: n > 1 ? 'tok merged' : 'tok', title: `${n} byte${n > 1 ? 's' : ''}` }, text);
}
const chips = (words, label) => el('div', { class: 'toks', role: 'img', 'aria-label': label }, words.map((w) => el('span', { class: 'tw' }, w.map(tok))));
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));
const maxMerges = 160;

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const all = train(example.english, maxMerges), text = example.sentences.en, state = { n: example.merges };
  const nS = slider({ label: 'Merges learned', min: 0, max: maxMerges, step: 1, value: state.n, format: String, onInput: (v) => { state.n = v; render(); } });
  const cards = { toks: el('div', { class: 'card' }), list: el('div', { class: 'card' }), count: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls one' }, nS.root), el('div', { class: 'cards three' }, cards.toks, cards.list, cards.count),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: a token made of several bytes. ', el('span', { class: 'key tan' }), 'Tan: a single byte. Dashed, in hex: half a character.'));
  function render() {
    const m = all.slice(0, state.n), words = encode(text, m), t = words.reduce((s, w) => s + w.length, 0), c = countChars(text);
    cards.toks.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `“${text}” in tokens`), el('span', { class: 'tag' }, `${t} token${t === 1 ? '' : 's'}`)),
      chips(words, `${text} as ${t} tokens`),
      el('p', { class: 'story hide-s' }, state.n === 0 ? 'No merges yet, so every byte is its own token.' : `After ${state.n} merges the common letter groups have become single tokens.`));
    const last = m.slice(-5).reverse();
    cards.list.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Latest merges'), el('span', { class: 'meta hide-s' }, 'times seen')),
      last.length ? el('div', { class: 'wrows' }, last.map((x) => el('div', { class: 'mrow' }, el('span', { class: 'mono' }, `${tokenText(x.a) ?? x.a} + ${tokenText(x.b) ?? x.b} → ${tokenText(x.token) ?? x.token}`), el('span', { class: 'num sm' }, String(x.count))))) : el('p', { class: 'story' }, 'Nothing merged yet.'),
      el('p', { class: 'story hide-s' }, 'Each merge joins the pair that is most common across the training text, and the pair becomes one new token.'));
    cards.count.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Characters and tokens')),
      el('div', { class: 'wrows' }, row('Letters', meter({ value: c, max: c, color: 'blue', label: `${c} letters` }), String(c)), row('Tokens', meter({ value: t, max: c, label: `${t} tokens` }), String(t))),
      el('p', { class: 'story hide-s' }, `${one(c / t)} letters for every token. Fewer tokens for the same text means a cheaper and shorter input.`));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const b = example.breaks, state = { n: b.merges, corpus: b.corpus };
  const sets = { en: train(example.english, maxMerges), both: train([...example.english, ...example.tamil], maxMerges) };
  const nS = slider({ label: 'Merges learned', min: 0, max: maxMerges, step: 1, value: state.n, format: String, onInput: (v) => { state.n = v; draw(); } });
  const pick = segmented({ name: 'corpus', legend: 'Training text', value: state.corpus, onChange: (v) => { state.corpus = v; draw(); },
    options: [{ value: 'en', label: 'English only', title: 'The tokenizer learns merges from English text only' }, { value: 'both', label: 'English + Tamil', title: 'The training text includes a smaller share of Tamil' }] });
  pick.root.classList.add('wide');
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls' }, nS.root, el('div', { class: 'seg-field' }, el('span', {}, 'Trained on'), pick.root)), box,
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: a token of several bytes. Dashed, in hex: bytes that are half a character and cannot be shown as text.'));
  const real = example.real;
  function draw() {
    const m = sets[state.corpus].slice(0, state.n);
    const one_ = (text, name) => {
      const words = encode(text, m), t = words.reduce((s, w) => s + w.length, 0);
      return el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, name), el('span', { class: 'tag' }, `${t} tokens`)),
        chips(words, `${text} as ${t} tokens`), el('p', { class: 'meta' }, `${countChars(text)} characters, ${countBytes(text)} bytes`));
    };
    const rows = [['English', real.enTokens, 'blue'], ...real.rows.map((r) => [`Tamil, ${r.name.match(/\((\w+)_/)[1]}`, r.ta, 'orange'])];
    const top = Math.max(...rows.map((r) => r[1]));
    box.replaceChildren(el('div', { class: 'cards three' },
      one_(example.sentences.en, 'English'), one_(example.sentences.ta, 'The same greeting in Tamil'),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, 'Real tokenizers')),
        el('div', { class: 'wrows' }, rows.map(([l, v, c]) => row(l, meter({ value: v, max: top, color: c, label: `${l}: ${v} tokens` }), String(v)))),
        el('p', { class: 'story hide-s' }, `The same two-word greeting counted with ${real.library}. cl100k is GPT-4’s tokenizer, o200k is GPT-4o’s.`))));
  }
  draw();
  return {};
}
