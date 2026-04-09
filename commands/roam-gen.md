---
description: "Generate roam note content by reading source files. Fills empty .roam/ skeletons with summaries, purpose, and [[bidirectional links]]. Triggers on: '/roam-gen', 'generate roam notes', 'fill roam notes'."
argument-hint: "[path/to/file, directory, or 'all']"
---

# RoamMem Note Generator

You are generating meaningful content for `.roam/` notes by reading the actual source code and filling in summaries, purpose descriptions, and `[[bidirectional links]]`.

## Note Format

### For file notes (`file.ts.md`):
```markdown
# filename.ts

## Summary
One paragraph: what this file does, its role in the system.

## Key Exports
- `functionName` — what it does
- `TypeName` — what it represents

## Notes
Design decisions, non-obvious behavior, gotchas.

## Links
- [[dependency.ts]] — why this dependency matters
- [[related-concept]] — how they connect
```

### For directory notes (`_dir.md`):
```markdown
# dirname/

## Overview
What this directory is responsible for in the project.

## Structure
- `file-a.ts` — one-line purpose
- `file-b.ts` — one-line purpose
- `subdir/` — one-line purpose

## Notes
Architectural decisions, conventions within this directory.

## Links
- [[parent-dir]] — relationship
- [[sibling-dir]] — relationship
```

## Link Rules

- **Always use the full project-relative path without `.md` extension**: `[[src/core/scanner.ts]]`, NOT `[[scanner]]` or `[[scanner.ts.md]]`
  - Bare basenames like `[[scanner]]` only resolve when globally unique. Two files sharing a name (e.g. `src/a/util.ts` + `src/b/util.ts`) will silently drop the link during index build.
- For directories use the full path: `[[src/core]]` (resolves to `src/core/_dir.md`)
- For standalone notes use the `_notes/` prefix: `[[_notes/architecture]]`
- Only link to files that actually exist in the project
- Link to things that have a meaningful relationship — not everything

## Execution

### If $ARGUMENTS is a specific file or directory:
1. Read the source file/directory
2. Read the existing `.roam/` note (if any)
3. Generate note content following the format above
4. Write the note via the Write tool to `.roam/<path>.md`

### If $ARGUMENTS is 'all' or no arguments:
1. List all `.roam/*.md` files
2. Identify empty or skeleton-only notes (< 50 chars or only headings)
3. For each empty note, read the corresponding source file
4. Generate and write note content
5. After all notes are written, call the `rebuild_index` MCP tool to refresh `_index.json` (do NOT manually read notes or write the json yourself — that wastes tokens)

## Rules

- Read the source file thoroughly before writing its note — no guessing
- Keep summaries concise but accurate — one paragraph max
- Preserve any existing human-written content in notes — only fill empty sections
- Use parallel agents to process multiple files when generating 'all'
- After writing notes, report: how many generated, how many skipped (already had content)
