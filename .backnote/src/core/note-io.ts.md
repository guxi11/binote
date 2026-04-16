# note-io.ts

## Summary

CRUD primitives for notes. Translates a relative note path into an absolute path via `noteAbsPath` and delegates to the safe fs helpers. Returns nullable values rather than throwing — callers branch on null.

## Key Exports

- `readNote(config, path)` → `string | null`
- `writeNote(config, path, content)` → `Promise<void>`
- `deleteNote(config, path)` → `boolean` success
- `noteExists(config, path)` → `boolean`

## Notes

- `noteExists` is implemented via `readFileSafe` rather than `stat` — slightly more expensive but reuses the same null-on-error contract everywhere.
- All writes go through `writeFileSafe`, which `ensureDir`s the parent — safe to write deeply nested note paths without precreating directories.

## Links

- [[roam-paths.ts]] — `noteAbsPath`
- [[fs-helpers.ts]] — `readFileSafe`, `writeFileSafe`, `removeFile`
- [[link-index.ts]] — primary consumer
- [[sync-engine.ts]] — uses `readNote` / `writeNote` for orphan marking
