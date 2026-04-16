# link-index.ts

## Summary

Builds, caches, and invalidates the bidirectional `LinkIndex`. Walks every note, runs `extractLinks`, resolves each target via `resolveLink`, and accumulates both forward and reverse adjacency maps. The result is persisted to `_index.json` and lazily rebuilt on read miss or JSON parse error.

## Key Exports

- `buildIndex(config)` — fresh scan of all notes, returns `LinkIndex`
- `saveIndex(config, index)` — writes pretty-printed JSON to `config.indexPath`
- `getOrBuildIndex(config)` — load from disk or rebuild + save
- `invalidateIndex(config)` — delete the cached `_index.json`

## Notes

- Unresolved links are silently dropped from the index — there is no broken-link diagnostic surface yet.
- `invalidateIndex` does a dynamic `import("../util/fs-helpers.js")` to avoid a top-level import cycle (`link-index → fs-helpers` would otherwise cycle through `note-io`).
- The reverse map is built incrementally with `[...prev, notePath]` — O(n²) on dense graphs but fine at typical project sizes.

## Links

- [[scanner.ts]] — `scanExistingNotes` to enumerate
- [[note-io.ts]] — `readNote` per note
- [[link-parser.ts]] — `extractLinks`
- [[roam-paths.ts]] — `resolveLink`
- [[fs-helpers.ts]] — safe read/write of the cached JSON
- [[types.ts]] — `LinkIndex` shape
