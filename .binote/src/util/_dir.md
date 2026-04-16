# src/util/

## Overview

Low-level primitives: filesystem helpers (recursive walk, safe read/write, removal) and the markdown templates used to seed new note skeletons.

## Structure

- `fs-helpers.ts` — `walkDir`, `walkDirWithDirs`, `readFileSafe`, `writeFileSafe`, `ensureDir`, `removeFile`, `fileSize`
- `markdown.ts` — `fileNoteTemplate`, `dirNoteTemplate`, `standaloneNoteTemplate`

## Notes

- All fs helpers swallow errors and return `null`/`false` rather than throwing — callers branch on the result
- `walkDir` honors a flat ignore list of directory **names**, not glob patterns — `node_modules` is matched anywhere in the tree, but `src/generated` cannot be ignored as a path

## Links

- [[src]] — parent
- [[src/core]] — primary consumer
