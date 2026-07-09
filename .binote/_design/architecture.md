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

1. **The index is derived, never authoritative.** `_index.json` can be deleted at any time and rebuilt from notes. See [[src/core/link-index.ts]]. The same ruling covers the semantic-embedding cache `.binote/_embeddings/` (feature 001 Phase 1): deletable, regenerable from note bodies, invalidated on version/model/content-hash mismatch. See [[src/core/embeddings.ts]] and the constitution §8 side-note.
2. **Frontmatter is metadata only.** Body content never lives in frontmatter. The only currently-defined field is `lastVerified: <ISO>`.
3. **Reads at the MCP boundary are logged.** `read_note` appends a **lean** record — `{ ts, input (paths requested), forwardDepth, backDepth, chars }`, one line of JSONL — to `.binote/_sessions/<date>.jsonl`. It logs *what was asked for*, never the bodies returned (the pre-0.4.0 logger persisted full result content; that was dropped for weight and restored in this lean form by feature 001). The CLI is not logged (CLI is for humans). This log is the revealed-demand signal feeding retrieval ranking (see **Retrieval demand signal**). See [[src/index.ts]], [[src/core/read-demand.ts]].
4. **Path conventions live in one module.** All path↔note↔link↔directory math is in [[src/core/binote-paths.ts]]. No other module duplicates this logic.
5. **No persistent meta sidecar.** Staleness, backlinks, and the link graph are computed on demand from notes + source mtimes + frontmatter. Adding a `_meta/` shadow tree is explicitly out of scope. Disposable derived caches (`_index.json`, `_embeddings/`) are not sidecars — they carry no information that is not regenerable from notes.
6. **Backlinks are opt-in on the read path.** Forward links are cheap traversal; backlinks are noisy reverse samples. Default `backDepth: 0`.
7. **Semantic recall is strictly optional.** The embedding backend must never be a hard dependency: no network service, no daemon, no required install. When it is absent, `search` degrades silently to the lexical path — same tool, same contract, no error.

## Module map

Entry points are both surfaces of the same handler set — anything the MCP server can do, the CLI can do.

- **Entry**: [[src/index.ts]] (MCP server, stdio transport) and [[src/cli.ts]] (CLI). Both delegate to `core/*`.
- **Path layer**: [[src/core/binote-paths.ts]] — single source of truth for path conventions, `[[link]]` resolution strategy, ignore list, mirror policy. The most load-bearing module; never duplicate its logic elsewhere.
- **IO**: [[src/core/note-io.ts]] over [[src/util/fs-helpers.ts]]. Every read returns `string | null` (never throws on miss). Every write goes through `writeFileSafe` which mkdirs.
- **Scanning**: [[src/core/scanner.ts]] — splits "scan project tree" from "scan note tree". Project scan honors the ignore list; note scan does not.
- **Indexing**: [[src/core/link-index.ts]] — single-pass `[[link]]` extraction, line-aware, dangling-tracking. Versioned via `INDEX_VERSION` ([[src/types.ts]]); mismatched cache silently rebuilds. Backlinks are derived in the same pass as forward links.
- **Search**: [[src/core/search.ts]] — hybrid search over notes: MiniSearch lexical ranking RRF-fused with semantic recall when available; substring fallback when both rank to nothing. Per-hit link enrichment uses the cached index when fresh, falls back to inline re-resolution when stale.
- **Embeddings**: [[src/core/embeddings.ts]] — optional semantic backend (Tier 0 recall net, feature 001 Phase 1). Local quantized model via optional `@huggingface/transformers`; whole-note embedding (the note IS the chunk); derived vector cache under `_embeddings/`; returns null → lexical degradation when unavailable.
- **Read demand**: [[src/core/read-demand.ts]] — consumes `_sessions/*.jsonl` into a recency-weighted per-path read frequency (`readDemand`). Parses both the current compact JSONL and the pre-0.4.0 pretty-printed logs (brace-depth scanner). Pure over injected `now`; nothing persisted. Fused into `knowledge_gaps` and `audit_status` ranking.
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
  → appendLog (.binote/_sessions/<date>.jsonl) — lean: requested paths + depths + char count, best-effort (failures swallowed)
```

The log records the roots the agent explicitly requested, not the notes reached by `[[link]]` expansion — asking to read X is demand for X, not for its neighbours. Forward expansion follows resolved `[[links]]`. Backward expansion is included only when `backDepth: 1` and **does not** continue the forward chain — backlink neighbours are leaves.

### Write path (`write_note`)

```
input (notePath, content)
  → writeFileSafe (mkdir parent, write atomically)
  → invalidateIndex (rm _index.json)
```

Index rebuilds lazily on next read. Bulk writes that should batch the rebuild call `rebuild_index` explicitly.

### Search path (`search`, plain query)

```
notes → MiniSearch rank (lexical)          ┐
notes → semanticRank (cosine over cached   ├→ RRF fuse (k=60) → top N hits
        vectors; null if backend absent)   ┘        (via: lexical|semantic|both)
semantic null → lexical-only (original behavior)
both empty    → substring line scan
```

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
| `read_note`      | Read note(s) with optional forward/backward graph expansion | **Logged** (lean) to `_sessions/`. `forwardDepth: 1` is the recommended default for entering a file. |
| `write_note`     | Create/update a note                                         | Invalidates index                                                  |
| `search`         | Hybrid search (lexical ⊕ semantic RRF) with per-line link enrichment | NL queries recall keyword-less notes when the embedding backend is present; silent lexical degradation otherwise. Hybrid hits carry `via`. |
| `sync`           | Mark orphaned notes, rebuild index                           | Pure detection; no destructive deletion                            |
| `rebuild_index`  | Force index rebuild without LLM token cost                   | Use after bulk writes                                              |
| `mark_verified`  | Stamp `lastVerified` into frontmatter                        | Used by `/binote:verify` after audit                               |
| `audit_status`   | Report stale/unverified notes ranked by demand-weighted drift | Read-only; drift × read demand within each level. Carries `readFreq` per row. |
| `knowledge_gaps` | Demand-ranked sedimentation gaps (missing mirrors + orphan notes) | `missingMirrors` ranked by `demandScore` = inbound refs + read demand. Used by `/binote:clarify`. |
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
- `isMetaFile(p)`       — `_index.json` or any leading-underscore file (internal artifact; covers `_embeddings/`)

`_design/` is not yet a first-class predicate in the path module — it currently classifies as standalone via the leading-underscore convention. If `_design/` needs distinct handling (e.g., authority-aware conflict reporting), that predicate belongs in `binote-paths.ts` alongside the others.

## Staleness model

Three signals, all computed on demand:

1. `sourceMtime` — fs `stat` on the mirrored source file (`null` for `_dir`, `_notes`, `_design`, standalone)
2. `noteMtime`  — fs `stat` on the `.binote/<path>.md` file
3. `lastVerified` — parsed from note frontmatter (`null` if never stamped)

Derived levels: `fresh | warning | stale | unverified`. The classifier lives in `core/meta.ts` (referenced by [[src/index.ts]] via `stalenessFor`). See [[src/types.ts]] `StalenessInputs` / `Staleness` for the contract.

`audit_status` ranks: `stale > warning > unverified > fresh`, then within a level by demand-weighted drift `(daysSourceAheadOfNote + 1) × (1 + W·readFreq)` descending — a stale note agents keep reading outranks an equally-stale one nobody touches, but heavy drift still dominates a cold note. See **Retrieval demand signal**.

## Retrieval demand signal

Two demand sources rank where curation effort should go, so the `[[link]]` tax is spent only on load-bearing notes:

- **Latent demand** — inbound `[[link]]` count from the graph. The graph is already pointing at these notes.
- **Revealed demand** — recency-weighted read frequency from `_sessions/*.jsonl` (invariant 3). What agents *actually* reached for, whether or not the graph links it. The stronger signal, so weighted above latent demand (`W = 2`).

[[src/core/read-demand.ts]] `readDemand(config, now, halfLife=21d)` folds the logs into a per-path `readFreq` (exponential recency decay: `0.5^(ageDays/halfLife)`; stale logs fade rather than cut off). Two consumers fuse it, both in [[src/index.ts]]:

- `knowledge_gaps.missingMirrors` → `demandScore = inboundRefs + W·readFreq` (a yet-unwritten note agents keep trying to read beats one that is merely linked a lot).
- `audit_status` → drift amplified by `readFreq` within each staleness level.

Constitution-compatible: the signal is **computed on demand from the logs, never persisted** — no derived read-count sidecar (invariant 5, §8). Origin: feature `_features/001-tiered-retrieval` Phase 2 (the demand bridge). Phase 1 (semantic recall, below) landed after it; Phase 3 (import graph seeding) remains unbuilt.

## Semantic recall (Tier 0)

Feature 001 Phase 1. The `[[link]]` graph stays the precision spine (Tier 1); semantic recall is the entry net into uncurated territory — an enhancement of the `search` tool only, never a replacement for graph traversal.

- **Backend**: [[src/core/embeddings.ts]]. Local quantized model (`Xenova/multilingual-e5-small` by default — note corpora are zh/en mixed; override via `BINOTE_EMBED_MODEL`) through the *optional* `@huggingface/transformers` dependency. `BINOTE_NO_EMBED=1` disables; `HF_ENDPOINT` supports mirrors on blocked networks. Model weights live in `~/.cache/binote/models`.
- **Unit = note.** binote is naturally immune to RAG chunking machinery — one note per file/module is already the retrieval unit. Whole bodies are embedded (8k-char cap); no semantic chunking, no reranker, no RSE.
- **Fusion**: reciprocal-rank fusion (k=60) of the MiniSearch list and the cosine-similarity list, in [[src/core/search.ts]]. Identifier-ish queries win lexically; NL queries (especially CJK, which MiniSearch cannot tokenize) win semantically; hits carry `via`.
- **Cache**: `.binote/_embeddings/<model>.json`, schema `EmbeddingsCache` in [[src/types.ts]]. Derived index per §4 (see invariant 1); gitignored via `PRIVATE_PATHS`.
- **Degradation** (invariant 7): backend absent/failing → `semanticRank` returns null → exact pre-Phase-1 lexical behavior.
- **Limit**: empty notes are unembeddable — semantic recall cannot surface a mirror nobody has written. That remains `knowledge_gaps`' job (Phase 2), and cold-start coverage is Phase 3's.

## What is explicitly out of scope

- **Rename detection in sync.** Agents handle renames at write time. Sync only detects deletions.
- **Persistent backlink storage.** Backlinks are derived from forward links in the same index pass.
- **A `_meta/` shadow tree.** Frontmatter is the only durable per-note metadata; everything else is computed. (`_embeddings/` is a disposable derived cache, not durable metadata — see invariant 1.)
- **Non-`[[link]]` reference syntax.** No `@file`, no inline markdown links as cross-refs.
- **Multi-project / federated indices.** Each `.binote/` is its own world. Cross-project linking is a separate concern.
- **ANN retrieval replacing graph traversal.** Vectors only augment `search`; `[[link]]` hops remain the primary read path.
- **A required embedding dependency.** No external service, no daemon, no mandatory model download (invariant 7).

## Conventions for evolving this doc

- A change to module boundaries → update the **Module map** section.
- A change to a tool's signature → update **Public interface contracts**.
- A new invariant or the removal of one → update **Core invariants**.
- A new note kind → update the **Note kinds** table AND the resolver in [[src/core/binote-paths.ts]].
- When this doc grows past ~300 lines, split per-module specs into `_design/<module>.md` and link them from here.
