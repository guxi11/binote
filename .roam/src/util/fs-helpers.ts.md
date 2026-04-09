# fs-helpers.ts

## Summary

Async filesystem primitives wrapped to never throw on the unhappy path: reads return `null`, writes auto-create parent directories, deletes return a boolean, and recursive walks honor a flat ignore list. Every other module goes through these helpers rather than touching `node:fs/promises` directly.

## Key Exports

- `ensureDir(path)` — recursive `mkdir`
- `readFileSafe(path)` → `string | null`
- `writeFileSafe(path, content)` — ensures parent dir, then writes utf-8
- `fileSize(path)` — bytes, or `0` on missing
- `removeFile(path)` → `boolean` success
- `walkDir(dir, ignore?, root?)` — recursive file paths relative to `root`
- `walkDirWithDirs(dir, ignore?, root?)` — `{ files, dirs }` recursive

## Notes

- The `ignore` list matches by directory **name** (not full path) — fast and consistent with `DEFAULT_IGNORE` in `roam-paths`, but a nested path like `src/generated` cannot be ignored.
- Walks pass `root` through recursion so returned paths are always relative to the original starting directory, not the current recursion frame.
- `writeFileSafe` calls `ensureDir(join(path, ".."))` — the `".."` join is the canonical "parent dir" trick rather than `dirname`.

## Links

- [[roam-paths.ts]] — defines the ignore list these helpers consume
- [[scanner.ts]] — primary caller of the walks
- [[note-io.ts]] — read/write/remove
- [[link-index.ts]] — read/write of `_index.json`
