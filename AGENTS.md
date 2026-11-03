# AGENTS.md

Interactive explainers for computer science and engineering concepts, served at concepts.laxmena.com (GitHub Pages, `CNAME` in the root).
The first pages are search, ML and evals; the scope is wider (systems, human factors, anything an engineer meets).
Link to the newsletter at https://internals.laxmena.com where a page relates to a post (the "Used in" list). Not every page does.
Do not link the author's personal site.
One concept per page, understood by interacting with it. Readers: senior and principal engineers, and the author as a
reference. No fluff. Priorities, in order: correct, clear, durable, then pretty.

Look, writing and checks live in [STYLE.md](STYLE.md). Read it before building or changing a page.

## Rules for every page
- Picture first. A reader should get the idea in about one minute, mostly from the visual.
- The first screen has the title, the idea as 3 to 4 short bullets (each a full sentence, no commas chaining ideas), the visual working on a good default, and one instruction ("Drag b to 0").
  Check this by reading only the first screen.
- No scrolling inside the idea. The widget (controls and every card or part the reader must compare) fits in one screen
  at 1280x720 and 390x844. Use cards in a 2x2 grid for four items. Measure it; do not guess.
- Explain like Feynman: one everyday picture (a judge giving points, a queue, a library), then the rules in plain words,
  each tied to something visible. Each card gets one plain sentence that says why it looks the way it does.
- Label things on the picture itself. Colour is never the only signal: add text, a tag, or a number.
- Tables, formulas and long text go in `<details>` below the picture. Keep them short.
- Use simple words, in the page, the UI labels and these docs. If a hard word is needed, explain it next to where it first appears.

## Constraints
- Plain HTML, CSS and ES-module JavaScript. No framework. No build step to view a page.
- Pages are fetched over HTTP (`example.json`, `concepts.json`), so view them with `npm run serve` (port 8000), not `file://`.
- Any library is vendored in `vendor/<name>-<version>/` with its licence; list it in `vendor/README.md`. None so far.
- Offline once loaded: `sw.js` caches same-origin GETs but fetches from the network first (revalidating, so a deploy shows on the next load) and uses the cache only when offline. Do not add third-party requests. The one exception is Google Analytics (`shared/analytics.js`), which loads only after the reader allows it and never on localhost.
- No cookies, trackers or external fonts, except Google Analytics page views behind a consent banner. The measurement ID is in `shared/analytics.js`.
- Accessible: every control has a `<label>`, widgets work by keyboard, colour is never the only signal (print values, add text), usable at phone width. White theme only; there is no dark mode.

## Layout
- `concepts/<slug>/`: `index.html`, `widget.js`, `example.json`, `widget.test.js`.
- `widget.js` exports the core maths as pure functions (no DOM, no globals) plus `mount(root, example)`.
  Tests import only the pure functions. `shared/lib.js` and `widget.js` must not touch `document` at import time.
- `shared/style.css` (the only stylesheet), `shared/template.html`, `shared/lib.js` (helpers), `shared/boot.js`, `shared/home.js`.
- `concepts.json` is the manifest: `slug, title, idea, area, posts[{title,url}], reviewed (YYYY-MM-DD)`, and optionally `start: true` for the first page of a series.
  The home page, each page's "Used in" list and its footer date all read from it. Only list pages that exist.
- Helpers in `shared/lib.js`: `el`, `svg`, `slider`, `radios`, `segmented`, `initReveals` (declarative `.reveal` boxes), `barChart`, `stackedBar` (one bar in pieces, plus a thin blue comparison bar), `meter`, `editableList`.
  `shared/stats.js` has the maths several pages share (normal quantile and CDF, Wilson interval, seeded random numbers, `chooseRatio`).
  `sortableList` is the draggable list: drag a row's handle, or focus it and press the arrow keys. Rows are built once and updated in place.
- `scripts/check-links.mjs`: local links and manifest check; `--external` also fetches external links.

## Pages that show a blind spot live
`mount(root, example)` may draw two ways. The page script calls it once for `#widget` and once for `#breaks-widget` with `{ ...example, breaksView: true }`, and the widget draws the blind-spot view from `example.breaks`. The evals series (start at `concepts/evals-map/`) uses this on every page. Do not spread `example.breaks` over the example.

## Adding a page
1. `./new-concept.sh <slug> "<title>" "<one-sentence idea>" "<area>"`
2. Write the maths first in `widget.js` as pure functions; write `widget.test.js` against values worked out
   independently (by hand, or from a reference library, with the library and version named in the test).
3. Build `mount()`. Default example must work on first load. Put the default state in `example.json`.
4. Fill the page sections. Quote numbers in prose with `<span data-bind="key">` and compute them in an exported
   facts function (see `defaultFacts` in `concepts/bm25/widget.js`) so prose cannot drift from the maths.
5. `npm test && npm run links`, view it with `npm run serve` at phone width, update `CHANGELOG.md`. For the evals series add the slug to `scripts/e2e/evals.mjs` and to the map in `concepts/evals-map/example.json`.

## Page order (fixed)
Title and the idea in one sentence; Try it (widget, good default, one instruction); Predict first (optional, skip it when the instruction does the same job); What just happened
(3 short steps, each tied to something on the picture); Where you meet it (optional: one concrete example and 3 to 4 real uses, each verified against the product docs); Where it breaks (the blind spot, shown live); Check yourself (2 to 3
questions with hidden answers); Used in; Go deeper (2 to 3 primary sources, verify each URL); footer with last-reviewed date and source link.
Give a concrete example before any formula.

## Design
White background, faintly warm cards, warm brown ink. Orange `#f0833a` marks the thing being explained, blue `#5b9bd0` the comparison, warm tans for everything else.
System font stack. Text column about 70ch, widgets full width. Thin lines, soft rounded corners, direct labels. No gradients, decorative shadows, emoji or stock icons.
Orange and blue are for fills and rules; set text in the ink colour. The home page is a plain list grouped by area: the title as a link, nothing else. An area with a `start` page is a series: that page first with a "Start here" tag, the rest numbered in reading order.

## Writing
Plain words, sentences of varied length. First person only where the author gives an opinion; do not invent opinions.
Avoid: "it's not X, it's Y"; "Not X. Not Y. Just Z."; stacked one-line fragments for emphasis; bold-first bullets;
"Here's the thing"; announced counts ("three reasons"); a closing paragraph restating the page.

## CI
`.github/workflows/ci.yml`: on every push, `npm test` (Node's built-in runner) and the external link check; on `main`, deploy to Pages.
