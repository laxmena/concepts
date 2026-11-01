# Changelog

## Unreleased

- Page: bi-encoder vs cross-encoder. Side-by-side diagram, N slider (10 to 1,000,000), "Run a search" simulation with running totals, log-scale time bars, retrieve-and-rerank demo. No model runs; unit costs are made up and labelled. Tests worked by hand, including 10,000 sentences = 49,995,000 pairs (Sentence-BERT paper: about 50 million).
- Page: nDCG@k. Ten draggable results with grades, live DCG / best possible / nDCG, a k slider with a cut-off line, three small pictures, and the incomplete-judgments demo. Tests worked by hand, including the textbook example (nDCG6 = 0.961).
- Shared helpers: `sortableList`, `segmented`, `meter`.
- Shared layer: stylesheet, page template, helpers (DOM, slider, reveal, bar charts, editable list), offline service worker.
- BM25 page, picture first: a 2x2 grid of cards (word squares, score bar split by search word, one plain sentence each), optional plain-count bar, index lookup view, "never read" tag. Fits one screen on laptop and phone. Tables and formula are folded away. Tests checked against bm25s 0.3.16.
- "What just happened" is three small pictures (coins for rarity, a bar cut into shrinking pieces for repeats, one match in a short and a long text); the last two follow the k1 and b sliders.
- STYLE.md (colour roles, type, layout, picture vocabulary, writing, accessibility, checks). Browser checks in `scripts/e2e/` (`npm run e2e`). Blue now marks the comparison in the length picture; word squares darker.
- Home page lists titles only.
- Home page built from `concepts.json`; `new-concept.sh`; CI with tests, link check and Pages deploy.
