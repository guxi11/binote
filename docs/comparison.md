# Binote vs. Spec-Kit vs. OpenSpec

All three target the same pain — *AI coding agents lack repo-level context* — but they answer it from different directions and at different points in the dev loop.

> **One-liner**
> - **Spec-Kit** — *write specs in an isolated folder, then generate code*. Forward, feature-start, linear, docs-only.
> - **OpenSpec** — *propose spec deltas, gate code on human review*. Forward, change-start, deltaful, gated.
> - **Binote** — *mirror the repo as a link graph; specs / plans / tasks live as nodes in that graph alongside annotations*. Bidirectional, continuous, graph-anchored, ungated.

## Direction of flow

```
                  spec/intent                                                  code
Spec-Kit:   /specify → /plan → /tasks → /implement  ─────────────────────────►
OpenSpec:   proposal → apply → archive (specs/)     ─────────────────────────►
Binote:     code ◄──── annotations ────►  _design/  ◄──── code
                       (runtime truth)    (module intent)
                                ▲
                                │  /binote:feature → /binote:plan → /binote:tasks
                                │  (forward workflow, but every plan [[link]]s
                                │   into the same graph)
                                │
                          _constitution.md  (project-wide invariants — bedrock)
```

Spec-driven tools treat the spec as **upstream of code in a separate world** — the PRD lives in `.specify/` or `openspec/` and references files by string path. Binote keeps the same forward motion but **anchors every artifact to the link graph**: a `plan.md` is a node, every file it touches is a `[[link]]`, and `/binote:verify` audits it like any other note.

## Axis-by-axis

| Axis                | Spec-Kit                                 | OpenSpec                                       | Binote                                              |
| ------------------- | ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Primary artifact    | Spec doc, plan, task list                | Change proposal + spec delta (ADDED/MODIFIED/REMOVED) | Link graph mirroring source + spec/plan/tasks as graph nodes |
| Forward workflow    | `/specify → /plan → /tasks → /implement` | `propose → apply → archive`                    | `/binote:feature → /binote:plan → /binote:tasks` — same shape, but every plan `[[link]]`s its touch set into the graph |
| Trigger             | Start of a new feature                   | Start of any change                            | Continuous (every file read) **+** explicit feature trigger |
| Lifecycle           | Linear, one-shot per feature             | 3-stage: propose → apply → archive             | Continuous notes + per-feature `_features/<NNN-slug>/` folder retired after landing |
| Topology            | Document tree                            | Document tree + delta markers                  | Bidirectional `[[link]]` graph (forward + back); specs / plans live IN the graph |
| Authority on conflict | Spec wins (code serves spec)            | Approved proposal wins                         | `_constitution.md` > {source code, `_design/`} > `_features/spec.md` > file annotations > ADRs. Code-vs-design ties are surfaced, not reconciled. |
| Project-wide invariants | Implicit in PRD prose                | Implicit in approved specs                     | Explicit: `_constitution.md` is loaded at every `/binote:mode` activation regardless of token cost |
| Storage             | `.specify/specs/<feature>/`              | `openspec/{specs,changes,changes/archive}/`    | `.binote/` mirror tree + `_constitution.md` + `_design/` + `_features/<NNN-slug>/` + `_notes/` + `_audit/` |
| Spec ↔ code linkage | String paths in prose                    | Spec IDs + delta markers                       | `[[link]]` — plan.md's touch set IS the audit trail; broken links surface via `/binote:analyze` |
| Source of context for agent | Latest spec doc                  | Active proposal + current specs                | Note at the same path as the file the agent is about to read (path equivalence) |
| Approval gate       | Implicit (review docs before /implement) | **Explicit** — no codegen until proposal approved | None — every artifact is advisory context, not a release block |
| Drift handling      | Re-run /specify on the new feature       | New proposal with deltas                       | `staleness` (mtime + frontmatter), `audit_status`, `/binote:verify` (code↔note), `/binote:analyze` (note↔note) |
| Coverage analysis   | —                                       | —                                              | `/binote:clarify` surfaces empty file mirrors, thin design docs, unverified content |
| AI client coupling  | Slash commands + agent integrations      | Slash commands + 20+ assistants                | MCP server (any MCP client) + Claude plugin commands |
| Logs / replayability | —                                       | —                                              | Every `read_note` → `_sessions/<date>.jsonl`        |
| Cross-file primitive | Markdown links / file refs              | Spec IDs + delta markers                       | `[[link]]` — sole reference syntax; resolution is fuzzy + indexed |
| Suits best          | Greenfield builds, large features        | Teams that want a human approval gate on AI changes | Existing codebases AI agents traverse continuously — and feature work that must stay anchored to that codebase |

## When each is the right tool

### Use Spec-Kit when
- You're starting a new feature or service and want the spec to *drive* code generation.
- Your team treats PRDs as the source of truth and wants the agent to obey them.
- Greenfield work where there's no existing context to preserve.

### Use OpenSpec when
- Your team wants an explicit **approval gate** between human intent and AI codegen.
- Changes are large enough to deserve a delta proposal, but small enough that a full Spec-Kit cycle is overkill.
- You need traceability of *what was approved* vs *what shipped* (archived deltas under `openspec/specs/`).

### Use Binote when
- You have an **existing codebase** and the agent loses time re-deriving design intent on every session.
- You want a forward feature workflow that lives **inside** your code graph (every `plan.md` `[[link]]`s the files it touches; `/binote:analyze` checks consistency against `_constitution.md` and `_design/`).
- Multiple agents (or the same agent across sessions) need shared, evolving project memory.
- You want notes that decay gracefully (stale flags, audits) rather than rot silently.
- You want LLM reads to be **observable** (replayable session logs) for debugging context behavior.
- You don't need a hard approval gate — advisory artifacts are enough.

## What they share

- All three live in-repo and version-control alongside source.
- All three use plain markdown, no DB.
- All three are MCP- or slash-command-driven; no servers, no SaaS.
- All three try to make AI output less hallucination-prone by anchoring it to a structured artifact.

## What's distinct about binote

Four architectural choices shape everything else:

1. **Path equivalence.** `src/foo.ts ↔ .binote/src/foo.ts.md`. The agent never has to *discover* where a note lives — it's at the path. No search, no convention dance.
2. **`[[link]]` is the only cross-ref.** Resolution, indexing, search, and graph expansion all derive from one syntax. Spec-driven tools allow free-form prose linking; binote forces the graph.
3. **The index is derived.** `_index.json` is a cache, not a source. Delete it; `rebuild_index` reconstructs it from notes. Nothing is authoritative except notes + source.
4. **Forward workflow lives inside the graph.** `_features/<NNN-slug>/{spec,plan,tasks}.md` are graph nodes. A plan's touch set is a real `[[link]]` set, so `/binote:analyze` can mechanically check whether a plan respects `_constitution.md` and `_design/<topic>.md`. Spec-kit specs reference files by string and have no equivalent.

The result: binote is the only one of the three where the spec, the design authority, the code annotations, and the audit reports all live in **one** graph and can be cross-checked mechanically.

## Composing them

You can still run Spec-Kit or OpenSpec **for new features** if you want their specific ergonomics, and use Binote **as the substrate**:

- **Spec-Kit + Binote** — run `/speckit.specify … /speckit.implement` to generate code, then `/binote:save` distills the spec's *decisions* into `_design/<topic>.md` and stamps file annotations. The spec-kit folder is throwaway; binote keeps the memory.
- **OpenSpec + Binote** — keep OpenSpec's approval gate for risky changes; binote handles continuous context + post-merge audit. Once a proposal is archived, `/binote:save` extracts the decisions.
- **Binote alone** — for codebases where the team is already comfortable with advisory artifacts, the `/binote:feature → plan → tasks` loop covers the same forward motion without an extra tool.

Spec-kit and OpenSpec answer *what we're building*. Binote answers *what we already built, what we intend to build next, and how the two relate* — and keeps the answer in one graph.

## References

- [GitHub Spec-Kit](https://github.com/github/spec-kit) — spec-driven development toolkit
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — spec-driven workflow with change proposals
- [`_design/architecture.md`](../.binote/_design/architecture.md) — binote's own design authority (read it via `read_note`, not directly)
