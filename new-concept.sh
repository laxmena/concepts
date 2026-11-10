#!/usr/bin/env bash
# Usage: ./new-concept.sh <slug> "<title>" ["<one-sentence idea>"] ["<area>"]
set -euo pipefail
cd "$(dirname "$0")"

slug="${1:-}"; title="${2:-}"; idea="${3:-TODO: the idea in one sentence.}"; area="${4:-Uncategorised}"
if [[ -z "$slug" || -z "$title" ]]; then echo "usage: $0 <slug> \"<title>\" [\"idea\"] [\"area\"]" >&2; exit 2; fi
if [[ ! "$slug" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then echo "slug must be lowercase letters, digits and hyphens" >&2; exit 2; fi
dir="concepts/$slug"
if [[ -e "$dir" ]]; then echo "$dir already exists" >&2; exit 1; fi

mkdir -p "$dir"
export SLUG="$slug" TITLE="$title" IDEA="$idea" AREA="$area"
node --input-type=module -e '
import { readFileSync, writeFileSync } from "node:fs";
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const { SLUG, TITLE, IDEA, AREA } = process.env;
const html = readFileSync("shared/template.html", "utf8")
  .replaceAll("{{slug}}", SLUG).replaceAll("{{title}}", esc(TITLE)).replaceAll("{{idea}}", esc(IDEA));
writeFileSync(`concepts/${SLUG}/index.html`, html);
const m = JSON.parse(readFileSync("concepts.json", "utf8"));
m.concepts.push({ slug: SLUG, title: TITLE, idea: IDEA, area: AREA, posts: [], added: new Date().toISOString().slice(0, 10), reviewed: new Date().toISOString().slice(0, 10) });
writeFileSync("concepts.json", JSON.stringify(m, null, 2) + "\n");
'
cat > "$dir/example.json" <<'JSON'
{
}
JSON
cat > "$dir/widget.js" <<'JS'
// Core maths as pure, exported functions. mount() only draws.
import { el } from '../../shared/lib.js';

export function mount(root, example) {
  root.replaceChildren(el('p', {}, 'TODO: build the widget.'));
}
JS
cat > "$dir/widget.test.js" <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
// import { ... } from './widget.js';

test('TODO: test the maths against values worked out independently', () => {
  assert.ok(false, 'write this test before the widget');
});
JS
echo "Created $dir and added it to concepts.json. Next: write the page, the maths and the tests (see AGENTS.md)."
