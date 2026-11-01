# Style guide

How every page on concepts.laxmena.com looks, reads and behaves. The BM25 page (`concepts/bm25/`) is the reference.
Rules come first, then the parts. `shared/style.css` and `shared/lib.js` hold the code. Do not restyle a page by hand; change the shared file.

## 1. The test every page must pass
- A reader who knows nothing gets the idea in about one minute, mostly from the picture.
- The first screen has the title, the idea as 3 to 4 short bullets, one instruction, and the working picture.
- The picture and its controls fit in one screen (1280x720 and 390x844) with no scrolling. Measure it: `npm run e2e`.
  Exception: a ranked list of ten rows cannot fit a phone. On laptops it must still fit; on phones it may scroll (`--phone-may-scroll`).
- Words are simple. If a hard word is needed, explain it where it first appears.

## 2. Colour
| Role | Light | Dark | Use |
| --- | --- | --- | --- |
| Page | `#faf8f4` | `#151514` | background |
| Card | `#ffffff` | `#1e1e1c` | cards, inputs |
| Ink | `#1d1d1b` | `#ecebe5` | text, controls, rules |
| Ink 2 | `#5a574f` | `#a9a69d` | secondary text, outlines |
| Line | `#ddd8cc` | `#373632` | thin dividers, card borders |
| Square | `#b9b2a1` | `#6b6a63` | the word squares that show length |
| **Orange** | `#eb6834` | same | the thing being explained: scores, matching words, coins |
| **Blue** | `#2a78d6` | same | the comparison, and only the comparison |

- Orange and blue are for fills, bars and marks. Never set body text in them (orange on cream is only about 3:1).
- Text on an orange fill is ink `#1d1d1b` in both modes.
- Controls (sliders, checkboxes, buttons, focus rings aside) are ink. Focus ring is blue, 2px.
- Colour is never the only signal. Every coloured mark also has a number, a word or a tag next to it.
- No gradients, no decorative shadows, no emoji, no stock icons.

## 3. Type
System font stack only. Sizes: title 2.75rem (1.75rem on phones), section heading 1.625rem, body 1.125rem (1rem on phones),
card text 1rem, small labels 0.875rem, scores in the monospace stack at 1.375rem. Text column about 70 characters; the picture uses the full width.
Sections are separated by white space (4rem above a heading), not by lines. The only lines are card borders, table rules and the footer rule.

## 4. Layout
- Page width 72rem. On screens 64rem and wider the top is two columns: idea and instruction on the left (20rem), the picture on the right.
- Below that, one column. Cards stay two per row, even on a phone, with smaller type.
- Four items to compare: a 2x2 grid of cards. Strips reserve two rows so bars line up across cards.
- Boxes: only cards have borders. Do not put a panel around the whole widget.
- Extra detail (edit the data, the numbers behind the bars, the formula) goes inside `<details>`, closed by default.

## 5. Picture vocabulary
Reuse these meanings on every page so a reader learns them once.
| Mark | Meaning |
| --- | --- |
| Grey square | one word of a document (a row of squares shows its length) |
| Orange tile with the word | a word that matches the search |
| Orange bar, split by thin lines | a score, one piece per search word; the outline is the most it could be |
| Orange coin (circle) | how much something is worth; bigger means worth more |
| Blue bar | the plain comparison (for example a simple word count) |
| Tag "never read" | the item was skipped entirely |
| Big mono number at the right | the exact value, always shown next to its bar |
| Dashed line, dimmed rows | the cut-off: rows below it do not count |
| Dashed square with "?" | a value nobody has supplied (for example an ungraded result) |

## 6. Parts (in `shared/`)
- `lib.js`: `slider`, `editableList`, `sortableList` (drag a handle or use arrow keys), `segmented` (radio group drawn as buttons), `initReveals`,
  `barChart`, `stackedBar({ segments, max, ghost, color })`, `meter` (HTML bar), `el`, `svg`.
  `lib.js` and `widget.js` must not touch `document` at import time, so Node tests can import them.
- Classes: `.hero`, `.hero-text`, `.lede-list`, `.try-this`, `.eyebrow`, `.widget`, `.controls`, `.slider`, `.toggles`, `.check`,
  `.cards`, `.card`, `.strip`, `.sq`, `.tile.match`, `.score-line`, `.num`, `.story`, `.legend`, `.lessons`, `.lesson`, `.caption`, `.mini`,
  `.qa`, `.reveal`, `.refs`, `.table-wrap`, `.rank-row`, `.handle`, `.segmented`, `.meter`, `.stats`, `.systems`, `.gtile`.
- Start a page from `shared/template.html` with `./new-concept.sh`.

## 7. Page order (fixed)
1. Title, idea as 3 to 4 short bullets (full sentences, one idea each), one "Try this" instruction.
2. Try it: the picture, working on first load with a good default.
3. What just happened: about three small pictures, one per rule, each with one short sentence. The rules follow the sliders where they can.
4. Where you meet it (optional): one concrete example and 3 to 4 real uses, each checked against the product's own docs.
5. Where it breaks: the blind spot, shown live.
6. Check yourself: 2 to 3 questions with hidden answers.
7. Used in: links to the author's posts (read from `concepts.json`).
8. Go deeper: 2 to 3 primary sources. Open every URL once to check it.
9. Footer: last reviewed date and a source link.
Link the newsletter at `https://internals.laxmena.com`. Do not link the author's personal site.

## 8. Writing
- Plain words, short sentences, varied length. Concrete example before any formula. Feynman style: one everyday picture, then the rules, each tied to something visible.
- Every card gets one plain sentence that says why it looks the way it does. Generate it from the numbers so it stays true when inputs change.
- Quote numbers in prose with `data-bind` from a facts function, so text cannot drift from the maths.
- Avoid: "it's not X, it's Y"; "Not X. Not Y. Just Z."; stacks of one-line fragments for emphasis; bold-first bullets; "Here's the thing";
  announced counts ("three reasons"); a closing paragraph that repeats the page. First person only where the author gives an opinion; never invent one.
- Home page: the title as a link, grouped by area, nothing else in the list.

## 9. Accessibility
- Every control has a visible `<label>` (or an `aria-label` where the label is hidden on phones).
- Everything works by keyboard. Sliders are native range inputs. Toggles are native checkboxes. Reveal boxes use `aria-expanded`.
- Charts are `role="img"` with an `aria-label` that states the values. Do not reuse a form control's label text for a chart.
- Works at 390px wide, with light and dark mode, with no horizontal page scroll. Wide tables sit in a focusable scroll region.
- No cookies, no third-party requests, no external fonts. The page works offline once loaded (service worker).

## 10. Checks before you finish a page
1. `npm test` (maths against independent values) and `npm run links`.
2. `npm run serve`, then `npm run e2e` (needs Chrome and `npm i --no-save playwright`): cards fit the first screen, no sideways scroll, no console errors, light and dark.
3. Look at the screenshots yourself (`node scripts/e2e/fit.mjs <slug> --shots <dir>`), at laptop and phone size. Tests cannot tell you that something looks bad.
4. Update `concepts.json` (`reviewed` date) and `CHANGELOG.md`.
