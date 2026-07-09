# Binote Constitution

Project-wide invariants. Every proposed change must respect these. When source code, [[_design/architecture.md]], or any other artifact disagrees with this file, **this file wins by intent** — the disagreement is a bug to surface, not silently reconcile.

## 1. Notes mirror the code tree
Every source file `<rel>` has a 1:1 note at `.binote/<rel>.md`. No "discoverable" location for notes — path equivalence IS the navigation contract.

## 2. `[[link]]` is the only cross-reference primitive
No `@file`, no inline markdown links as cross-refs. Resolution, indexing, search, and graph traversal all derive from one syntax. New reference forms are out of scope.

## 3. Path conventions live in one module
All path↔note↔link↔directory math lives in [[src/core/binote-paths.ts]]. No other module duplicates this logic. New note kinds get classified there first.

## 4. The index is derived, never authoritative
`_index.json` is regenerable from notes at any time. Frontmatter is the only durable per-note metadata; everything else is computed on demand.

## 5. Reads at the MCP boundary are logged
The MCP server logs every `read_note` to `.binote/_sessions/<date>.jsonl` for replayability of LLM context. The CLI is for humans and is not logged.

## 6. Backlinks are opt-in on the read path
Forward links are cheap traversal; backlinks are noisy reverse samples. Default `backDepth: 0`.

## 7. Dual authority: runtime truth vs intent truth
- **Source code** answers "what runs" (runtime truth).
- [[_design/architecture.md]] and `_design/<topic>.md` answer "what was intended at the module level" (module intent).
- **This file** (`_constitution.md`) is project-wide intent that outranks both `_design/` and code on conflict.

When code and `_design/` disagree, surface the gap — never silently reconcile.

## 8. No persistent meta sidecar
Staleness, backlinks, and the link graph are derived from notes + source mtimes + frontmatter. Adding a `_meta/` shadow tree is explicitly out of scope.

> **Side-note (ruled by feature 001 Phase 1):** the semantic-embedding cache `.binote/_embeddings/` is a *derived index* under §4, not a meta sidecar. It carries no information that is not regenerable from note bodies; it is deletable at any time and invalidated on version/model/content-hash mismatch. The §8 prohibition targets durable *metadata* trees; disposable derived *caches* (`_index.json`, `_embeddings/`) are permitted.

## 9. Authority hierarchy

| Rank | Artifact                          | Role                                              |
| ---- | --------------------------------- | ------------------------------------------------- |
| 1    | `_constitution.md` (this file)    | Project-wide invariants                           |
| 2    | Source code                       | Runtime truth — what *is*                         |
| 2    | `_design/<topic>.md`              | Module intent — what *should be*                  |
| 3    | `_features/<NNN-slug>/spec.md`    | Feature-scoped intent (in-flight work)            |
| 4    | `<dir>/_dir.md`                   | Directory overview                                |
| 4    | `<file>.md`                       | Per-file annotation                               |
| 5    | `_notes/<topic>.md`               | ADRs, frozen at write-time                        |
| 6    | `_audit/<date>/*.md`              | Historical snapshots, non-authoritative           |

## 10. Feature work is scoped, indexed, retired

In-flight work lives under `_features/<NNN-slug>/` with `spec.md`, `plan.md`, `tasks.md`. Each plan must `[[link]]` every file it will touch — that link IS the audit trail. After landing, retire the feature folder to `_audit/` or leave it as historical context.

## 11. Out of scope (explicit)

- Rename detection in sync. Agents handle renames at write time. Sync only detects deletions.
- Persistent backlink storage. Backlinks are derived from forward links in the same index pass.
- A `_meta/` shadow tree.
- Non-`[[link]]` reference syntax.
- Multi-project / federated indices. Each `.binote/` is its own world.
- A *required* embedding dependency. Semantic recall must stay optional and degrade to lexical search without error.
