---
description: "Audit binote notes against current source code. Spawns isolated subagents per note to extract claims and verify them mechanically. Writes audit reports to .binote/_audit/<date>/ — never auto-mutates notes. Triggers on: '/binote:verify'."
---

# Binote Note Verification

You are about to verify a set of binote notes against the current state of the source code. The goal: surface stale claims (incorrect counts, missing files, broken relationships) without rewriting notes automatically. Audit reports are read-only suggestions for the user.

## Argument parsing

The user invoked `/binote:verify [args...]`. Parse:

- A bare note path (e.g. `src/index.ts.md` or `src/index.ts`) → verify that one note
- `--top N` → verify the N most stale notes (default N=5 if `--top` given without value)
- `--all-stale` → verify every note with level `stale`
- No args → behave like `--top 5`

If multiple positional paths are given, treat each as a target.

## Step 1 — Pick targets

If a specific path was given, resolve it via the binote graph (it tolerates fuzzy / [[link]]-style input through `read_note`).

Otherwise, call `audit_status` MCP tool:
- `--top N` → call with `level` unset, take first N from sorted result
- `--all-stale` → call with `level: "stale"` (no limit beyond the tool default; bump `limit` if needed)
- default → `--top 5`

## Step 2 — Spawn one subagent per target IN PARALLEL

For each target note, invoke the `Agent` tool with `subagent_type: general-purpose`. **Send all Agent calls in a single message** so they run concurrently.

Each subagent's prompt MUST be self-contained — the subagent has zero memory of this conversation. Use this template:

> You are auditing a single binote note for staleness. Work mechanically; do not guess.
>
> **Project root**: `<absolute path>`
> **Note path**: `<notePath>` (relative to `.binote/`)
> **Source path** (if applicable): `<sourcePath>` (relative to project root, or `null` for `_dir.md` / `_notes/*.md`)
> **Today's date**: `<YYYY-MM-DD>`
>
> ## Procedure
>
> 1. Call `read_note` with `forwardDepth: 0, backDepth: 0` for the target note. (Do not pull the link graph — it pollutes context.)
> 2. If a source path exists, read it (use `Read` tool).
> 3. Extract every **falsifiable claim** in the note. Categorize each:
>    - `count` — quantitative ("100+ consumers", "3 call sites")
>    - `location` — file or symbol exists ("logRead is defined at...", "uses helper X")
>    - `relationship` — import / call / dependency ("foo.ts imports bar.ts")
>    - `invariant` — semantic rule that cannot be mechanically checked
> 4. Verify each:
>    - `count` → grep, compare ±20% tolerance. Outside tolerance = ❌ stale; suggest patch with the actual number and today's date.
>    - `location` → check file exists; grep the symbol. Missing = ❌ stale.
>    - `relationship` → grep the import / call site. Missing = ❌ stale.
>    - `invariant` → tag as ⚠️ manual-review.
>    - Skip vague prose ("designed for clarity") — not falsifiable, ignore.
> 5. Write the audit report to `.binote/_audit/<YYYY-MM-DD>/<slug>.md` (see format below). Create the directory if it doesn't exist.
> 6. Return EXACTLY this JSON (no prose) as your final output:
>    ```json
>    {"note": "<notePath>", "claims": <int>, "verified": <int>, "stale": <int>, "manual": <int>, "reportPath": "<path>"}
>    ```
>
> ## Report format
>
> ```markdown
> # Audit: <notePath> (<YYYY-MM-DD>)
>
> Source: <sourcePath or "—"> | Note last verified: <ISO or "never"> | Drift: source +<N>d
>
> ## Claims found: <total>
>
> ### ✅ "<claim text>"
> Verified — <evidence: grep result, file:line, etc.>
>
> ### ❌ "<claim text>"
> <reason>. Suggested patch:
> ```diff
> -<original line(s)>
> +<corrected line(s)> (verified <YYYY-MM-DD>)
> ```
>
> ### ⚠️ "<claim text>" (manual-review)
> <why mechanical check is impossible>
>
> ## Verdict
> <N> verified, <M> stale, <K> manual. Recommendation: <one sentence>.
> ```
>
> **Slug rule**: replace `/` with `-` and strip the trailing `.md`. Example: `src/core/scanner.ts.md` → `src-core-scanner-ts.md`.
>
> Do not write or edit the note itself. Do not call `mark_verified`. Just produce the report and return JSON.

## Step 3 — Process results

Once all subagents return:

1. For every note where `stale === 0` (manual-review only is OK), call `mark_verified` MCP tool. Skip if any claim was stale — that note still needs human attention.
2. Print a compact summary to the user:
   ```
   Audited N notes (today's reports → .binote/_audit/<date>/):
   ✅ src/index.ts.md         12 claims, 12 verified            [marked verified]
   ⚠️  src/core/scanner.ts.md  8 claims, 6 verified, 2 stale    [needs review]
   ⚠️  _notes/depth-expansion 4 claims, 2 verified, 2 manual    [marked verified]
   ```
3. Do not dump report content into chat — point the user at the file paths instead.

## Constraints

- **Never write directly to a note from this command.** Patch suggestions live only in audit reports.
- **Never run more than ~10 subagents at once.** If `--all-stale` returns more, batch them or warn the user.
- If a subagent returns invalid JSON or fails, surface the error in the summary; do not call `mark_verified` for that note.
