---
description: "Cross-artifact consistency check: do _design/ invariants match file notes? Do _notes/ ADRs contradict current _design? Spawns parallel subagents per design doc. Triggers on: '/binote:analyze [path]'."
---

# Binote — Cross-Note Consistency Audit

You are checking whether the binote graph is internally consistent — separate from [[commands/verify.md]] which checks notes against code. This command checks notes against **each other**: design authority vs file annotations, ADRs vs current design, constitution vs the rest.

The output is a report of inconsistencies. You do not auto-fix.

## Argument parsing

The user invoked `/binote:analyze [path]`. Parse:

- No arg → audit every `_design/*.md` plus `_constitution.md` (full sweep).
- A `_design/*.md` path → audit just that design doc against its dependents.
- A `_features/*/plan.md` path → audit the plan against design + constitution.

## Step 1 — Collect authorities and dependents

Authorities (in rank order, highest first):
1. `_constitution.md`
2. `_design/<topic>.md` for the target (or all `_design/*.md` for a sweep)

For each authority, the **dependents** are every note that links to it. Use the link-index via `read_note` with `backDepth: 1, forwardDepth: 0` on the authority. The `backlinked` array is the dependent set.

Stop early if any authority is empty — there's nothing to check against. Surface that as the first gap.

## Step 2 — Spawn one subagent per authority IN PARALLEL

For each authority + its dependents, invoke `Agent` with `subagent_type: general-purpose`. **Send all Agent calls in one message** so they run concurrently. Cap at ~6 concurrent subagents — batch if more.

Each subagent prompt (self-contained):

> You are auditing one binote authority document against the notes that link to it.
>
> **Project root**: `<absolute path>`
> **Authority**: `<authority note path>` (e.g. `_design/architecture.md`)
> **Dependents**: <comma-separated list of note paths that link to authority>
> **Today**: `<YYYY-MM-DD>`
>
> ## Procedure
>
> 1. Call `read_note` with `notePath: "<authority>", forwardDepth: 0, backDepth: 0` — get the authority's full body.
> 2. Extract every **invariant** stated in the authority: numbered rules, "must / never / always" sentences, tables that declare contracts (e.g. authority hierarchy, note kinds, tool signatures).
> 3. For each dependent (batch via `read_note` with `notePaths: [...]`, `forwardDepth: 0`):
>    - Search the dependent body for claims that touch each invariant.
>    - Classify: ✅ consistent, ❌ contradicts, ⚠️ silent (invariant relevant but not mentioned).
> 4. Also check: does any dependent **claim authority** over the same scope (e.g. another `_design/` doc that overlaps)? Authority overlap is a smell.
> 5. Write the report to `.binote/_audit/<YYYY-MM-DD>/analyze-<authority-slug>.md` (see format below).
> 6. Return EXACTLY this JSON (no prose):
>    ```json
>    {"authority": "<path>", "invariants": <int>, "dependents": <int>, "contradictions": <int>, "silent": <int>, "overlaps": <int>, "reportPath": "<path>"}
>    ```
>
> ## Report format
>
> ```markdown
> # Analyze: <authority> (<YYYY-MM-DD>)
>
> Dependents audited: <list>
>
> ## Invariants found: <total>
>
> ### "<invariant text>"
> - ✅ `<dependent>` consistent — <evidence: matching sentence>
> - ❌ `<dependent>` contradicts — <quote the contradicting sentence>
>   Suggested resolution: <which side should change>
> - ⚠️ `<dependent>` silent (relevant scope but no mention)
>
> ## Authority overlaps
> - `<other authority>` covers <topic> — clarify which doc owns this scope.
>
> ## Verdict
> <N> invariants, <C> contradictions, <S> silent, <O> overlaps.
> Recommendation: <one sentence>.
> ```
>
> **Slug rule**: strip leading `_`, replace `/` with `-`, drop trailing `.md`. Example: `_design/architecture.md` → `design-architecture`.
>
> Do not edit any note. Just produce the report and return JSON.

## Step 3 — Aggregate

Once all subagents return, print a compact roll-up:

```
Analyzed <N> authorities (reports → .binote/_audit/<date>/analyze-*.md):

✅ _constitution.md       11 invariants, 0 contradictions, 2 silent
⚠️  _design/architecture   9 invariants, 1 contradiction in src/index.ts.md
                                                    1 overlap with _features/004-foo/plan.md

Action items:
  1. Resolve src/index.ts.md contradiction (see report).
  2. Decide whether _features/004-foo/plan.md should defer to architecture or split scope.
```

## Constraints

- **Authority outranks dependent.** When a contradiction surfaces, the default suggestion is to update the dependent — but only when the authority is itself current. If `_design/` is `stale` per `audit_status`, surface that ambiguity instead.
- **Don't conflate code-drift with note-drift.** `/binote:verify` already covers code-vs-note. This command is note-vs-note only.
- **Cap parallel subagents at 6.** More than that and the link index reads contend.
- **Reports go to `_audit/`, never edit authorities directly.** Contradictions are advisory until a human picks a side.
