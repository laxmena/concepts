// What is in public CLAUDE.md and AGENTS.md files, and a checker for your own file.
// Data: aggregates in ./data (built by the neri project; see data/schema.md). Nothing here sends your text anywhere.
// The overview, tree-dump and /init-line rules are ports of neri's definitions (src/neri/extras.py, postz.py), so a pasted file is
// measured the way the census measured public files. Token counts are an estimate: characters divided by the median characters
// per token seen in the census (o200k proxy, not Claude's tokenizer). Imports and commands use a simpler match and are labelled so.

import { el, svg, fmt, segmented } from '../../shared/lib.js';

// ---------- text rules (ported from neri) ----------
const TREE_CHARS = /[├└│]/;
const PATH_TOKEN = /^`?[\w@.+~-]+(?:\/[\w@.+~-]*)*\/?`?$/;
const KNOWN_EXT = new Set(['py', 'js', 'ts', 'tsx', 'jsx', 'md', 'json', 'toml', 'yaml', 'yml', 'sh', 'rs', 'go', 'java', 'kt', 'rb', 'c', 'cc',
  'cpp', 'h', 'hpp', 'cs', 'swift', 'php', 'css', 'scss', 'html', 'sql', 'txt', 'cfg', 'ini', 'lock', 'xml', 'mdx', 'vue', 'svelte']);
const COMMENT_START = /^(?:#|\/\/|--|—|–|-|:|→|<-|->)\s/;
const OVERVIEW_RE = /\b(overview|introduction|about|project structure|architecture|tech(?:nology)?[ -]stack)\b/i;
const SIG_RE = /provides guidance to claude code/i;
const MIN_RUN = 8;

export const splitLines = (text) => {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

function pathLike(line) {
  const s = line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)?/, '').trim();
  if (!s || s.startsWith('```') || s.startsWith('~~~') || s.startsWith('#')) return false;
  const sp = s.indexOf(' ');
  const first = sp < 0 ? s : s.slice(0, sp);
  const rest = sp < 0 ? '' : s.slice(sp + 1);
  if (!PATH_TOKEN.test(first)) return false;
  const core = first.replace(/^`+|`+$/g, '');
  const last = core.slice(core.lastIndexOf('/') + 1);
  const ext = last.includes('.') ? core.slice(core.lastIndexOf('.') + 1).toLowerCase() : '';
  if (!(core.includes('/') || KNOWN_EXT.has(ext))) return false;
  return rest.trim() === '' || COMMENT_START.test(rest.trim() + ' ');
}

/** [start, endExclusive) of fenced code blocks, fence lines included. */
export function fences(lines) {
  const out = [];
  let start = null;
  lines.forEach((l, i) => {
    const t = l.trimStart();
    if (t.startsWith('```') || t.startsWith('~~~')) {
      if (start === null) start = i;
      else { out.push([start, i + 1]); start = null; }
    }
  });
  if (start !== null) out.push([start, lines.length]);
  return out;
}

function merge(spans) {
  const out = [];
  for (const [a, b] of [...spans].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

/** Directory-tree dumps: fenced blocks with box-drawing characters on 2+ lines, or 8+ path-like lines in a row. */
export function treeSpans(text) {
  const lines = splitLines(text);
  const spans = [];
  for (const [a, b] of fences(lines)) {
    if (lines.slice(a, b).filter((l) => TREE_CHARS.test(l)).length >= 2) spans.push([a, b]);
  }
  let run = 0;
  for (let i = 0; i <= lines.length; i++) {
    if (i < lines.length && pathLike(lines[i])) run++;
    else { if (run >= MIN_RUN) spans.push([i - run, i]); run = 0; }
  }
  return merge(spans);
}

/** Sections whose heading looks like an overview. A section runs to the next heading of the same or a higher level. */
export function overviewSections(text) {
  const lines = splitLines(text);
  const fenced = new Set();
  for (const [a, b] of fences(lines)) for (let i = a; i < b; i++) fenced.add(i);
  const heads = [];
  lines.forEach((l, i) => {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(l);
    if (m && !fenced.has(i)) heads.push({ i, level: m[1].length, title: m[2] });
  });
  const found = [];
  heads.forEach((h, k) => {
    if (!OVERVIEW_RE.test(h.title)) return;
    let end = lines.length;
    for (const nx of heads.slice(k + 1)) if (nx.level <= h.level) { end = nx.i; break; }
    found.push({ a: h.i, b: end, title: h.title });
  });
  return merge(found.map((f) => [f.a, f.b])).map(([a, b]) => ({ a, b, title: found.find((f) => f.a === a).title }));
}

export const spanText = (text, spans) => {
  const lines = splitLines(text);
  return spans.flatMap((s) => lines.slice(s[0] ?? s.a, s[1] ?? s.b)).join('\n');
};

/** True when a line containing the /init stock sentence is among the first ten non-empty lines. */
export function hasInitLine(text) {
  return splitLines(text).filter((l) => l.trim() !== '').slice(0, 10).some((l) => SIG_RE.test(l));
}

// ---------- estimates ----------
export const estimateTokens = (chars, charsPerToken) => Math.ceil(chars / charsPerToken);
/** Range from the interquartile range of characters per token: a high ratio means fewer tokens. */
export const tokenRange = (chars, cal) => [Math.ceil(chars / cal.weighted.p75), Math.ceil(chars / cal.weighted.p25)];

/** Percent of files at or below `value`, interpolated between the table's percentile points. Returns 0 to 100 (clamped to 1 and 99). */
export function percentileOf(value, table) {
  const pts = Object.entries(table).filter(([k]) => /^p\d+$/.test(k)).map(([k, v]) => [Number(k.slice(1)), v]).sort((a, b) => a[0] - b[0]);
  if (value <= pts[0][1]) return pts[0][0];
  if (value >= pts[pts.length - 1][1]) return pts[pts.length - 1][0];
  for (let i = 1; i < pts.length; i++) {
    const [p0, v0] = pts[i - 1], [p1, v1] = pts[i];
    if (value <= v1) return v1 === v0 ? p1 : p0 + ((value - v0) / (v1 - v0)) * (p1 - p0);
  }
  return pts[pts.length - 1][0];
}

/** Weighted share of repos whose file has at most x tokens (a step function over the curve's points). */
export function ecdfAt(curve, x) {
  let share = 0;
  for (let i = 0; i < curve.tokens.length; i++) { if (curve.tokens[i] <= x) share = curve.cum_share[i]; else break; }
  return share;
}

// ---------- the checker ----------
const DONT_RE = /\b(never|don['’]?t|do not|must not|avoid)\b/i;
const RUNNERS = [
  /^(npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.@/-]+)/,
  /^(make|just)\s+(?!-)([A-Za-z][\w.-]*)/,
  /^(cargo|go)\s+([a-z][\w-]*)/,
  /^(uv|poetry|pipenv|hatch|pdm)\s+run\s+(?!-)([\w./-]+)/,
  /^(pytest|ruff|mypy|tox|nox)\b()/,
];
const TEST_BUILD = /(^|[:/_.-])(test|tests|build|pytest)($|[:/_.-])/;

/** Commands in code blocks and inline code, written as tool:target (for example npm:test). A simple match, not neri's full one. */
export function findCommands(text) {
  const lines = splitLines(text);
  const fenced = new Set();
  for (const [a, b] of fences(lines)) for (let i = a; i < b; i++) fenced.add(i);
  const seen = new Map();
  lines.forEach((line, i) => {
    let pieces;
    if (fenced.has(i)) {
      const s = line.trim();
      if (s.startsWith('```') || s.startsWith('~~~') || s.startsWith('#') || s.startsWith('//')) return;
      pieces = [s];
    } else pieces = [...line.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
    for (const p of pieces) {
      for (let seg of p.split(/\s*(?:&&|\|\||;|\|)\s*/)) {
        seg = seg.replace(/^\s*[$>]\s+/, '').replace(/^sudo\s+/, '').trim();
        for (const rx of RUNNERS) {
          const m = rx.exec(seg);
          if (!m) continue;
          const key = m[2] ? `${m[1]}:${m[2]}` : m[1];
          if (!seen.has(key)) seen.set(key, { cmd: key, testBuild: TEST_BUILD.test(key) });
          break;
        }
      }
    }
  });
  return [...seen.values()];
}

/** @path imports outside code blocks (a simple match: @ at a word start, then something that looks like a path). */
export function findImports(text) {
  const lines = splitLines(text);
  const fenced = new Set();
  for (const [a, b] of fences(lines)) for (let i = a; i < b; i++) fenced.add(i);
  const out = [];
  lines.forEach((l, i) => {
    if (fenced.has(i)) return;
    for (const m of l.replace(/`[^`]*`/g, ' ').matchAll(/(?:^|\s)@(~?\.{0,2}\/?[\w.-]+(?:\/[\w.-]+)*\.[A-Za-z]\w*|~?\.{0,2}\/[\w.-]+(?:\/[\w.-]+)*)/g)) out.push(m[1]);
  });
  return [...new Set(out)];
}

export function analyze(text, cal) {
  const lines = splitLines(text);
  const chars = text.length;
  const median = cal.weighted.median;
  const ov = overviewSections(text);
  const tr = treeSpans(text);
  const ovChars = spanText(text, ov).length, trChars = spanText(text, tr).length;
  const cmds = findCommands(text);
  return {
    chars, lines: lines.length,
    tokens: chars ? estimateTokens(chars, median) : 0,
    range: chars ? tokenRange(chars, cal) : [0, 0],
    init: hasInitLine(text),
    overviews: ov.map((s) => ({ title: s.title, lines: s.b - s.a })),
    overviewShare: chars ? ovChars / chars : 0,
    tree: tr.length > 0, treeShare: chars ? trChars / chars : 0,
    imports: findImports(text),
    commands: cmds, testBuild: cmds.filter((c) => c.testBuild),
    dontLines: lines.filter((l) => DONT_RE.test(l)).length,
  };
}

const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
const ci = (n) => `${pct(n.value)} (${pct(n.ci_lo)} to ${pct(n.ci_hi)})`;
const num = (n) => Math.round(n).toLocaleString('en-US');
const N = (nums, key) => nums.numbers[key];

/** Three to five suggestions, each tied to something found in the file. `kind` is 'claude' or 'agents'. */
export function suggestions(a, nums, kind, tokenPctAll) {
  const out = [];
  const name = kind === 'claude' ? 'CLAUDE.md' : 'AGENTS.md';
  if (a.overviews.length) {
    const t = N(nums, `${kind}.overall.a8.overview.token_share`);
    out.push({ id: 'overview', text: `Overview sections are ${pct(a.overviewShare)} of your file. In public ${name} files they average ${ci(t)} of the tokens. The agent can read the repo itself; keep what it cannot see.` });
  }
  if (a.tree) {
    const f = N(nums, `${kind}.overall.a8.tree_dump.share_files`);
    out.push({ id: 'tree', text: `A directory tree is ${pct(a.treeShare)} of your file. ${ci(f)} of public ${name} files paste one. An agent can list the folders; a tree here goes stale as the repo changes.` });
  }
  if (a.init && kind === 'claude') {
    const s = N(nums, 'claude.overall.g.sig.overview.token_share'), n = N(nums, 'claude.overall.g.nosig.overview.token_share');
    out.push({ id: 'init', text: `It opens with the /init stock line. Files that kept it spend ${pct(s.value)} of their tokens on overviews; files that rewrote it spend ${pct(n.value)}. Check what /init left in.` });
  }
  if (tokenPctAll >= 90) {
    out.push({ id: 'size', text: `Your file is bigger than about ${Math.round(tokenPctAll)}% of public ${name} files. Every line loads in every session, so each one should earn its place.` });
  }
  if (a.chars && a.testBuild.length === 0) {
    out.push({ id: 'commands', text: 'No test or build command found in code. Check that the commands you rely on are written down.' });
  }
  if (a.imports.length) {
    out.push({ id: 'imports', text: `${a.imports.length} @import${a.imports.length > 1 ? 's' : ''} found. Imported files load every session too, and the size comparison above leaves them out.` });
  }
  if (a.dontLines >= 5) {
    out.push({ id: 'dont', text: `${a.dontLines} lines carry a don't-style rule. Read them again and keep the ones a failed run would have broken.` });
  }
  if (out.length === 0 && a.chars) out.push({ id: 'size', text: 'Nothing here stands out against the public files.' });
  return out.slice(0, 5);
}

// ---------- the data behind the charts ----------
export const GROUP_NAME = { established: 'Popular repos', long_tail: 'Small & personal repos', overall: 'Everyone' };
export const FILE_NAME = { claude: 'CLAUDE.md', agents: 'AGENTS.md' };
export const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit', 'SubagentStop', 'PreCompact', 'SessionEnd', 'Notification'];
export const LINK_PARTS = [['symlink', 'symlink'], ['import_bridge', 'import'], ['prose_pointer', 'pointer in prose'], ['near_copy', 'near copy'], ['independent', 'independent']];

export function facts(example) {
  const { numbers: nums, calibration } = example.data;
  const n = nums.numbers, t = nums.totals;
  const v = (k) => n[k].value;
  return {
    files: t.n_files_total.toLocaleString('en-US'),
    medianTokens: num(v('claude.overall.a1.always_loaded_tokens.median')),
    p90Tokens: num(v('claude.overall.a1.always_loaded_tokens.p90')),
    agentsMedianTokens: num(v('agents.overall.a1.always_loaded_tokens.median')),
    sigShare: pct(v('claude.overall.g.sig.share')),
    sigOverview: pct(v('claude.overall.g.sig.overview.share_files')),
    nosigOverview: pct(v('claude.overall.g.nosig.overview.share_files')),
    sigTokens: pct(v('claude.overall.g.sig.overview.token_share')),
    nosigTokens: pct(v('claude.overall.g.nosig.overview.token_share')),
    linkedAny: pct(v('repo.overall.link.linked_any')),
    nearCopy: pct(v('repo.overall.link.class.near_copy')),
    independent: pct(v('repo.overall.link.class.independent')),
    hooksShare: pct(v('repo.overall.h.any.share_of_repos'), 1),
    preTool: pct(v('repo.overall.h.ev.PreToolUse.share_of_repos_with_hooks')),
    smallShare: pct(v('repo.overall.pop.small_personal_share')),
    nClaude: t.n_claude_files.toLocaleString('en-US'),
    nAgents: t.n_agents_files.toLocaleString('en-US'),
    nRepos: t.n_repos_overall.toLocaleString('en-US'),
    snapshot: t.snapshot_date,
    ratio: fmt(calibration.weighted.median, 2),
  };
}

// ---------- drawing ----------
const SAMPLE = `# Acme API

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Acme API is a service for managing orders. It is written in TypeScript and uses Express and Postgres.
The service is split into routes, services and a data layer. Routes parse requests, services hold the rules,
and the data layer talks to the database.

## Project structure

\`\`\`
src/
├── routes/
│   ├── orders.ts
│   └── users.ts
├── services/
│   └── orders.ts
└── db/
    └── client.ts
\`\`\`

## Commands

- \`npm run build\` compiles the service
- \`npm test\` runs the unit tests
- \`npm run lint\`

## Rules

- Never edit files in \`generated/\`.
- Do not add a dependency without asking.
- Avoid default exports.

@docs/api-style.md
`;

export function createHub() {
  const hub = { tokens: null, label: 'your file', listeners: [] };
  hub.set = (tokens, label) => { hub.tokens = tokens; hub.label = label; hub.listeners.forEach((f) => f()); };
  hub.on = (f) => hub.listeners.push(f);
  return hub;
}

function makeTip(root) {
  const tip = el('div', { class: 'af-tip', role: 'status', hidden: '' });
  root.style.position = 'relative';
  const show = (target) => {
    if (!tip.isConnected) root.append(tip);
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    const r = target.getBoundingClientRect(), b = root.getBoundingClientRect();
    tip.style.left = `${Math.max(0, Math.min(b.width - tip.offsetWidth, r.left - b.left + r.width / 2 - tip.offsetWidth / 2))}px`;
    tip.style.top = `${r.top - b.top - tip.offsetHeight - 6}px`;
  };
  const hide = () => { tip.hidden = true; };
  return {
    attach(node, text) {
      node.dataset.tip = text; node.setAttribute('tabindex', '0'); node.setAttribute('aria-label', text);
      node.addEventListener('pointerenter', () => show(node)); node.addEventListener('pointerleave', hide);
      node.addEventListener('focus', () => show(node)); node.addEventListener('blur', hide);
    },
  };
}

/** One horizontal bar row: a label, a bar with an optional interval, and the value printed at the end. */
function barRow(tip, { label, value, lo, hi, max, text, tipText, tone = 'orange' }) {
  const w = (x) => `${Math.max(0, Math.min(1, x / max)) * 100}%`;
  const track = el('div', { class: 'af-track' }, el('div', { class: `af-bar ${tone}`, style: `width:${w(value)}` }));
  if (lo !== undefined && hi !== undefined) track.append(el('div', { class: 'af-ci', style: `left:${w(lo)};width:calc(${w(hi)} - ${w(lo)})` }));
  const row = el('div', { class: 'af-row' }, el('span', { class: 'af-label' }, label), track, el('span', { class: 'num sm' }, text));
  tip.attach(row, tipText);
  return row;
}

function ciText(n) { return `${pct(n.value, 1)}, 95% interval ${pct(n.ci_lo, 1)} to ${pct(n.ci_hi, 1)}, from ${n.n.toLocaleString('en-US')} files or repos`; }

// ---- the checker ----
export function mount(root, example, hub = createHub()) {
  if (example.breaksView) return {};
  const { calibration, percentiles, numbers } = example.data;
  const state = { kind: 'claude', edited: false };
  const area = el('textarea', { id: 'af-text', rows: 5, spellcheck: 'false', autocomplete: 'off', 'aria-describedby': 'af-privacy' });
  area.value = SAMPLE;
  const kindSeg = segmented({ name: 'af-kind', legend: 'File type', value: state.kind,
    options: [{ value: 'claude', label: 'CLAUDE.md' }, { value: 'agents', label: 'AGENTS.md' }],
    onChange: (v) => { state.kind = v; render(); } });
  const results = el('div', { 'aria-live': 'polite' });
  root.replaceChildren(
    el('div', { class: 'af-input' },
      el('label', { for: 'af-text', class: 'af-lab' }, 'Paste your CLAUDE.md or AGENTS.md (a sample is filled in)'),
      area,
      el('div', { class: 'af-bar-row' }, segFieldOf('File type', kindSeg),
        el('button', { type: 'button', class: 'af-clear' , onclick: () => { area.value = ''; state.edited = true; render(); area.focus(); } }, 'Clear'))),
    el('p', { id: 'af-privacy', class: 'af-privacy' }, el('strong', {}, 'Your file never leaves your browser.'), ' Nothing is sent or stored; the page only reads what is in the box.'),
    results);
  area.addEventListener('input', () => { state.edited = true; render(); });

  function card(title, ...kids) { return el('div', { class: 'card af-card' }, el('div', { class: 'card-head' }, el('strong', {}, title)), ...kids); }

  function render() {
    const text = area.value;
    const a = analyze(text, calibration);
    const kind = state.kind;
    const tbl = (group, key) => percentiles.files[kind][group].all[key];
    if (!a.chars) {
      hub.set(null, 'your file');
      results.replaceChildren(el('p', { class: 'story' }, 'Paste a file to see how it compares.'));
      return;
    }
    const pAll = percentileOf(a.tokens, tbl('overall', 'always_loaded_tokens'));
    const pPop = percentileOf(a.tokens, tbl('established', 'always_loaded_tokens'));
    const lAll = percentileOf(a.lines, tbl('overall', 'lines'));
    hub.set(a.tokens, state.edited ? 'your file' : 'sample');
    const fn = FILE_NAME[kind];
    const nm = (m) => N(numbers, `${kind}.overall.${m}`);
    const fact = (label, value, tag) => el('div', { class: 'af-fact' }, el('span', {}, label), tag ? el('span', { class: 'tag' }, value) : el('span', { class: 'num sm' }, value));
    const cards = [
      card('Size',
        el('div', { class: 'score-line' }, el('span', { class: 'num' }, `≈ ${num(a.tokens)}`), el('span', { class: 'af-unit' }, 'tokens, always loaded')),
        el('p', { class: 'story' }, `Bigger than ${Math.round(pAll)}% of all ${fn} files and ${Math.round(pPop)}% of popular repos’ files. By line count (${a.lines}), ${Math.round(lAll)}%.`),
        el('p', { class: 'story hide-s' }, `Likely ${num(a.range[0])} to ${num(a.range[1])} tokens. Approximate, not Claude’s tokenizer. Imports are not counted.`)),
      card('What is in it',
        el('div', { class: 'af-facts' },
          fact('Opens with the /init line', a.init ? 'Yes' : 'No', true),
          fact('Overview sections', pct(a.overviewShare)),
          fact('Pasted directory tree', a.tree ? pct(a.treeShare) : 'None')),
        el('p', { class: 'story hide-s' }, `Public ${fn} files: ${kind === 'claude' ? `${pct(N(numbers, 'claude.overall.g.sig.share').value)} keep the /init line, ` : ''}overviews take ${pct(nm('a8.overview.token_share').value)} of tokens, ${pct(nm('a8.tree_dump.share_files').value)} have a tree.`),
        a.overviews.length ? el('p', { class: 'story hide-s' }, `Overview headings: ${a.overviews.map((o) => `“${o.title}”`).join(', ')}.`) : null),
      card('Commands and rules',
        a.commands.length
          ? el('div', { class: 'af-chips' }, a.commands.slice(0, 10).map((c) => el('span', { class: c.testBuild ? 'af-chip hot' : 'af-chip' }, c.cmd)))
          : el('div', { class: 'score-line' }, el('span', { class: 'num' }, 'None')),
        el('p', { class: 'story' }, `${a.commands.length} found; ${a.testBuild.length} for test or build (filled).`),
        el('p', { class: 'story hide-s' }, `${a.imports.length} @import${a.imports.length === 1 ? '' : 's'}${a.imports.length ? ` (${a.imports.slice(0, 2).join(', ')})` : ''}. ${a.dontLines} line${a.dontLines === 1 ? '' : 's'} with “never”, “don’t”, “do not”, “avoid” or “must not”. Commands, imports and rules use a simple match.`)),
    ];
    const tips = suggestions(a, numbers, kind, pAll);
    results.replaceChildren(
      el('div', { class: 'cards three af-cards' }, cards),
      el('div', { class: 'af-sugg' }, el('h3', {}, 'What stands out'),
        el('ul', {}, tips.map((s) => el('li', {}, s.text + ' ', el('a', { class: 'af-more', href: example.postUrl }, 'In the write-up →'))))));
  }
  render();
  return { state, hub };
}

// ---- the charts ----
function segFieldOf(legend, s) {
  s.root.classList.add('wide');
  return el('div', { class: 'seg-field' }, el('span', {}, legend), s.root);
}
function segField(legend, name, value, options, onChange) {
  return segFieldOf(legend, segmented({ name, legend, value, options, onChange }));
}

const X0 = 30, X1 = 30000;

export function mountSize(root, example, hub = createHub()) {
  const { ecdf } = example.data;
  const state = { kind: 'claude', hover: null };
  const W = 640, H = 300, L = 44, R = 150, T = 14, B = 34;
  const lx = (v) => L + ((Math.log10(v) - Math.log10(X0)) / (Math.log10(X1) - Math.log10(X0))) * (W - L - R);
  const ly = (s) => H - B - s * (H - B - T);
  const box = el('div', { class: 'af-chart' });
  const read = el('p', { class: 'af-read', 'aria-live': 'polite' });
  const seg = segField('File type', 'af-size-kind', state.kind, [{ value: 'claude', label: 'CLAUDE.md' }, { value: 'agents', label: 'AGENTS.md' }], (v) => { state.kind = v; state.hover = null; draw(); });
  root.replaceChildren(el('div', { class: 'controls one' }, seg), box, read);
  const curves = (kind) => [['established', 'orange', 'Popular repos'], ['long_tail', 'grey', 'Small & personal']].map(([g, tone, name]) => ({ g, tone, name, c: ecdf.files[kind][g] }));

  let s, mineG, hoverG;
  function drawMine() {
    mineG.replaceChildren();
    if (!hub.tokens) return;
    const x = lx(Math.min(Math.max(hub.tokens, X0), X1));
    mineG.append(svg('line', { class: 'af-mine', x1: x, x2: x, y1: T, y2: H - B }), svg('text', { class: 'af-minetext', x: x + 4, y: T + 10 }, `${hub.label}: ≈ ${num(hub.tokens)}`));
  }
  function hoverAt(tok) {
    const cs = curves(state.kind);
    state.hover = Math.min(Math.max(tok, X0), X1);
    const x = lx(state.hover);
    hoverG.replaceChildren(svg('line', { class: 'af-hover', x1: x, x2: x, y1: T, y2: H - B }),
      ...cs.map(({ c, tone }) => svg('circle', { cx: x, cy: ly(ecdfAt(c, state.hover)), r: 4, class: `af-dot ${tone}` })));
    const [p, q] = cs.map(({ c }) => ecdfAt(c, state.hover));
    read.textContent = `${num(state.hover)} tokens or fewer: ${pct(p)} of popular repos, ${pct(q)} of small and personal repos.`;
  }
  function draw() {
    const cs = curves(state.kind);
    s = svg('svg', { class: 'chart af-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', tabindex: 0,
      'aria-label': `Size of ${FILE_NAME[state.kind]} files. Share of repos with a file this size or smaller, log scale. Use the left and right arrow keys to read values.` });
    for (const y of [0, 0.25, 0.5, 0.75, 1]) {
      s.append(svg('line', { class: y ? 'grid' : 'axis', x1: L, x2: W - R, y1: ly(y), y2: ly(y) }), svg('text', { class: 'muted', x: L - 6, y: ly(y) + 4, 'text-anchor': 'end' }, `${y * 100}%`));
    }
    for (const x of [100, 1000, 10000]) {
      s.append(svg('line', { class: 'grid', x1: lx(x), x2: lx(x), y1: T, y2: H - B }), svg('text', { class: 'muted', x: lx(x), y: H - B + 16, 'text-anchor': 'middle' }, x.toLocaleString('en-US')));
    }
    s.append(svg('text', { class: 'muted', x: (L + W - R) / 2, y: H - 4, 'text-anchor': 'middle' }, 'tokens always loaded (log scale)'));
    for (const { c, tone, name } of cs) {
      const pts = c.tokens.map((t, i) => `${lx(Math.max(t, X0)).toFixed(1)},${ly(c.cum_share[i]).toFixed(1)}`);
      s.append(svg('polyline', { class: `af-line ${tone}`, points: pts.join(' '), fill: 'none' }));
      const last = c.cum_share[c.cum_share.length - 1];
      s.append(svg('text', { x: W - R + 6, y: ly(last) + (tone === 'orange' ? 14 : -4), class: tone === 'orange' ? 'af-end' : 'af-end grey' }, name));
    }
    mineG = svg('g', {}); hoverG = svg('g', {});
    s.append(mineG, hoverG);
    const fromEvent = (e) => {
      const r = s.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      return 10 ** (Math.log10(X0) + ((px - L) / (W - L - R)) * (Math.log10(X1) - Math.log10(X0)));
    };
    s.addEventListener('pointermove', (e) => { const f = fromEvent(e); if (f >= X0 && f <= X1) hoverAt(f); });
    s.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      hoverAt((state.hover || 1000) * (e.key === 'ArrowRight' ? 1.12 : 1 / 1.12));
    });
    box.replaceChildren(s);
    drawMine();
    if (state.hover) hoverAt(state.hover);
  }
  hub.on(() => { if (mineG) drawMine(); });
  read.textContent = 'Move over the chart, or focus it and use the arrow keys.';
  draw();
}

export function mountFills(root, example) {
  const { numbers } = example.data;
  const state = { kind: 'claude' };
  const out = el('div', { class: 'af-chart' });
  const tip = makeTip(root);
  root.replaceChildren(el('div', { class: 'controls one' }, segField('File type', 'af-fill-kind', state.kind, [{ value: 'claude', label: 'CLAUDE.md' }, { value: 'agents', label: 'AGENTS.md' }], (v) => { state.kind = v; draw(); })), out);
  const metrics = [['a8.overview.share_files', 'Files with an overview section'], ['a8.overview.token_share', 'Share of all tokens in overview sections'],
    ['a8.tree_dump.share_files', 'Files with a pasted directory tree'], ['a8.tree_dump.token_share', 'Share of all tokens in pasted trees']];
  function draw() {
    out.replaceChildren(...metrics.map(([m, title]) => el('div', { class: 'af-group' }, el('h3', {}, title),
      ['established', 'long_tail'].map((g) => {
        const n = numbers.numbers[`${state.kind}.${g}.${m}`];
        return barRow(tip, { label: GROUP_NAME[g], value: n.value, lo: n.ci_lo, hi: n.ci_hi, max: 0.6, text: pct(n.value), tone: g === 'established' ? 'orange' : 'grey',
          tipText: `${title}, ${GROUP_NAME[g]}: ${ciText(n)}.` });
      }))));
  }
  draw();
  root.append(el('p', { class: 'legend' }, 'Thin line on each bar: 95% interval.'));
}

export function mountInit(root, example) {
  const { numbers } = example.data;
  const state = { group: 'overall' };
  const out = el('div', { class: 'af-chart' });
  const tip = makeTip(root);
  const opts = ['overall', 'established', 'long_tail'].map((g) => ({ value: g, label: GROUP_NAME[g] }));
  root.replaceChildren(el('div', { class: 'controls one' }, segField('Repos', 'af-init-group', state.group, opts, (v) => { state.group = v; draw(); })), out);
  function draw() {
    const g = state.group, key = (s, m) => numbers.numbers[`claude.${g}.g.${s}.${m}`];
    const rows = [['Files with an overview section', 'overview.share_files', 1, pct], ['Share of all tokens in overview sections', 'overview.token_share', 0.6, pct]];
    const sig = numbers.numbers[`claude.${g}.g.sig.share`];
    const group = (title, metric, max) => el('div', { class: 'af-group' }, el('h3', {}, title),
      [['sig', 'Kept the /init line', 'orange'], ['nosig', 'Rewrote or removed it', 'grey']].map(([s, lab, tone]) => {
        const n = key(s, metric);
        return barRow(tip, { label: lab, value: n.value, lo: n.ci_lo, hi: n.ci_hi, max, text: pct(n.value), tone, tipText: `${title}, ${lab}: ${ciText(n)}.` });
      }));
    const med = ['sig', 'nosig'].map((s) => key(s, 'tokens.median'));
    out.replaceChildren(group(rows[0][0], rows[0][1], 1), group(rows[1][0], rows[1][1], 0.6),
      el('div', { class: 'af-group' }, el('h3', {}, 'Median size, in tokens'),
        [['Kept the /init line', med[0], 'orange'], ['Rewrote or removed it', med[1], 'grey']].map(([lab, n, tone]) =>
          barRow(tip, { label: lab, value: n.value, lo: n.ci_lo, hi: n.ci_hi, max: 2000, text: num(n.value), tone, tipText: `Median tokens, ${lab}: ${num(n.value)}, 95% interval ${num(n.ci_lo)} to ${num(n.ci_hi)}, from ${n.n.toLocaleString('en-US')} files.` }))),
      el('p', { class: 'legend' }, `${pct(sig.value)} of CLAUDE.md files in this group keep the line (found in the first ten non-empty lines). Thin line on each bar: 95% interval.`));
  }
  draw();
}

export function mountLinks(root, example) {
  const { numbers } = example.data;
  const tip = makeTip(root);
  const rows = ['established', 'long_tail', 'overall'];
  const out = el('div', { class: 'af-chart' });
  for (const g of rows) {
    const v = (k) => numbers.numbers[`repo.${g}.link.class.${k}`];
    const linked = numbers.numbers[`repo.${g}.link.linked_any`];
    const parts = [
      { name: 'linked', value: linked.value, tone: 'orange', tip: `${GROUP_NAME[g]}: ${ciText(linked)} link the two files (${LINK_PARTS.slice(0, 3).map(([k, l]) => `${l} ${pct(v(k).value)}`).join(', ')}).` },
      { name: 'near copy', value: v('near_copy').value, tone: 'tan', tip: `${GROUP_NAME[g]}: near copy ${ciText(v('near_copy'))}.` },
      { name: 'independent', value: v('independent').value, tone: 'grey', tip: `${GROUP_NAME[g]}: independent ${ciText(v('independent'))}.` },
    ];
    const bar = el('div', { class: 'af-stack' }, parts.map((p) => {
      const seg = el('div', { class: `af-seg ${p.tone}`, style: `width:${p.value * 100}%` }, el('span', {}, `${p.name} ${pct(p.value)}`));
      tip.attach(seg, p.tip);
      return seg;
    }));
    out.append(el('div', { class: 'af-group' }, el('h3', {}, `${GROUP_NAME[g]} · ${numbers.numbers[`repo.${g}.link.linked_any`].n.toLocaleString('en-US')} repos with both files`), bar));
  }
  root.replaceChildren(out, el('p', { class: 'legend' }, 'Linked means a symlink, an @import, or a line in one file that points to the other.'));
}

export function mountHooks(root, example) {
  const { numbers } = example.data;
  const state = { group: 'overall' };
  const out = el('div', { class: 'af-chart' });
  const tip = makeTip(root);
  const opts = ['overall', 'established', 'long_tail'].map((g) => ({ value: g, label: GROUP_NAME[g] }));
  root.replaceChildren(el('div', { class: 'controls one' }, segField('Repos', 'af-hook-group', state.group, opts, (v) => { state.group = v; draw(); })), out);
  function draw() {
    const g = state.group, any = numbers.numbers[`repo.${g}.h.any.share_of_repos`];
    const rows = HOOK_EVENTS.map((e) => [e, numbers.numbers[`repo.${g}.h.ev.${e}.share_of_repos_with_hooks`]]).sort((a, b) => b[1].value - a[1].value);
    out.replaceChildren(el('p', { class: 'af-note' }, `Only ${pct(any.value, 1)} of repos commit a hook. Shares below are among those repos (${rows[0][1].n.toLocaleString('en-US')}), so each one is a share of repos with hooks, not of all repos.`),
      ...rows.map(([e, n]) => barRow(tip, { label: e, value: n.value, lo: n.ci_lo, hi: n.ci_hi, max: 0.7, text: pct(n.value), tone: 'orange',
        tipText: `${e}: ${pct(n.value, 1)} of repos with hooks, 95% interval ${pct(n.ci_lo, 1)} to ${pct(n.ci_hi, 1)}, from ${n.n.toLocaleString('en-US')} repos.` })));
  }
  draw();
}

export function mountCommands(root, example) {
  const { top_commands: top } = example.data;
  const names = Object.keys(top);
  const state = { tool: names[0] };
  const out = el('div', { class: 'af-chart' });
  const tip = makeTip(root);
  const sel = el('select', { id: 'af-tool', onchange: (e) => { state.tool = e.target.value; draw(); } }, names.map((n) => el('option', { value: n }, n)));
  root.replaceChildren(el('div', { class: 'controls one' }, el('div', { class: 'seg-field' }, el('label', { for: 'af-tool' }, 'Toolchain'), sel)), out);
  function draw() {
    const t = top[state.tool];
    out.replaceChildren(el('p', { class: 'af-note' }, `Among ${t.n_repos.toLocaleString('en-US')} repos in this group, the share naming each command.`),
      ...t.top.map((c) => barRow(tip, { label: c.cmd, value: c.share_weighted, max: Math.max(...t.top.map((x) => x.share_weighted)) * 1.05, text: pct(c.share_weighted), tone: 'orange',
        tipText: `${c.cmd}: ${pct(c.share_weighted, 1)} of repos in this group (weighted); ${c.n_repos.toLocaleString('en-US')} repos in the sample.` })));
  }
  draw();
}
