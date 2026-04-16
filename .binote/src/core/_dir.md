# src/core/

## Overview

Engine modules: filesystem scanning, note read/write, link parsing and indexing, sync detection, and the path-mapping rules that translate project paths to roam note paths.

## Structure

- `scanner.ts` — walk the project tree and walk existing notes
- `note-io.ts` — read / write / exists / delete primitives for notes
- `link-parser.ts` — extract `[[link]]` targets from markdown
- `link-index.ts` — build / cache / invalidate the bidirectional link graph
- `sync-engine.ts` — detect orphans (project file deleted, note remains) and mark them
- `roam-paths.ts` — config + path conversions + link resolution; the schema authority

## Notes

- `roam-paths.ts` owns what counts as a `_dir.md`, `_notes/*.md`, or mirrored file note — every other module defers to it for path semantics
- The link index is persisted to `_index.json` and lazily rebuilt on read miss or parse error

## Links

- [[src]] — parent
- [[src/util]] — fs primitives consumed here
