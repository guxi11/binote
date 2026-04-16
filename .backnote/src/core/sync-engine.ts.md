# sync-engine.ts

## Summary

Detects orphaned notes — notes whose source file no longer exists in the project — and marks them in-place with a sentinel HTML comment. Also rebuilds and persists the link index as part of every sync run.

## Key Exports

- `sync(config, dryRun?)` → `SyncResult`

## Notes

- Orphan detection uses `notePathToProjectPath`, which returns `null` for `_dir.md` and `_notes/*.md` — those can never be orphaned.
- The orphan sentinel is `<!-- ORPHANED: original project file deleted -->` and is checked via substring before re-marking, so sync is idempotent.
- `deleted` and `linksUpdated` in the result are currently always empty/zero — placeholders for future rename detection.
- `dryRun` skips both orphan marking and the index save.

## Links

- [[scanner.ts]] — project + note enumeration
- [[note-io.ts]] — read/write for marking
- [[roam-paths.ts]] — `notePathToProjectPath`
- [[link-index.ts]] — rebuild/save after orphan pass
- [[types.ts]] — `SyncResult` shape
