# Changelog

All notable changes to this project will be documented in this file.


## [0.4.2] - 2026-07-09

### Features

- **retrieval**: read-demand promotion bridge — _sessions read logs now rank knowledge_gaps + audit_status; lean read logging restored (feature 001 Phase 2)
## [0.4.1] - 2026-07-07

### Features

- New `/binote:drift` command — one bounded tick of the write-side sedimentation loop: detect (audit_status + knowledge_gaps) → repair stale notes / write demand-ranked missing mirrors / link orphans via parallel subagents → integrity-check dangling links → commit .binote changes. Designed for `/loop 30m /binote:drift`; costs 2 tool calls and exits quietly when the graph is healthy

## [0.4.0] - 2026-07-03

### Features

- read_note graph reads render markdown (not pretty-printed JSON); linked/backlinked nodes arrive as compact excerpts (description + first paragraph + outline + links nav) — `detail: "full"` opts out. Measured ~78% payload cut at forwardDepth=1
- Relevance-ranked search via MiniSearch (fuzzy + prefix, note-path/heading boosting, scores on hits); `regex: true` keeps the exact line scan; empty rankings fall back to substring scan
- Git-aware staleness: change times come from the last commit touching a path (survives checkout/clone), fs mtime only for dirty/untracked files and non-git projects
- New `knowledge_gaps` tool: demand-ranked missing mirrors (dangling [[targets]] that are real project files, by inbound refs) + orphan notes (zero backlinks); wired into /binote:clarify
- Project scans use globby: gitignore-aware, and init's `ignore` glob patterns actually work now
- Frontmatter parsing backed by gray-matter (real YAML — nested keys no longer mangled)

### Breaking

- Session read-logging removed (`.binote/_sessions/` no longer written — it was write-only exhaust; 40 MB in one real project with zero readers)
- `_index.json` v3: legacy `forward`/`reverse` projections dropped (~19% of index size); `_audit/` reports excluded from the link graph in both directions, making `backDepth: 1` clean enough to use
- `backlinks` expansion happens at the requested root only (no longer at every forward-expanded neighbour)

## [0.1.5] - 2026-04-09

### Features

- Improve performance
## [0.1.4] - 2026-04-09

### Features

- Add version command for CLI tool

### Documentation

- Add changelog and use changenotes to manage it

[0.4.2]: https://github.com/Guxi11/binote/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Guxi11/binote/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Guxi11/binote/compare/v0.1.5...v0.4.0
[0.1.5]: https://github.com/Guxi11/binote/compare/v0.1.4...v0.1.5
[0.1.4]: https://github.com/Guxi11/binote/releases/tag/v0.1.4
