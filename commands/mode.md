---
description: "Activate binote-first mode: read .binote/ notes before source code. Auto-loads binote context when user references file paths. Use at conversation start. Triggers on: '/binote:mode'."
---

# Binote — Binote-First Mode

From this point forward in the conversation, follow these rules:

## Core Rule

**Search to locate, read the note on demand (default `forwardDepth: 0`), then read source.** Do not reflexively pull the link graph for every file — `forwardDepth: 1` on a hub note costs ~28K tokens and is the biggest context sink.

When the user mentions or references a file path (e.g. `@src/core/scanner.ts`, `src/core/scanner.ts`, or just "the scanner module"):

1. **To find the right note when the path is fuzzy or the topic spans files**, call `search` first — it is hybrid (BM25 + local semantic embeddings, RRF-fused), so it matches by meaning. One ranked query beats a fan-out of speculative reads.
2. Call `read_note(notePath: "<path>.md")` — **`forwardDepth: 0` by default**, the note body only.
3. When `search` surfaced a big note (mirrors of large source files run 80–90K chars) and its hit carried a `heading`, close the loop: `read_note(notePath: "<path>.md", section: "<that heading>")` returns just that section (+ the note's leading preamble + its `links:` line) instead of the whole body. Pass an array of headings for the top-k hits. Only engages on a bare read of a note ≥4K chars; an unknown heading degrades to the full note. This aligns read granularity with recall granularity — don't pay for the whole mountain when `search` pinned one seam.
4. Escalate to `read_note(notePath: "<path>.md", forwardDepth: 1)` **only** when entering an unfamiliar subsystem where you need the neighborhood (root in full + each [[link]] as an excerpt). Directories → `read_note(notePath: "<path>/_dir.md", forwardDepth: 1)`.
5. To go deeper on one linked note, issue a follow-up `read_note` of that path (excerpts carry a `links:` nav line); avoid `detail: "full"` unless you truly need every body inline.
6. A file you already understand, or a trivial one-line change: read source directly.

**`backDepth` is opt-in.** Set `backDepth: 1` when answering "who depends on / references this note?". Default 0. (_audit reports are excluded from the link graph, so backlinks are clean.)

**Heed `staleness`.** Each node may carry `staleness: { level, hint }` when source has drifted from the note. If `level` is `warning` or `stale`, treat the note as a hint, not authority — verify against source before relying on it.

If the binote note is empty, read the source file directly.

## On Activation

Right now, do this — and **only** this. Do not glob, do not read any other files:

1. Call `read_note` with `notePaths: ["_constitution.md", "_dir.md"]`, `forwardDepth: 0` — pulls project-wide invariants + root overview in one call.
2. Call `list_notes` for the graph size (do NOT read `_index.json` raw — it is an implementation artifact and a context hog).
3. Report status in **one line**:
   - If `_constitution.md` is empty → say "binote-first mode active · ⚠️ no constitution — run `/binote:save` and extract invariants to `_constitution.md`"
   - Else if `_dir.md` is empty or the note count is tiny → say "binote-first mode active · constitution loaded, notes thin — use `/binote:save` after working to build context"
   - Otherwise → say "binote-first mode active · N nodes in graph · constitution: N invariants" plus one short sentence on what the project is about

The constitution is **always loaded** at activation, regardless of token cost — it's the project's bedrock and outranks `_design/` + source on conflict. Everything else loads on-demand.

No raw dumps. No file-by-file summaries. No reading directory `_dir.md` files upfront — those load on-demand.

## Reference

- `_constitution.md` = **project-wide invariants** (highest authority). Loaded on activation; consult before any non-trivial change.
- `_design/*.md` = **module design authority** — intended architecture, module contracts. Outranks file notes / ADRs; outranked by `_constitution.md`.
- `_features/<NNN-slug>/` = **in-flight feature workspace** — spec.md / plan.md / tasks.md / audit.md. Scaffold with `/binote:feature`.
- `_dir.md` = directory overview
- `file.ts.md` = file-level notes
- `_notes/*.md` = standalone concept notes / ADRs
- `_audit/<date>/*.md` = historical snapshots (non-authoritative; excluded from the link graph)
- `_index.json` = derived bidirectional link graph (regenerable; never read raw)
- `[[target]]` = wiki-style link, resolved by `read_note` with fuzzy fallback
