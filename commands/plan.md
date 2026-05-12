---
description: "Generate or refine plan.md for a feature folder. Reads spec.md, derives the touch set with [[links]] to every file the change will hit, drafts the approach. Triggers on: '/binote:plan _features/<NNN>-<slug>'."
---

# Binote — Author Feature Plan

You are filling `_features/<NNN-slug>/plan.md` based on `spec.md` and the current code graph. The plan's defining property: **every file the change will touch must appear as a `[[link]]`**. That makes the plan a first-class node in the binote graph and gives `/binote:verify` something to audit later.

## Argument parsing

The user invoked `/binote:plan <feature-path>`. Resolve:
- `_features/001-foo` → operates on that folder
- `_features/001-foo/plan.md` → same folder (strip the file)
- bare `001-foo` or `foo` → search `_features/*` for a unique match; if ambiguous, ask once

If no arg given, call `list_notes`, filter to `_features/*/spec.md`, pick the most recently modified — confirm with the user before proceeding.

## Step 1 — Load context

Call `read_note` once with `notePaths: ["_features/<NNN>-<slug>/spec.md", "_features/<NNN>-<slug>/plan.md", "_constitution.md", "_design/architecture.md"]`, `forwardDepth: 1`.

If `spec.md` is still the stub template (no real content under Problem/Goal), stop and tell the user to fill spec.md first.

## Step 2 — Derive the touch set

The touch set is every file this change will create, modify, or delete. Identify it by:

1. **Grep the spec** for any file paths or module names mentioned.
2. **Grep the codebase** for keywords from the spec (function names, identifiers, error messages). Use the `Grep` tool over `src/`.
3. **Walk the design**: read every `[[link]]` target from `_design/architecture.md` that's relevant to the spec's domain.
4. **Mirror notes**: for every source file in the touch set, the touch set also includes its `<path>.md` note (because the note will need updating after the change).

Build the list as `<role> [[<note-path>]]` pairs, where role is one of: `create`, `modify`, `delete`, `update-note`.

Example:
```
- modify [[src/core/sync-engine.ts]] — extend orphan detection to skip _features/
- modify [[src/core/binote-paths.ts]] — broaden isStandaloneNote
- update-note [[src/core/sync-engine.ts.md]] — document new behavior
- create [[_design/sync.md]] — sync-specific design doc, split off from architecture
```

## Step 3 — Draft the plan body

Replace the placeholders in `plan.md`. Sections (preserve order):

### Touch set
The pairs from step 2. If the list exceeds ~15 files, group by module and warn the user the scope may be too large for one feature — suggest splitting.

### Approach
3–6 bullets on **how**, not **what**. Each bullet states a design decision, not a step. Tasks come from `/binote:tasks` later.

### Risks
Concrete failure modes and mitigations:
- "Sync may mark `_features/` as orphan → fix in binote-paths.ts before touching sync-engine.ts (ordering matters)."
- "[[link]] resolver may break on `_features/<NNN>/` paths if X — verified via Y."

### Out of scope
Work explicitly deferred. Note: nothing here should appear in the touch set.

### Links
Always at the bottom:
- `[[_features/<NNN>-<slug>/spec.md]]`
- `[[_constitution.md]]`
- Every authoritative design doc consulted: `[[_design/architecture.md]]`, etc.

## Step 4 — Write back

Call `write_note` for `_features/<NNN>-<slug>/plan.md` with the drafted content. **Do not** pass `createOnly: true` — refining an existing plan is a normal flow.

Call `rebuild_index` afterwards so the new `[[links]]` resolve immediately.

## Step 5 — Report

Print exactly:

```
Plan written: _features/<NNN>-<slug>/plan.md
  touch set: <N> files (<C> create, <M> modify, <D> delete, <U> update-note)
  authority consulted: _constitution.md, <design docs>
  open risks: <count>

Next: `/binote:tasks _features/<NNN>-<slug>` to break this into ordered work.
```

## Constraints

- **Do not write code.** A plan is structure for a future change, not the change itself.
- **Do not invent files.** Every `[[link]]` in the touch set must resolve to an existing path OR be marked explicitly as `create`.
- **Do not duplicate `_design/`.** If a section of the plan starts looking like architecture, route it to `_design/<topic>.md` (see [[commands/save.md]]) and link from the plan.
- **Respect the constitution.** Before finalizing, re-read `_constitution.md` and confirm no invariant is being broken. If one is, surface it as a Risk before proceeding.
