# scanner.ts

## Summary

Thin functional wrappers around `fs-helpers`' walk routines. Provides three scans: project files only, project files + directories, and existing notes under `.roam/`.

## Key Exports

- `scanProjectFiles(config)` — flat list of project file relative paths, honoring `config.ignore`
- `scanProjectStructure(config)` — `{ files, dirs }` for both files and directory paths
- `scanExistingNotes(config)` — files under `.roam/` filtered to `.md` only

## Notes

- `scanExistingNotes` passes an empty ignore list — it walks everything under `.roam/` (including `_notes/` and `_index.json`) and filters to `.md` after the walk.
- All scans return paths relative to the walk root, not absolute.

## Links

- [[fs-helpers.ts]] — `walkDir`, `walkDirWithDirs`
- [[roam-paths.ts]] — provides `RoamConfig`
- [[link-index.ts]] — caller for note enumeration
- [[sync-engine.ts]] — caller for both project and note enumeration
