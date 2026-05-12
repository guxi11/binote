---
description: "Scaffold a new feature folder under .binote/_features/<NNN-slug>/ with spec.md / plan.md / tasks.md / audit.md stubs. Triggers on: '/binote:feature <description>'."
---

# Binote — Scaffold Feature Folder

You are creating a feature workspace inside `.binote/_features/`. The folder groups spec → plan → tasks → audit for a single in-flight change so it lives inside the binote link graph rather than as scattered notes.

## Argument parsing

The user invoked `/binote:feature [description...]`. The description is a short human phrase like "add multi-project federation" or "rewrite the sync engine".

- If no description was given, ask **once** for it (single most critical question), then proceed.
- Slugify the description: lowercase, keep alphanumerics, replace spaces with `-`, collapse repeats, cap at 40 chars. Example: "Add multi-project federation" → `add-multi-project-federation`.

## Step 1 — Pick the feature number

1. Call `list_notes` MCP tool.
2. Filter to paths matching `_features/(\d{3})-`.
3. Take the max integer found; new number = max + 1, zero-padded to 3 digits. If none exist, start at `001`.
4. Final folder: `_features/<NNN>-<slug>/`.

## Step 2 — Write four stub notes IN PARALLEL via `write_note`

Use `createOnly: true` for all four so re-runs don't clobber edits.

### `_features/<NNN>-<slug>/spec.md`

```markdown
# Spec: <Human description>

> What this change should do and why. Update before writing plan.md.

## Problem
<one paragraph: what is broken / missing / friction-causing today>

## Goal
<one paragraph: the desired end state after this feature lands>

## Non-goals
- <thing this feature explicitly will not do>

## Constraints
- Must respect [[_constitution.md]] invariants.
- <any other constraints: perf, compat, deadlines>

## Success criteria
- [ ] <observable test the feature has landed>
- [ ] <observable test the feature is correct>

## Open questions
- <questions to resolve before plan.md is written>
```

### `_features/<NNN>-<slug>/plan.md`

```markdown
# Plan: <Human description>

> How spec.md gets built. Fill via `/binote:plan _features/<NNN>-<slug>`.

## Touch set
<files this change will create / modify / delete — populated by /binote:plan with [[links]]>

## Approach
<3–6 bullets on the technical approach>

## Risks
<what could go wrong, and the mitigation>

## Out of scope
<work explicitly deferred to a future feature>

## Links
- [[_features/<NNN>-<slug>/spec.md]]
- [[_constitution.md]]
```

### `_features/<NNN>-<slug>/tasks.md`

```markdown
# Tasks: <Human description>

> Ordered, parallelizable task list derived from plan.md. Fill via `/binote:tasks _features/<NNN>-<slug>`.

- [ ] T001 — <task>
- [ ] T002 — <task>

## Links
- [[_features/<NNN>-<slug>/plan.md]]
```

### `_features/<NNN>-<slug>/_dir.md`

```markdown
# _features/<NNN>-<slug>

Feature workspace for: <Human description>

Status: spec drafted

- [[_features/<NNN>-<slug>/spec.md]] — what + why
- [[_features/<NNN>-<slug>/plan.md]] — how
- [[_features/<NNN>-<slug>/tasks.md]] — ordered work
- [[_features/<NNN>-<slug>/audit.md]] — post-landing audit (created on close)
```

## Step 3 — Refresh index

Call `rebuild_index` MCP tool so the new `[[links]]` resolve immediately.

## Step 4 — Report

Print exactly:

```
Feature scaffolded: _features/<NNN>-<slug>/
  spec.md   — fill the Problem / Goal / Success criteria
  plan.md   — run `/binote:plan _features/<NNN>-<slug>` after spec is solid
  tasks.md  — run `/binote:tasks _features/<NNN>-<slug>` after plan is solid

Next: edit spec.md, then `/binote:plan _features/<NNN>-<slug>`.
```

## Constraints

- **Do not write code yet.** This command produces note scaffolding only.
- **Do not pre-fill the problem statement** from chat history — let the user articulate it themselves in spec.md. The folder is the gift; the thinking is theirs.
- **Use `createOnly: true`** so re-running on an existing slug is a no-op, not a clobber.
