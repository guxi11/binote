---
description: "Activate binote-first mode: read .binote/ notes before source code. Auto-loads binote context when user references file paths. Use at conversation start. Triggers on: '/binote:mode'."
---

# Binote — Binote-First Mode

From this point forward in the conversation, follow these rules:

## Core Rule

**Always read the `.binote/` note before reading a source file.**

When the user mentions or references a file path (e.g. `@src/core/scanner.ts`, `src/core/scanner.ts`, or just "the scanner module"):

1. Call `read_note(notePath: "<path>.md", depth: 1)` first — this returns the note plus all linked and backlinked notes in one call
2. If the path is a directory, use `read_note(notePath: "<path>/_dir.md", depth: 1)`
3. Only then read the actual source file if the binote note doesn't have enough context

If the binote note is empty, read the source file directly.

## On Activation

Right now, do this — and **only** this. Do not glob, do not read any other files:

1. Read `.binote/_dir.md` (project root overview)
2. Read `.binote/_index.json` (link graph)
3. Report status in **one line**:
   - If `_dir.md` is empty or `_index.json` is nearly empty → say "binote-first mode active · notes not yet populated, use `/binote:save` after working to build context"
   - Otherwise → say "binote-first mode active · N nodes in graph" plus one short sentence on what the project is about

No raw dumps. No file-by-file summaries. No reading directory `_dir.md` files upfront — those load on-demand.

Directory and file notes are loaded **on-demand** when the user references them — not upfront.

## Reference

- `_dir.md` = directory overview
- `file.ts.md` = file-level notes
- `_notes/*.md` = standalone concept notes
- `_index.json` = full bidirectional link graph
- `[[target]]` = wiki-style link, resolve via `_index.json`
