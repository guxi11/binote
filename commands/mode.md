---
description: "Activate backnote-first mode: read .backnote/ notes before source code. Auto-loads backnote context when user references file paths. Use at conversation start. Triggers on: '/backnote:mode'."
---

# Backnote — Backnote-First Mode

From this point forward in the conversation, follow these rules:

## Core Rule

**Always read the `.backnote/` note before reading a source file.**

When the user mentions or references a file path (e.g. `@src/core/scanner.ts`, `src/core/scanner.ts`, or just "the scanner module"):

1. Read `.backnote/<path>.md` first (e.g. `.backnote/src/core/scanner.ts.md`)
2. If the path is a directory, read `.backnote/<path>/_dir.md`
3. Follow any `[[links]]` in the note that are relevant to the user's question
4. Only then read the actual source file if the backnote doesn't have enough context

If the backnote is empty or skeleton-only, read the source file directly and mention that `/backnote:gen` can populate it.

## On Activation

Right now, do this — and **only** this. Do not glob, do not read any other files:

1. Read `.backnote/_dir.md` (project root overview)
2. Read `.backnote/_index.json` (link graph)
3. Report status in **one line**:
   - If `_dir.md` is a skeleton (empty sections) or `_index.json` is nearly empty → say "backnote-first mode active · notes not initialized, run `/backnote:gen` to populate"
   - Otherwise → say "backnote-first mode active · N nodes in graph" plus one short sentence on what the project is about

No raw dumps. No file-by-file summaries. No reading directory `_dir.md` files upfront — those load on-demand.

Directory and file notes are loaded **on-demand** when the user references them — not upfront.

## Reference

- `_dir.md` = directory overview
- `file.ts.md` = file-level notes
- `_notes/*.md` = standalone concept notes
- `_index.json` = full bidirectional link graph
- `[[target]]` = wiki-style link, resolve via `_index.json`
