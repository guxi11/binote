---
description: "One tick of the sedimentation loop: repair stale mirror notes, write demand-ranked missing mirrors, link orphan notes — then commit .binote changes. Designed for '/loop 30m /binote:drift'; exits quietly when the graph is healthy. Triggers on: '/binote:drift [--top N] [--min-refs N] [--dry-run] [--no-commit]'."
---

# Binote — Drift Repair Tick

Sedimentation must not depend on someone remembering `/binote:save`. One tick = **detect → repair → integrity-check → commit**. Run it on a schedule (`/loop 30m /binote:drift`) or after landing work; each tick is bounded and idempotent.

## Argument parsing

The user invoked `/binote:drift [args]`. Parse:

- `--top N` → max repair subagents this tick (default: 3)
- `--min-refs N` → missing-mirror demand threshold (default: 5 inbound refs)
- `--dry-run` → detect and report the queue; repair nothing
- `--no-commit` → repair but leave changes uncommitted

## Step 1 — Detect (2 tool calls, zero subagents)

1. `audit_status` with `limit: 200` — collect notes with `level: "stale"` or `level: "warning"`, `kind ∈ {file, design}`.
2. `knowledge_gaps` — collect `missingMirrors` (keep `inboundRefs ≥ min-refs`) and `orphanNotes`.

Build the work queue in priority order:

1. **STALE** mirrors (`level === "stale"`) — knowledge that is probably wrong right now
2. **MISSING** mirrors with `inboundRefs ≥ min-refs` — knowledge the graph is already asking for
3. **WARNING** mirrors with `daysSourceAheadOfNote ≥ 14` — drifting, not yet rotten
4. **ORPHANS** — all of them batch into ONE linking item (cheap)

**Queue empty → print `binote graph healthy · 0 repairs` and STOP.** This is the common case in a healthy loop; do not spawn agents, do not rebuild anything.

Take the top N items. If `--dry-run`: print the queue as a table (category / path / signal) and stop.

## Step 2 — Repair (parallel subagents)

Spawn one general-purpose subagent per queue item, all in a single parallel batch. Every prompt carries these constraints verbatim:

> For this knowledge-base maintenance task you ARE permitted to Read files under `.binote/` directly. You may modify ONLY `.binote/**/*.md` files. Never touch source code. Never delete a note.

**STALE / WARNING mirror** — surgical refresh, not regeneration:
- Read the source file fully and the current note.
- Diff reality against the note's claims. Update ONLY the drifted sections — preserve structure, [[wikilinks]], and voice. Keep (or add) a one-line `description:` frontmatter key.
- If every claim still holds, do NOT edit — call `mark_verified` on the note instead and say so.
- Return one line: `refreshed <path> (<what drifted>)` or `verified <path> (no drift)`.

**MISSING mirror** — write the demanded note:
- Read the source file fully + 2-3 of the notes referencing it (from `referencedFrom`).
- Write `.binote/<path>.md`: `description:` frontmatter; `# <basename>`; `## Summary` whose first paragraph is a self-contained 2-4 sentence summary (it becomes the excerpt); sections for contracts/invariants/gotchas the citers rely on; [[full/project/relative/path]] links. 40-80 lines. Current source truth only.

**ORPHANS (one batch agent)**:
- For each orphan: read it, find 1-2 natural citer notes (Grep `.binote/` for related topics), add ONE line with a `[[_notes/<name>.md]]` link + a few words on why it's relevant. Skip (and flag in the report) any orphan that is superseded/stale rather than force-linking it.

## Step 3 — Integrity check

1. `rebuild_index`, then compare the `dangling` count against the pre-tick value (from Step 1's tools or a `binote dangling` CLI call made before repairs).
2. Any NEW dangling target introduced this tick → fix it yourself (correct the path to an existing note, or drop the link). Wikilinks must point at existing notes; new-note targets count as existing once written.

## Step 4 — Commit

Unless `--no-commit`:

- Stage ONLY the `.binote/` paths this tick touched (explicit paths — never `git add -A`; other sessions may share the index).
- Commit: `docs(binote): drift tick — <X> refreshed, <Y> written, <Z> linked, <V> verified`.
- If a pre-commit lint (e.g. binote-lint) rejects dangling links: fix and retry ONCE; still failing → leave uncommitted and surface the failure in the report.
- Push only if this project's established convention is to push notes commits; when unsure, don't.

## Report (always, one compact block)

```
drift tick: 2 refreshed · 1 written · 0 linked · 1 verified
queue remaining: 4 stale, 12 missing (next tick picks up src/foo.ts.md …)
committed: <sha> | dry-run | lint-blocked
```

## Constraints

- **Bounded**: at most N repair agents + 1 orphan agent per tick. Never recurse into the next demand ring in the same tick — new notes create new dangling refs; the NEXT tick picks them up.
- **Non-destructive**: never delete or wholesale-rewrite notes; superseded orphans are flagged for the human, not removed.
- **Quiet when healthy**: an empty queue costs 2 tool calls and one status line.
