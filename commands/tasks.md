---
description: "Break plan.md into an ordered, parallelizable task list. Each task names files, completion criteria, dependencies. Triggers on: '/binote:tasks _features/<NNN>-<slug>'."
---

# Binote — Derive Feature Task List

You are deriving `_features/<NNN-slug>/tasks.md` from `plan.md`. Tasks are the unit of execution; they must be small enough that one agent can complete one task without further planning.

## Argument parsing

Same as [[commands/plan.md]] — accept `_features/<NNN>-<slug>` (or any prefix that resolves uniquely). If no arg, pick the most recently modified `_features/*/plan.md` and confirm.

## Step 1 — Load context

`read_note` with `notePaths: ["_features/<NNN>-<slug>/plan.md", "_features/<NNN>-<slug>/spec.md"]`, `forwardDepth: 1`.

If `plan.md` still has the placeholder `<files this change will create / modify / delete>`, stop and tell the user to run `/binote:plan` first.

## Step 2 — Decompose

For each entry in the plan's **Touch set**, produce one or more tasks. A task is:

```
- [ ] T<NNN> [P?] — <imperative verb phrase>
  - file: [[<note-path>]]
  - done when: <falsifiable acceptance check>
  - depends on: <T-id> | none
```

Rules:

- **`[P]` marker** means parallel-safe: this task only touches files no other open task touches. Mark it `[P]` only when **all** dependencies are landed AND no other task in the list writes the same file.
- **Numbering** is monotonic from `T001`. Renumbering is allowed when re-running this command — preserve completion state by matching on "done when" text, not by id.
- **Acceptance** must be mechanically checkable. "works correctly" is not acceptance. "tsc passes && `npx binote audit_status --kind=design` shows no stale" is acceptance.
- **Granularity**: each task should be doable in one focused edit pass. If a task touches >3 files, split it.

## Step 3 — Order the tasks

1. Topological sort by `depends on`.
2. Within each topological layer, group by file: tasks touching the same file go consecutive (avoid context switches).
3. Mark every task in a layer that has no remaining dependency with `[P]`.

## Step 4 — Add a header section

Before the task list, write:

```markdown
# Tasks: <Human description>

Total: <N> tasks (<P-count> parallel-safe). Estimated touch set: <files from plan>.

Run order: complete non-`[P]` tasks sequentially; `[P]` batches can be fanned out to parallel agents.
```

## Step 5 — Write back + refresh

`write_note` for `_features/<NNN>-<slug>/tasks.md`. Then `rebuild_index`.

## Step 6 — Report

Print exactly:

```
Tasks derived: _features/<NNN>-<slug>/tasks.md
  T001..T<NNN>  (<P-count> parallel-safe)
  first layer:  T001, T002, T003  (no dependencies, safe to start)

Execute the first layer (or fan out parallel-safe tasks to subagents). After each task, edit tasks.md to flip `[ ]` to `[x]`.
```

## Constraints

- **Do not execute the tasks.** This command produces the work list; doing the work is a separate decision.
- **Preserve checkbox state.** When re-running, match existing tasks by "done when" string and copy their `[x]` state forward.
- **Do not invent dependencies between unrelated files.** Two tasks touching unrelated files are parallel-safe even if they're conceptually linked.
- **Cross-reference back.** Every task that mutates a source file must list the corresponding `<path>.md` note as a follow-up task (or fold the note update into the same task). Stale notes are debt.
