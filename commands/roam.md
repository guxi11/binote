---
description: "Activate roam-first mode: read .roam/ notes before source code. Auto-loads roam context when user references file paths. Use at conversation start. Triggers on: '/roam'."
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

If the roam note is empty or skeleton-only, read the source file directly and mention that `/roam-gen` can populate it.

## On Activation

Right now, do this:

1. Read `.roam/_dir.md` (project root overview)
2. Read `.roam/_index.json` (link graph)
3. Glob `.roam/**/_dir.md` and read each directory overview
4. Summarize what you learned — concise, no raw dumps
5. Confirm roam-first mode is active

## Reference

- `_dir.md` = directory overview
- `file.ts.md` = file-level notes
- `_notes/*.md` = standalone concept notes
- `_index.json` = full bidirectional link graph
- `[[target]]` = wiki-style link, resolve via `_index.json`
