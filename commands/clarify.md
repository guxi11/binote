---
description: "Find under-noted code: empty file mirrors, missing _design coverage, long-unverified notes. Reports gaps; never auto-mutates. Triggers on: '/binote:clarify [--kind=file|design] [--top N]'."
---

# Binote — Find Coverage Gaps

You are surfacing where the binote graph is thin: source files with empty notes, design topics never written, file notes that have rotted past the verification window. Output is a prioritized punch list — you do not write notes yourself.

## Argument parsing

The user invoked `/binote:clarify [args]`. Parse:

- `--kind=<file|design|notes|feature>` → filter to one note class (default: all classes)
- `--top N` → cap the report at N rows (default: 20)
- `--min-length N` → treat notes with body length < N as effectively empty (default: 40)

## Step 1 — Pull the data

Call `audit_status` MCP tool with `limit: 500` (or the project's note count, whichever is smaller). The response carries `kind`, `contentLength`, `level`, `daysSourceAheadOfNote`, `daysSinceVerified` per note — all that's needed.

If the user passed `--kind`, also call `audit_status` with `kind: "<value>"` to narrow at the source.

## Step 2 — Score gaps

For each note, derive a single gap score plus a category. Categories (a note can have multiple — list all that apply):

1. **EMPTY** — `contentLength < min-length` AND `kind ∈ {file, design, dir}`. (Empty `_notes/`, `_audit/` are normal — skip.)
2. **STALE** — `level === "stale"` (source +30d ahead of note/verify).
3. **UNVERIFIED** — `level === "unverified"` AND `contentLength >= min-length` (note has content but no `lastVerified` stamp ever).
4. **THIN-DESIGN** — `kind === "design"` AND `contentLength < 300` chars. Design docs should be substantive; a short one is a placeholder.
5. **ORPHAN-RISK** — note exists for a source file with high churn (heuristic: skip unless you can check git log; otherwise omit this category).

Gap score (higher = more urgent):

```
score = 0
if EMPTY:        score += 100 - (contentLength * 2)    # 0-char file mirror = 100
if STALE:        score += min(daysSourceAheadOfNote ?? 0, 90)
if UNVERIFIED:   score += 20
if THIN-DESIGN:  score += 60
```

## Step 3 — Render the report

Sort by score descending. Take top N. Print as a grouped table:

```
Coverage gaps (top <N>):

EMPTY file mirrors (<count>):
  src/core/sync-engine.ts.md           0 chars     [run /binote:save against this file]
  src/core/link-index.ts.md            0 chars
  src/cli.ts.md                        0 chars

THIN-DESIGN (<count>):
  _design/architecture.md            280 chars     [split into per-module design docs]

STALE (<count>):
  src/index.ts.md                    +47d drift    [run /binote:verify src/index.ts.md]

UNVERIFIED with content (<count>):
  _notes/depth-expansion.md           verified: never

Suggested next moves:
  1. Pick 3 EMPTY file mirrors, ask the user which to populate (or run /binote:save after working on them).
  2. Run /binote:verify --top 5 on STALE rows.
  3. Decide whether THIN-DESIGN entries need a split — surface to the user.
```

Skip empty categories. Keep the report under ~40 lines — if more rows qualify, append `… and <K> more (rerun with --top <K>)`.

## Step 4 — Do NOT auto-fix

This command produces a report. Do not call `write_note`. Do not call `mark_verified`. The follow-up actions are the user's call — most of them route to other binote commands (`/binote:save`, `/binote:verify`).

## Constraints

- **One `audit_status` call is enough.** Don't read individual notes to recheck content — `contentLength` already covers it.
- **Don't recommend filling a note you have no context for.** Empty notes need a human to articulate WHY the file exists. Surface them; let the user pick the next move.
- **Respect `_constitution.md`.** If `_constitution.md` is itself empty, surface it at the top of the report as a P0 gap regardless of score.
