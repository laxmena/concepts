// Small DOM and SVG helpers shared by every widget.
// Rule: no top-level access to `document` or `window`, so Node tests can import this file.

export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...kids) {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
}

let counter = 0;
export const nextId = (prefix) => `${prefix}-${++counter}`;
export const fmt = (x, digits = 3) => Number(x).toFixed(digits);

/** A labelled range input with a live value. Native <input type=range>, so keyboard works. */
export function slider({ label, min, max, step, value, format = String, onInput }) {
  const id = nextId('slider');
  const input = el('input', { type: 'range', id, min, max, step, value });
  const out = el('output', { for: id }, format(value));
  input.addEventListener('input', () => {
    const v = Number(input.value);
    out.textContent = format(v);
    onInput(v);
  });
  const root = el('div', { class: 'slider' }, el('label', { for: id }, label), input, out);
  return { root, input };
}

/** Wire up every .reveal on the page: a button that shows or hides the .answer next to it. */
export function initReveals(scope) {
  for (const box of scope.querySelectorAll('.reveal')) {
    const button = box.querySelector('button');
    const answer = box.querySelector('.answer');
    if (!button || !answer) continue;
    answer.id ||= nextId('answer');
    answer.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', answer.id);
    const closed = button.dataset.closed || button.textContent;
    const open = button.dataset.open || 'Hide answer';
    button.textContent = closed;
    button.addEventListener('click', () => {
      const show = answer.hidden;
      answer.hidden = !show;
      button.setAttribute('aria-expanded', String(show));
      button.textContent = show ? open : closed;
    });
  }
}

/**
 * Horizontal bar chart as SVG. Every bar carries its value as text, so colour is never the only signal.
 * rows: [{ label, value, color? }], color is 'orange' | 'blue' | 'grey'.
 */
export function barChart({ rows, max, title, valueFormat = (v) => fmt(v) }) {
  const W = 360, rowH = 26, labelW = 64, valueW = 64, pad = 4;
  const barW = W - labelW - valueW;
  const top = Math.max(max ?? 0, ...rows.map((r) => r.value), 1e-9);
  const H = rows.length * rowH + pad * 2;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img' });
  root.setAttribute('aria-label', `${title}: ` + rows.map((r) => `${r.label} ${valueFormat(r.value)}`).join(', '));
  root.append(svg('line', { class: 'axis', x1: labelW, x2: labelW, y1: pad, y2: H - pad }));
  rows.forEach((r, i) => {
    const y = pad + i * rowH;
    const w = Math.max(0, (r.value / top) * barW);
    root.append(
      svg('text', { x: labelW - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, r.label),
      svg('rect', { class: `bar-${r.color ?? 'orange'}`, x: labelW, y: y + 4, width: w, height: rowH - 8 }),
      svg('text', { class: r.value === 0 ? 'muted' : '', x: labelW + w + 6, y: y + rowH / 2 + 4 }, valueFormat(r.value)),
    );
  });
  return root;
}

/**
 * A list of editable text rows. Typing never re-renders rows (so focus is kept);
 * add and remove do. `extra(item)` returns an element placed under each row's textarea.
 */
export function editableList({ items, noun = 'Document', min = 1, max = 6, onChange, extra, onRowChange }) {
  const root = el('div', { class: 'list' });
  const rows = new Map();
  const list = el('div');
  const addBtn = el('button', { type: 'button' }, `Add ${noun.toLowerCase()}`);
  root.append(list, el('div', { class: 'row-actions' }, addBtn));
  const nextLabel = () => {
    for (let i = 0; ; i++) {
      const id = String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
      if (!items.some((it) => it.id === id)) return id;
    }
  };
  function draw() {
    list.replaceChildren();
    rows.clear();
    for (const item of items) {
      const tid = nextId('row');
      const area = el('textarea', { id: tid, rows: 2 });
      area.value = item.text;
      area.addEventListener('input', () => { item.text = area.value; onChange(items); });
      const remove = el('button', { type: 'button', 'aria-label': `Remove ${noun.toLowerCase()} ${item.id}`, onclick: () => {
        items.splice(items.indexOf(item), 1);
        draw(); onChange(items);
      } }, 'Remove');
      remove.disabled = items.length <= min;
      const head = el('div', { class: 'doc-head' }, el('label', { for: tid }, `${noun} ${item.id}`), el('span', { class: 'doc-slot' }));
      const card = el('div', { class: 'doc' }, head, area, extra ? extra(item) : null, el('div', { class: 'row-actions' }, remove));
      rows.set(item.id, { card, head: head.querySelector('.doc-slot') });
      list.append(card);
    }
    addBtn.disabled = items.length >= max;
    onRowChange?.(rows);
  }
  addBtn.addEventListener('click', () => {
    items.push({ id: nextLabel(), text: '' });
    draw(); onChange(items);
    list.lastElementChild.querySelector('textarea').focus();
  });
  draw();
  return { root, rows, redraw: draw };
}

/**
 * One bar made of segments (orange), with an optional thin comparison bar under it (blue).
 * The outline shows the full width, so the reader can see how much of the maximum is used.
 * segments: [{ value }], max: value that fills the outline. ghost: { value, max } or null.
 */
export function stackedBar({ segments, max, ghost = null, label, color = 'orange' }) {
  const W = 400, H = ghost ? 32 : 22, full = W - 2, bar = 18;
  const root = svg('svg', { class: 'chart stacked', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
  root.append(svg('rect', { class: 'outline', x: 1, y: 1, width: full, height: bar }));
  let x = 1;
  for (const s of segments) {
    const w = max > 0 ? Math.min(full - (x - 1), (s.value / max) * full) : 0;
    if (w <= 0) continue;
    root.append(svg('rect', { class: `bar-${color}`, x, y: 1, width: w, height: bar }));
    if (x > 1) root.append(svg('line', { class: 'split', x1: x, x2: x, y1: 1, y2: bar + 1 }));
    x += w;
  }
  if (ghost) {
    const w = ghost.max > 0 ? (ghost.value / ghost.max) * full : 0;
    root.append(svg('rect', { class: 'bar-blue', x: 1, y: 23, width: Math.max(0, w), height: 7 }));
  }
  return root;
}

/** A bar built from HTML, so it stays crisp at any width. Orange fill, optional thin blue comparison bar under it. */
export function meter({ value, max, ghost = null, label, color = 'orange' }) {
  const pct = (v) => `${Math.max(0, Math.min(1, max > 0 ? v / max : 0)) * 100}%`;
  const root = el('div', { class: 'meter', role: 'img', 'aria-label': label },
    el('div', { class: `fill ${color}`, style: `width:${pct(value)}` }));
  if (ghost != null) root.append(el('div', { class: 'ghost', style: `width:${pct(ghost)}` }));
  return root;
}

/** A row of radio buttons drawn as a segmented control. Native radios: arrow keys work, every group has a legend. */
export function segmented({ name, legend, options, value, onChange }) {
  const root = el('fieldset', { class: 'segmented' }, el('legend', { class: 'sr-only' }, legend));
  const inputs = [];
  for (const o of options) {
    const id = nextId('seg');
    const input = el('input', { type: 'radio', name, id, value: String(o.value), class: 'seg-input' });
    input.checked = o.value === value;
    input.addEventListener('change', () => onChange(o.value));
    inputs.push([o.value, input]);
    root.append(input, el('label', { for: id, title: o.title }, o.label));
  }
  return { root, set(v) { for (const [val, input] of inputs) input.checked = val === v; } };
}

/**
 * A list you can reorder by dragging a row's handle, or by focusing the handle and pressing the arrow keys.
 * createRow(item, { handle }) builds a row once and returns { el, refs }. onReorder(ids) runs after every move.
 * The caller updates each row's text (rank, scores) itself; rows are never rebuilt, so focus and drags survive.
 */
export function sortableList({ items, createRow, onReorder, announce }) {
  const root = el('div', { class: 'sortable' });
  const rows = new Map();
  const order = items.map((i) => i.id);
  const place = () => order.forEach((id) => root.append(rows.get(id).el));
  function move(id, to) {
    order.splice(order.indexOf(id), 1);
    order.splice(to, 0, id);
    place();
    onReorder(order.slice());
  }
  function startDrag(event, id) {
    if (event.button !== 0) return;
    event.preventDefault();
    const rowEl = rows.get(id).el;
    rowEl.classList.add('dragging');
    const onMove = (e) => {
      const others = order.filter((x) => x !== id);
      let to = 0;
      for (const x of others) {
        const r = rows.get(x).el.getBoundingClientRect();
        if (e.clientY > r.top + r.height / 2) to++;
      }
      if (to !== order.indexOf(id)) move(id, to);
    };
    const stop = () => {
      rowEl.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      rows.get(id).handle.focus();
      announce?.(`Moved to rank ${order.indexOf(id) + 1}`);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  }
  for (const item of items) {
    const handle = el('button', { type: 'button', class: 'handle' });
    const made = createRow(item, { handle });
    rows.set(item.id, { ...made, handle });
    root.append(made.el);
    handle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const to = order.indexOf(item.id) + (e.key === 'ArrowUp' ? -1 : 1);
      if (to < 0 || to >= order.length) return;
      move(item.id, to);
      handle.focus();
      announce?.(`Moved to rank ${to + 1}`);
    });
    handle.addEventListener('pointerdown', (e) => startDrag(e, item.id));
  }
  return { root, rows, order: () => order.slice() };
}

/** A labelled group of radio buttons with full-width labels. Use it when `segmented` is too narrow for the text. */
export function radios({ name, legend, options, value, onChange }) {
  const root = el('fieldset', { class: 'field' }, el('legend', {}, legend));
  const inputs = [];
  for (const o of options) {
    const id = nextId('radio');
    const input = el('input', { type: 'radio', name, id, value: String(o.value) });
    input.checked = o.value === value;
    input.addEventListener('change', () => onChange(o.value));
    inputs.push([o.value, input]);
    root.append(el('div', { class: 'check' }, input, el('label', { for: id }, o.label)));
  }
  return { root, set(v) { for (const [val, input] of inputs) input.checked = val === v; } };
}
