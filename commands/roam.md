---
description: "Activate roam-first mode: read .roam/ notes before source code. Auto-loads roam context when user references file paths. Use at conversation start. Triggers on: '/roammem:roam'."
---

# RoamMem — Roam-First Mode

From this point forward in the conversation, follow these rules:

## Core Rule

**Always read the `.roam/` note before reading a source file.**

When the user mentions or references a file path (e.g. `@src/core/scanner.ts`, `src/core/scanner.ts`, or just "the scanner module"):

1. Read `.roam/<path>.md` first (e.g. `.roam/src/core/scanner.ts.md`)
2. If the path is a directory, read `.roam/<path>/_dir.md`
3. Follow any `[[links]]` in the note that are relevant to the user's question
4. Only then read the actual source file if the roam note doesn't have enough context

If the roam note is empty or skeleton-only, read the source file directly and mention that `/roammem:gen` can populate it.

## On Activation

Right now, do this — and **only** this. Do not glob, do not read any other files:

1. Read `.roam/_dir.md` (project root overview)
2. Read `.roam/_index.json` (link graph)
3. Report status in **one line**:
   - If `_dir.md` is a skeleton (empty sections) or `_index.json` is nearly empty → say "roam-first mode active · notes not initialized, run `/roammem:gen` to populate"
   - Otherwise → say "roam-first mode active · N nodes in graph" plus one short sentence on what the project is about

No raw dumps. No file-by-file summaries. No reading directory `_dir.md` files upfront — those load on-demand.

Directory and file notes are loaded **on-demand** when the user references them — not upfront.

## Reference

- `_dir.md` = directory overview
- `file.ts.md` = file-level notes
- `_notes/*.md` = standalone concept notes
- `_index.json` = full bidirectional link graph
- `[[target]]` = wiki-style link, resolve via `_index.json`
