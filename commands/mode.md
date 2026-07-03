---
description: "Activate binote-first mode: read .binote/ notes before source code. Auto-loads binote context when user references file paths. Use at conversation start. Triggers on: '/binote:mode'."
---

# Binote — Binote-First Mode

From this point forward in the conversation, follow these rules:

## Core Rule

**Always read the `.binote/` note before reading a source file.**

When the user mentions or references a file path (e.g. `@src/core/scanner.ts`, `src/core/scanner.ts`, or just "the scanner module"):

1. Call `read_note(notePath: "<path>.md", forwardDepth: 1)` first — pulls the note in full plus each [[link]] target as a compact excerpt
2. If the path is a directory, use `read_note(notePath: "<path>/_dir.md", forwardDepth: 1)`
3. Only then read the actual source file if the binote note doesn't have enough context
4. To go deeper on one linked note, issue a follow-up `read_note` of that path (excerpts carry a `links:` nav line); avoid `detail: "full"` unless you truly need every body inline

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
