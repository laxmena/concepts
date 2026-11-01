# Changelog

## Unreleased

- Shared layer: stylesheet, page template, helpers (DOM, slider, reveal, bar charts, editable list), offline service worker.
- BM25 page, picture first: a 2x2 grid of cards (word squares, score bar split by search word, one plain sentence each), optional plain-count bar, index lookup view, "never read" tag. Fits one screen on laptop and phone. Tables and formula are folded away. Tests checked against bm25s 0.3.16.
- "What just happened" is three small pictures (coins for rarity, a bar cut into shrinking pieces for repeats, one match in a short and a long text); the last two follow the k1 and b sliders.
- STYLE.md (colour roles, type, layout, picture vocabulary, writing, accessibility, checks). Browser checks in `scripts/e2e/` (`npm run e2e`). Blue now marks the comparison in the length picture; word squares darker.
- Home page lists titles only.
- Home page built from `concepts.json`; `new-concept.sh`; CI with tests, link check and Pages deploy.
