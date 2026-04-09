# roam-paths.ts

## Summary

Schema authority for the roam layout. Owns the default ignore list, the file-extension skip set for mirroring, the bidirectional mapping between project paths and note paths, the directory/standalone/meta classifiers, and the `[[link]]` resolution strategy.

## Key Exports

- `makeConfig(projectRoot, extraIgnore?)` — frozen `RoamConfig`
- `shouldMirror(filePath)` — true if a project file should get a note (skips dotfiles and common binary/data extensions)
- `projectPathToNotePath` — `src/index.ts → src/index.ts.md`
- `dirToNotePath` — `src → src/_dir.md`
- `notePathToProjectPath` — inverse; returns `null` for dir notes and standalone notes
- `isStandaloneNote`, `isDirNote`, `isMetaFile` — classifiers
- `resolveLink(target, allNotePaths)` — try `${target}.md`, then as-is, then `${target}/_dir.md`, then unique basename match
- `noteAbsPath(config, relPath)` — `join(config.roamDir, relPath)`

## Notes

- `DEFAULT_IGNORE` is name-based: `.git`, `.roam`, `.claude`, `node_modules`, `dist`, `build`, `.next`, `.nuxt`, `.DS_Store`, `.gitignore` — matched anywhere in the tree.
- `SKIP_EXTENSIONS` includes `.md` itself, so markdown files in the project are not mirrored — this avoids polluting `.roam/` with notes-about-notes.
- `resolveLink` returns `null` when basename matching is ambiguous (more than one candidate); the link is then dropped from the index silently. To keep links resolvable, prefer `[[filename.ts]]` over `[[filename]]` because the basename match looks for exactly `${target}.md` or `${target}`.
- `isStandaloneNote` checks both `_notes/` and `_notes\` to be Windows-tolerant.

## Links

- [[types.ts]] — `RoamConfig`
- [[scanner.ts]] — uses `RoamConfig.ignore`
- [[note-io.ts]] — uses `noteAbsPath`
- [[link-index.ts]] — uses `resolveLink`
- [[sync-engine.ts]] — uses `notePathToProjectPath`
- [[index.ts]] — `init` tool calls `shouldMirror` / `projectPathToNotePath` / `dirToNotePath`
- [[cli.ts]] — same usage as the MCP entry
