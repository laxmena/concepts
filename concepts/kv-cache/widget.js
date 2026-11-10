// The KV cache. Writing token t needs the keys and values of tokens 1..t. Those never change, so a model can keep them.
// Without a cache every step runs all t tokens through the model again (t passes). With one, only the new token runs (1 pass).
// Cache size per token = 2 (key and value) x layers x KV heads x head size x bytes per number.
// Simplification: no prompt, one token per step. Real servers also process the prompt in one parallel pass first.

import { el, slider, segmented, meter, stackedBar } from '../../shared/lib.js';

export const kvBytesPerToken = (m, kvHeads) => 2 * m.layers * kvHeads * m.headDim * m.bytes;
export const cacheBytes = (n, perToken) => n * perToken;
export const stepPasses = (t, cache) => (cache ? 1 : t);
export const totalPasses = (n, cache) => (cache ? n : (n * (n + 1)) / 2);
/** How many users fit next to the weights, each holding `context` tokens of cache. */
export const maxUsers = (gpuBytes, weightsBytes, context, perToken) => Math.max(0, Math.floor((gpuBytes - weightsBytes) / (context * perToken)));

export function formatBytes(b) {
  const units = [[1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'KB']];
  for (const [size, name] of units) if (b >= size) return `${(b / size).toFixed(b / size < 10 ? 1 : 0)} ${name}`;
  return `${b} B`;
}
const num = (x) => Math.round(x).toLocaleString('en-US');

export function facts(ex) {
  const m = ex.model, n = ex.tokens, g = kvBytesPerToken(m, m.kvHeads.grouped), f = kvBytesPerToken(m, m.kvHeads.full);
  const b = ex.breaks, gpu = m.gpuGB * 1e9, w = m.weightsGB * 1e9;
  const per = kvBytesPerToken(m, m.kvHeads[b.heads]);
  return {
    n: num(n), layers: String(m.layers), kvHeads: String(m.kvHeads.grouped), headDim: String(m.headDim), bytes: String(m.bytes),
    perToken: formatBytes(g), perTokenFull: formatBytes(f), perTokenBytes: num(g),
    without: num(totalPasses(n, false)), withCache: num(totalPasses(n, true)), ratio: `${Math.round(totalPasses(n, false) / totalPasses(n, true))}×`,
    cache: formatBytes(cacheBytes(n, g)),
    bUsers: String(b.users), bContext: num(b.context), bCache: formatBytes(b.users * b.context * per),
    fitGrouped: String(maxUsers(gpu, w, b.context, g)), fitFull: String(maxUsers(gpu, w, b.context, f)),
    gpu: `${m.gpuGB} GB`, weights: `${m.weightsGB} GB`, oneUser: formatBytes(b.context * g),
  };
}

// ---------- drawing ----------
const row = (label, bar, value) => el('div', { class: 'wrow' }, el('span', { class: 'wword' }, label), bar, el('span', { class: 'num sm' }, value));
const headOptions = (m) => [{ value: 'grouped', label: `${m.kvHeads.grouped} KV heads`, title: 'Grouped-query attention: a few key/value heads shared by many query heads' }, { value: 'full', label: `${m.kvHeads.full} KV heads`, title: 'Every attention head keeps its own keys and values' }];

export function mount(root, example) {
  if (example.breaksView) return mountBreaks(root, example);
  const m = example.model, state = { n: example.tokens, heads: example.heads };
  const nS = slider({ label: 'Tokens written so far', min: 1, max: 4000, step: 1, value: state.n, format: num, onInput: (v) => { state.n = v; render(); } });
  const pick = segmented({ name: 'heads', legend: 'Key/value heads', value: state.heads, options: headOptions(m), onChange: (v) => { state.heads = v; render(); } });
  pick.root.classList.add('wide');
  const cards = { step: el('div', { class: 'card' }), total: el('div', { class: 'card' }), mem: el('div', { class: 'card' }) };
  root.replaceChildren(el('div', { class: 'controls' }, nS.root, el('div', { class: 'seg-field' }, el('span', {}, 'Key/value heads'), pick.root)),
    el('div', { class: 'cards three' }, cards.step, cards.total, cards.mem),
    el('p', { class: 'legend' }, el('span', { class: 'key orange' }), 'Orange: with the cache. ', el('span', { class: 'key blue' }), 'Blue: rerunning every earlier token, with no cache.'));

  function render() {
    const n = state.n, per = kvBytesPerToken(m, m.kvHeads[state.heads]), bytes = cacheBytes(n, per);
    const top = cacheBytes(4000, kvBytesPerToken(m, m.kvHeads.full));
    const sNo = stepPasses(n, false), sYes = stepPasses(n, true), tNo = totalPasses(n, false), tYes = totalPasses(n, true);
    cards.step.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Tokens run for the next token')),
      el('div', { class: 'wrows' }, row('Rerun', meter({ value: sNo, max: sNo, color: 'blue', label: `Without a cache: ${num(sNo)} tokens` }), num(sNo)),
        row('Cache', meter({ value: Math.max(sYes, sNo * 0.006), max: sNo, label: `With a cache: ${num(sYes)} token` }), num(sYes))),
      el('p', { class: 'story hide-s' }, `Without a cache the model runs all ${num(n)} earlier tokens again. With one it runs only the new token and reads the saved keys and values.`));
    cards.total.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, `Tokens run to write ${num(n)}`)),
      el('div', { class: 'wrows' }, row('Rerun', meter({ value: tNo, max: tNo, color: 'blue', label: `Without a cache: ${num(tNo)} token passes` }), num(tNo)),
        row('Cache', meter({ value: Math.max(tYes, tNo * 0.006), max: tNo, label: `With a cache: ${num(tYes)} token passes` }), num(tYes))),
      el('p', { class: 'story hide-s' }, `The no-cache total grows with the square of the length. The cache total grows in a straight line, so it is about ${Math.round(tNo / tYes)} times less here.`));
    cards.mem.replaceChildren(
      el('div', { class: 'card-head' }, el('strong', {}, 'Memory the cache takes'), el('span', { class: 'meta hide-s' }, `${formatBytes(per)} per token`)),
      el('div', { class: 'score-line' }, meter({ value: bytes, max: top, label: `${formatBytes(bytes)}` }), el('span', { class: 'num' }, formatBytes(bytes))),
      el('p', { class: 'story hide-s' }, `Each token stores a key and a value in every one of ${m.layers} layers, for ${m.kvHeads[state.heads]} heads of ${m.headDim} numbers. The bar is full at 4,000 tokens with ${m.kvHeads.full} heads.`));
  }
  render();
  return { state };
}

function mountBreaks(root, example) {
  const m = example.model, b = example.breaks, state = { users: b.users, context: b.context, heads: b.heads };
  const uS = slider({ label: 'People at once', min: 1, max: 128, step: 1, value: state.users, format: String, onInput: (v) => { state.users = v; draw(); } });
  const cS = slider({ label: 'Tokens each', min: 1024, max: 32768, step: 1024, value: state.context, format: num, onInput: (v) => { state.context = v; draw(); } });
  const pick = segmented({ name: 'heads-breaks', legend: 'Key/value heads', value: state.heads, options: headOptions(m), onChange: (v) => { state.heads = v; draw(); } });
  pick.root.classList.add('wide');
  const box = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(el('div', { class: 'controls' }, uS.root, cS.root, el('div', { class: 'seg-field' }, el('span', {}, 'Key/value heads'), pick.root)), box);
  const gpu = m.gpuGB * 1e9, w = m.weightsGB * 1e9;
  function draw() {
    const per = kvBytesPerToken(m, m.kvHeads[state.heads]), cache = state.users * state.context * per, used = w + cache, fits = used <= gpu;
    const fit = (h) => maxUsers(gpu, w, state.context, kvBytesPerToken(m, m.kvHeads[h]));
    box.replaceChildren(el('div', { class: 'cards' },
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `One ${m.gpuGB} GB GPU`), el('span', { class: 'tag' }, fits ? 'fits' : 'does not fit')),
        stackedBar({ segments: [{ value: w }, { value: cache }], max: gpu, label: `Weights ${formatBytes(w)} plus cache ${formatBytes(cache)} of ${m.gpuGB} GB` }),
        el('p', { class: 'bar-text' }, `Weights ${formatBytes(w)} + cache ${formatBytes(cache)} = ${formatBytes(used)}`),
        el('p', { class: 'story hide-s' }, `The first bar section is the model weights, which are the same for everyone. The next is the cache, which grows with every person and every token.`)),
      el('div', { class: 'card' }, el('div', { class: 'card-head' }, el('strong', {}, `People that fit at ${num(state.context)} tokens`)),
        el('div', { class: 'wrows' }, row(`${m.kvHeads.grouped} heads`, meter({ value: fit('grouped'), max: Math.max(fit('grouped'), 1), label: `${fit('grouped')} people with ${m.kvHeads.grouped} KV heads` }), String(fit('grouped'))),
          row(`${m.kvHeads.full} heads`, meter({ value: fit('full'), max: Math.max(fit('grouped'), 1), color: 'blue', label: `${fit('full')} people with ${m.kvHeads.full} KV heads` }), String(fit('full')))),
        el('p', { class: 'story hide-s' }, `One person with ${num(state.context)} tokens needs ${formatBytes(state.context * kvBytesPerToken(m, m.kvHeads[state.heads]))} of cache. Fewer KV heads means a smaller cache and more people per GPU.`))));
  }
  draw();
  return {};
}
