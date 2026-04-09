# types.ts

## Summary

Shared type definitions used across the engine. All types are `readonly` to enforce immutability at the type level — the codebase treats data as values, not mutable state.

## Key Exports

- `RoamConfig` — frozen project config: `projectRoot`, `roamDir`, `notesDir`, `indexPath`, `ignore`
- `NoteKind` — `"file" | "directory" | "standalone"` discriminator
- `LinkIndex` — `{ forward, reverse }` adjacency maps keyed by note path
- `SyncResult` — what changed during a sync run (`deleted`, `orphaned`, `linksUpdated`)
- `SearchHit` — `{ notePath, lineNumber, lineContent, context }` for full-text search

## Notes

- `readonly` modifiers everywhere — mutation paths inside the engine build mutable locals and let the return type freeze them at the boundary.
- `NoteKind` is currently declared but not consumed anywhere — reserved for future routing on note kind.

## Links

- [[roam-paths.ts]] — produces `RoamConfig`
- [[link-index.ts]] — produces `LinkIndex`
- [[sync-engine.ts]] — produces `SyncResult`
- [[index.ts]] — consumes `SearchHit`
