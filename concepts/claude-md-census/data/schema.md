# site-data schema

Built by `src/neri/sitebundle.py` from the weighted analysis. **Aggregates only: no third-party text, no repo names, no file paths.**
Snapshot 2026-11-15. Shares are 0-1 fractions. Groups: `established` = popular repos (10+ stars), `long_tail` = small & personal repos
(0-9 stars), `overall` = weighted population. All estimates are population-weighted unless named `unweighted`.

## numbers.json
- `generated`, `bootstrap` (1000 resamples), `definitions.overall` / `definitions.strata` (text).
- `totals`: `snapshot_date`; `n_files_total` (= `n_claude_files` + `n_agents_files`); `n_repos_overall`; `n_repos_popular`,
  `n_repos_small_personal`; per-group file counts (`n_claude_files_popular`, `n_agents_files_small_personal`, ...);
  `population_popular_repos`, `population_small_personal_repos` (eligible repos measured).
- `numbers`: key -> `{value, ci_lo, ci_hi, n, unweighted, low_n}` (95% bootstrap interval clustered by repo; `n` = files or repos in the
  cell; `low_n` true when n < 100). Keys are `<file>.<group>.<metric>` with `file` in {claude, agents, repo}:
  - `{claude,agents}.<group>.a8.overview.share_files` / `.token_share`: share of files with an overview-type section; share of all tokens in such sections.
  - `{claude,agents}.<group>.a8.tree_dump.share_files` / `.token_share`: same for pasted directory trees.
  - `{claude,agents}.<group>.a1.always_loaded_tokens.median` / `.p90`, `a1.lines.median`: size (o200k_base tokens, a proxy for Claude's tokenizer).
  - `claude.<group>.g.sig.share`: share of CLAUDE.md files containing the stock `/init` opening sentence in the first ten non-empty lines (a text match).
  - `claude.<group>.g.{sig,nosig}.{overview.share_files, overview.token_share, tokens.median}`: the same measures for files with (`sig`) and without (`nosig`) it.
  - `repo.<group>.link.class.{symlink,import_bridge,prose_pointer,near_copy,independent}` and `repo.<group>.link.linked_any` (= symlink + import_bridge + prose_pointer):
    link classes among repos with both CLAUDE.md and AGENTS.md.
  - `repo.<group>.h.any.share_of_repos` (repos committing at least one command hook) and `repo.<group>.h.ev.<Event>.share_of_repos_with_hooks`
    (share of repos with hooks that use each hook event). Purpose classes are intentionally not included.
  - `repo.overall.stack.has_{agents,claude}_md`, `repo.overall.pop.small_personal_share`: presence shares; share of repos with fewer than 10 stars.

## ecdf.json
`files.{claude,agents}.{established,long_tail,overall}` = `{n, tokens[], cum_share[]}`: weighted ECDF of always-loaded tokens (root file plus
`@imports`; repos with only nested files excluded), at most 200 points per curve. `cum_share[i]` is the weighted share of repos whose file has
`tokens[i]` tokens or fewer.

## percentiles.json
`files.{claude,agents}.<group>.<toolchain|all>.{lines, always_loaded_tokens}` = `{n, p1 ... p99}` weighted percentiles (cells with n < 30 omitted;
`all` = every toolchain; others are npm, pnpm, yarn, bun, uv, poetry, cargo, go, ...). `note` explains exclusions.

## calibration.json
Characters per token of the primary CLAUDE.md of each repo (o200k_base): `weighted` and `unweighted` `{p25, median, p75}`, `n`. For the browser estimate,
tokens ~ ceil(characters / median); the interquartile range gives the uncertainty. It is a proxy tokenizer, not Claude's.

## top_commands.json
Per toolchain group (npm / pnpm / yarn, Python (uv, poetry, pip), Rust (cargo), Go, make / just only): `n_repos` (repos in the group) and `top`
= 10 normalized commands (e.g. `npm:test`; no command text) with `share_weighted` (weighted share of repos in the group naming the command) and `n_repos` (unweighted count).

## Figure tables (`fig*.csv`)
The data behind each chart in `figures/post/`. `group` = Popular repos (10+ stars) / Small & personal repos (0-9 stars); `value` or `share`; `ci_lo`, `ci_hi`; `n`; `low_n`.
`fig0_population` (files found per name; share of small repos), `fig1_size_ecdf` (ECDF points), `fig2_structure`, `fig3_ecosystem`, `fig4_stack_size` (files per repo; link classes),
`fig5_what_fills_the_file`, `fig6_top_commands`, `fig7_generator` (with vs without the stock line), `fig_hero_anatomy` (values drawn in the anatomy card).
