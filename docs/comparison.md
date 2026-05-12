# Binote vs. Spec-Kit vs. OpenSpec

All three target the same pain — *AI coding agents lack repo-level context* — but they answer it from opposite directions and at different points in the dev loop.

> **One-liner**
> - **Spec-Kit** — *write specs, then generate code*. Forward, feature-start, linear.
> - **OpenSpec** — *propose spec deltas, gate code on review*. Forward, change-start, deltaful.
> - **Binote** — *mirror the repo as a link graph, feed it to the agent before any read*. Bidirectional, continuous, graph.

## Direction of flow

```
                  spec/intent                                   code
Spec-Kit:   /specify → /plan → /tasks → /implement  ───────────►
OpenSpec:   proposal → apply → archive (specs/)     ───────────►
Binote:     code  ◄──── annotations ────►  _design/ ◄──── code
             (runtime truth)     (intent truth)
```

Spec-driven tools treat the spec as **upstream of code** — the PRD generates the implementation. Binote treats notes as a **parallel artifact next to code** — the graph is read-side context, not a code generator.

## Axis-by-axis

| Axis                | Spec-Kit                                 | OpenSpec                                       | Binote                                              |
| ------------------- | ---------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| Primary artifact    | Spec doc, plan, task list                | Change proposal + spec delta (ADDED/MODIFIED/REMOVED) | Link graph mirroring the source tree                |
| Trigger             | Start of a new feature                   | Start of any change                            | Continuous; every file read                         |
| Lifecycle           | Linear: specify → plan → tasks → implement | 3-stage: propose → apply → archive            | None — notes live with code, evolve in place         |
| Topology            | Document tree                            | Document tree + delta markers                  | Bidirectional `[[link]]` graph (forward + back)      |
| Authority on conflict | Spec wins (code serves spec)            | Approved proposal wins                         | Source = runtime truth; `_design/` = intent truth — disagreement is the bug-report |
| Storage             | `.specify/` (or similar) feature dirs    | `openspec/{specs,changes,changes/archive}/`    | `.binote/` mirror tree + `_design/`, `_notes/`, `_audit/` |
| Source of context for agent | Latest spec doc                  | Active proposal + current specs                | Note at the same path as the file the agent is about to read |
| Approval gate       | Implicit (review docs before /implement) | **Explicit** — no codegen until proposal approved | None — read-only context, no gate                |
| Drift handling      | Re-run /specify on the new feature       | New proposal with deltas                       | `staleness` (mtime), `audit_status`, `/binote:verify` reports |
| AI client coupling  | Slash commands + agent integrations      | Slash commands + 20+ assistants                | MCP server (any MCP client) + Claude plugin commands |
| Logs / replayability | —                                       | —                                              | Every `read_note` → `_sessions/<date>.jsonl`        |
| Cross-file primitive | Markdown links / file refs              | Spec IDs + delta markers                       | `[[link]]` — sole reference syntax; resolution is fuzzy + indexed |
| Suits best          | Greenfield builds, large features        | Teams that want a human approval gate on AI changes | Existing codebases that AI agents repeatedly traverse |

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
- Multiple agents (or the same agent across sessions) need shared, evolving project memory.
- You want notes that decay gracefully (stale flags, audits) rather than rot silently.
- You want LLM reads to be **observable** (replayable session logs) for debugging context behavior.

## What they share

- All three live in-repo and version-control alongside source.
- All three use plain markdown, no DB.
- All three are MCP- or slash-command-driven; no servers, no SaaS.
- All three try to make AI output less hallucination-prone by anchoring it to a structured artifact.

## What's distinct about binote

Three architectural choices are non-negotiable and shape everything else:

1. **Path equivalence.** `src/foo.ts ↔ .binote/src/foo.ts.md`. The agent never has to *discover* where a note lives — it's at the path. No search, no convention dance.
2. **`[[link]]` is the only cross-ref.** Resolution, indexing, search, and graph expansion all derive from one syntax. Spec-driven tools allow free-form prose linking; binote forces the graph.
3. **The index is derived.** `_index.json` is a cache, not a source. Delete it; `rebuild_index` reconstructs it from the notes themselves. Nothing in binote is authoritative except notes + source.

A spec-kit or OpenSpec workflow can live happily inside `.binote/_design/` — binote doesn't compete on the spec axis. It competes (or rather, fills a different slot) on the **continuous context retrieval** axis: the thing the agent reads *before* it reads code.

## Composing them

You can run Spec-Kit or OpenSpec **for new features** and Binote **for everything else**:

- New feature → `/speckit.specify ... /speckit.implement` produces code + spec. After implementing, `/binote:save` distills the *decisions* into `_design/<topic>.md` and updates the file annotations.
- Bug fix in existing code → `/binote:mode` first, agent reads notes, fixes the bug, `/binote:save` captures any non-obvious discoveries.
- Refactor → `binote sync` flags orphans; `/binote:verify` audits notes against the new code.

Spec-kit specs answer *what we're building*. Binote answers *what we already built and why*. Different questions; different tools.

## References

- [GitHub Spec-Kit](https://github.com/github/spec-kit) — spec-driven development toolkit
- [Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec) — spec-driven workflow with change proposals
- [`_design/architecture.md`](../.binote/_design/architecture.md) — binote's own design authority (read it via `read_note`, not directly)
