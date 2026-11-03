# Changelog

## Unreleased

- Evals series, twelve pages, each with a live "where it breaks" widget, tests against independently computed values, and sources opened and checked: the map of evals; error bars and sample size (Miller 2024); exact match and F1 (SQuAD); precision, recall and reciprocal rank; pass@k (Chen et al. 2021); LLM as judge (Zheng et al. 2023, real counts of 80 questions); pairwise votes, Elo and Bradley-Terry (Chiang et al. 2024); human agreement and kappa; RAG evals (RAGAS); agent evals and pass^k (tau-bench); online evals and peeking; contamination and Goodhart (GSM1k).
- Shared: `shared/stats.js` (normal quantile, Wilson interval, seeded random numbers), `radios` helper, tile grids, `[hidden]` rule, phone helper classes. `scripts/e2e/evals.mjs` smoke-tests every page of the series; `fit.mjs` ignores cards in a closed `<details>`.
- Manifest order: the map first, then a reading order. Eval pages link to the map in the header.
- Every page has a one-line "what it is" under the title (`.what`), also in the template and STYLE.md.
- White theme only: white page, faintly warm cards, brown ink. Dark mode removed on purpose.
- Warmer theme: cream page, brown ink, softer orange and blue, warm brown dark mode, rounded cards, inputs and pill buttons, a darker focus ring (`--focus`). Roles are unchanged (orange explains, blue compares). AGENTS.md and STYLE.md updated.
- BM25 page, friendlier: cards show the real text with matching words highlighted (phones keep the word squares), cards are ranked best first with a #1 to #4 tag, search box and the two toggles share one row so the cards still fit 1280x720, "Try your own documents" replaces "Change the documents". Empty "Used in" section is hidden. Tests for `splitText` and `rankOrder`.
- Page: bi-encoder vs cross-encoder. Side-by-side diagram, N slider (10 to 1,000,000), "Run a search" simulation with running totals, log-scale time bars, retrieve-and-rerank demo. No model runs; unit costs are made up and labelled. Tests worked by hand, including 10,000 sentences = 49,995,000 pairs (Sentence-BERT paper: about 50 million).
- Page: nDCG@k. Ten draggable results with grades, live DCG / best possible / nDCG, a k slider with a cut-off line, three small pictures, and the incomplete-judgments demo. Tests worked by hand, including the textbook example (nDCG6 = 0.961).
- Shared helpers: `sortableList`, `segmented`, `meter`.
- Shared layer: stylesheet, page template, helpers (DOM, slider, reveal, bar charts, editable list), offline service worker.
- BM25 page, picture first: a 2x2 grid of cards (word squares, score bar split by search word, one plain sentence each), optional plain-count bar, index lookup view, "never read" tag. Fits one screen on laptop and phone. Tables and formula are folded away. Tests checked against bm25s 0.3.16.
- "What just happened" is three small pictures (coins for rarity, a bar cut into shrinking pieces for repeats, one match in a short and a long text); the last two follow the k1 and b sliders.
- STYLE.md (colour roles, type, layout, picture vocabulary, writing, accessibility, checks). Browser checks in `scripts/e2e/` (`npm run e2e`). Blue now marks the comparison in the length picture; word squares darker.
- Home page lists titles only.
- Home page built from `concepts.json`; `new-concept.sh`; CI with tests, link check and Pages deploy.
