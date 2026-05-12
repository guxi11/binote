# Binote Architecture

> **Authority**: this note is the design authority for binote. When source code disagrees with what is written here, the disagreement is a bug — either in code or in this doc. Surface the gap; do not silently follow either side.

## Mission

A bidirectional-linked note system that lives next to source code, optimised for **LLM context retrieval**. The goal is not human note-taking; it is making a codebase navigable in O(1) hops for an agent that reads `.binote/foo.ts.md` *before* reading `foo.ts`.

Two non-negotiables fall out of this mission:

1. **Notes mirror the code tree.** Path equivalence (`src/x.ts` ↔ `.binote/src/x.ts.md`) means an agent never needs to "discover" where notes live.
2. **`[[link]]` is the only cross-reference primitive.** Resolution, indexing, search, and graph traversal all derive from one syntax. No alternative reference forms.

## Note kinds and authority hierarchy

| Kind                  | Path shape                       | Role                                                        | Authority on conflict |
| --------------------- | -------------------------------- | ----------------------------------------------------------- | --------------------- |
| Constitution          | `_constitution.md`               | Project-wide invariants — bedrock                           | 0 (highest, project)  |
| Source code           | `<project-rel>`                  | Runtime truth — what *is*                                   | 1 (runtime)           |
| Design                | `_design/<topic>.md`             | Module-level intent — what *should be*                      | 1 (intent)            |
| Feature spec          | `_features/<NNN-slug>/spec.md`   | Feature-scoped intent (in-flight work)                      | 2                     |
| Feature plan/tasks    | `_features/<NNN-slug>/{plan,tasks}.md` | Execution structure for the spec                      | 2                     |
| Dir overview          | `<dir>/_dir.md`                  | Module-level summary, on-demand load                        | 3                     |
| File annotation       | `<project-rel>.md`               | Per-file notes, mirror 1:1 with source                      | 3                     |
| Standalone / ADR      | `_notes/<topic>.md`              | Decisions, cross-cutting discoveries, frozen at write-time  | 4                     |
| Audit snapshot        | `_audit/<date>/*.md`             | Historical capture, never authoritative                     | 5                     |

**`_constitution.md` outranks everything.** When source, `_design/`, or any other artifact contradicts the constitution, the constitution wins by intent — surface the gap.

**Runtime truth and design truth tie at rank 1.** Source code answers "what runs"; `_design/` answers "what was intended at the module level". When they disagree, that *is* the report — flag it, don't reconcile silently.

**Feature artifacts are scoped intent.** `_features/<NNN-slug>/spec.md` outranks file annotations within its declared touch set but is itself bounded by `_design/` and the constitution.

## Path classification & note kinds

Predicates live in [[src/core/binote-paths.ts]]:

- `isNonMirrorNote(p)`   — any top-level `_<name>/` dir or root `_<name>.md` file (no source counterpart, so `notePathToProjectPath` returns null)
- `isConstitutionNote(p)`, `isDesignNote(p)`, `isFeatureNote(p)`, `isStandaloneNote(p)`, `isDirNote(p)` — specific kind tests
- `classifyNote(p)` → `"constitution" | "design" | "feature" | "notes" | "audit" | "dir" | "file"` — single-source-of-truth classifier consumed by `audit_status` for `/binote:clarify` grouping

## Core invariants

1. **The index is derived, never authoritative.** `_index.json` can be deleted at any time and rebuilt from notes. See [[src/core/link-index.ts]].
2. **Frontmatter is metadata only.** Body content never lives in frontmatter. The only currently-defined field is `lastVerified: <ISO>`.
3. **Reads at the MCP boundary are logged.** `read_note` writes to `.binote/_sessions/<date>.jsonl`. The CLI is not logged (CLI is for humans). See [[src/index.ts]].
4. **Path conventions live in one module.** All path↔note↔link↔directory math is in [[src/core/binote-paths.ts]]. No other module duplicates this logic.
5. **No persistent meta sidecar.** Staleness, backlinks, and the link graph are computed on demand from notes + source mtimes + frontmatter. Adding a `_meta/` shadow tree is explicitly out of scope.
6. **Backlinks are opt-in on the read path.** Forward links are cheap traversal; backlinks are noisy reverse samples. Default `backDepth: 0`.

## Module map

Entry points are both surfaces of the same handler set — anything the MCP server can do, the CLI can do.

- **Entry**: [[src/index.ts]] (MCP server, stdio transport) and [[src/cli.ts]] (CLI). Both delegate to `core/*`.
- **Path layer**: [[src/core/binote-paths.ts]] — single source of truth for path conventions, `[[link]]` resolution strategy, ignore list, mirror policy. The most load-bearing module; never duplicate its logic elsewhere.
- **IO**: [[src/core/note-io.ts]] over [[src/util/fs-helpers.ts]]. Every read returns `string | null` (never throws on miss). Every write goes through `writeFileSafe` which mkdirs.
- **Scanning**: [[src/core/scanner.ts]] — splits "scan project tree" from "scan note tree". Project scan honors the ignore list; note scan does not.
- **Indexing**: [[src/core/link-index.ts]] — single-pass `[[link]]` extraction, line-aware, dangling-tracking. Versioned via `INDEX_VERSION` ([[src/types.ts]]); mismatched cache silently rebuilds. Backlinks are derived in the same pass as forward links.
- **Search**: [[src/core/search.ts]] — full-text scan over notes. Per-hit link enrichment uses the cached index when fresh, falls back to inline re-resolution when stale.
- **Sync**: [[src/core/sync-engine.ts]] — orphan detection only (source file deleted, mirror note survives → prepend `<!-- ORPHANED -->`). No rename detection by design; renames are a write-time concern handled by the agent.

## Data flow

### Read path (`read_note`)

```
input notePath
  → resolveNotePath (exact → fuzzy via resolveLinkDetailed)
  → readNote (raw markdown)
  → parseFrontmatter (strip metadata, keep body)
  → if depth=0  : renderNote + staleness banner → return text
  → if depth>0  : expandNote (recursive, cycle-safe via visited Set)
                  → attachStaleness in one batch
                  → return graph
  → appendLog (.binote/_sessions/<date>.jsonl)
```

Forward expansion follows resolved `[[links]]`. Backward expansion is included only when `backDepth: 1` and **does not** continue the forward chain — backlink neighbours are leaves.

### Write path (`write_note`)

```
input (notePath, content)
  → writeFileSafe (mkdir parent, write atomically)
  → invalidateIndex (rm _index.json)
```

Index rebuilds lazily on next read. Bulk writes that should batch the rebuild call `rebuild_index` explicitly.

### Sync path

```
projectFiles = walkDir(projectRoot)
noteFiles    = walkDir(.binote/)
orphans      = noteFiles where projectPathFromNote(n) ∉ projectFiles
markOrphaned(orphans)
rebuildIndex
```

## Public interface contracts

### MCP tools (LLM surface)

| Tool             | Purpose                                                      | Notes                                                              |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------ |
| `init`           | Scaffold `.binote/` from project tree                        | Idempotent; safe to re-run                                         |
| `read_note`      | Read note(s) with optional forward/backward graph expansion | **Logged** to `_sessions/`. `forwardDepth: 1` is the recommended default for entering a file. |
| `write_note`     | Create/update a note                                         | Invalidates index                                                  |
| `search`         | Full-text search with per-line link enrichment              | Hits include resolved `[[link]]` targets on the matched line       |
| `sync`           | Mark orphaned notes, rebuild index                           | Pure detection; no destructive deletion                            |
| `rebuild_index`  | Force index rebuild without LLM token cost                   | Use after bulk writes                                              |
| `mark_verified`  | Stamp `lastVerified` into frontmatter                        | Used by `/binote:verify` after audit                               |
| `audit_status`   | Report stale/unverified notes ranked by drift                | Read-only; on-demand mtime + frontmatter inspection                |
| `ignore`         | Append private artifacts to `.gitignore`                     | Idempotent; notes themselves stay tracked                          |
| `list_notes`     | Enumerate `.binote/`                                         | No content read                                                    |

### CLI

Mirrors the MCP tool set. Plus `links`, `resolve`, `dangling` for human inspection. CLI does not log reads (humans don't need it; logging exists for replayability of LLM context).

### `[[link]]` resolution

Strategy order — defined in [[src/core/binote-paths.ts]] `resolveLinkDetailed`:

1. **exact**     — `<target>.md` exists as a note
2. **as-is**     — target already ends in `.md` or is under `_notes/`
3. **dir**       — `<target>/_dir.md` exists
4. **basename**  — unique basename match across all notes (ambiguous → returns candidates, resolves to `null`)
5. **substring** — case-insensitive basename substring (lenient typo recovery)

Authors should prefer full project-relative paths in `[[links]]` (`[[src/core/scanner.ts]]`, not `[[scanner]]`) — bare basenames silently drop when ambiguous.

### Note kinds (classification predicates)

Defined in [[src/core/binote-paths.ts]]:

- `isDirNote(p)`        — basename is `_dir.md`
- `isStandaloneNote(p)` — under `_notes/`
- `isMetaFile(p)`       — `_index.json` or any leading-underscore file (internal artifact)

`_design/` is not yet a first-class predicate in the path module — it currently classifies as standalone via the leading-underscore convention. If `_design/` needs distinct handling (e.g., authority-aware conflict reporting), that predicate belongs in `binote-paths.ts` alongside the others.

## Staleness model

Three signals, all computed on demand:

1. `sourceMtime` — fs `stat` on the mirrored source file (`null` for `_dir`, `_notes`, `_design`, standalone)
2. `noteMtime`  — fs `stat` on the `.binote/<path>.md` file
3. `lastVerified` — parsed from note frontmatter (`null` if never stamped)

Derived levels: `fresh | warning | stale | unverified`. The classifier lives in `core/meta.ts` (referenced by [[src/index.ts]] via `stalenessFor`). See [[src/types.ts]] `StalenessInputs` / `Staleness` for the contract.

`audit_status` ranks: `stale > warning > unverified > fresh`, then by `daysSourceAheadOfNote` descending.

## What is explicitly out of scope

- **Rename detection in sync.** Agents handle renames at write time. Sync only detects deletions.
- **Persistent backlink storage.** Backlinks are derived from forward links in the same index pass.
- **A `_meta/` shadow tree.** Frontmatter is the only durable per-note metadata; everything else is computed.
- **Non-`[[link]]` reference syntax.** No `@file`, no inline markdown links as cross-refs.
- **Multi-project / federated indices.** Each `.binote/` is its own world. Cross-project linking is a separate concern.

## Conventions for evolving this doc

- A change to module boundaries → update the **Module map** section.
- A change to a tool's signature → update **Public interface contracts**.
- A new invariant or the removal of one → update **Core invariants**.
- A new note kind → update the **Note kinds** table AND the resolver in [[src/core/binote-paths.ts]].
- When this doc grows past ~300 lines, split per-module specs into `_design/<module>.md` and link them from here.
