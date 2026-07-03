# Binote

Bidirectional-linked project memory for AI coding agents. Mirrors your codebase into `.binote/` with `[[wiki-style links]]`, so an agent can pull the *why* of a file — design intent, module contracts, prior decisions — **before** it ever opens the source.

> Spec-driven tools (spec-kit, OpenSpec) push **spec → code**.
> Binote goes the other way: **code ↔ notes**, a persistent context substrate that lives in the repo.
> See [docs/comparison.md](docs/comparison.md) for a side-by-side.

## Why

LLMs read code line-by-line; they don't read repos. They lack the cross-file context a human gets from tribal knowledge, ADRs, and architecture docs. Binote stores that context as a *graph* mirrored against the source tree, so the agent finds it in O(1) hops — `src/foo.ts` always has its note at `.binote/src/foo.ts.md`.

Three things fall out of this:

- **No discovery cost.** Path equivalence means the agent never searches for notes.
- **One reference primitive.** `[[link]]` is the *only* cross-reference syntax — resolution, search, and graph traversal all derive from it.
- **Context-frugal by default.** Graph reads inline the requested note in full and every linked note as a compact excerpt (markdown, not JSON) — the agent drills into exactly the neighbours it needs.

## How it works

```
myproject/
├── src/
│   ├── index.ts
│   └── utils/helpers.ts
├── .binote/                    ← generated, lives in repo
│   ├── _constitution.md        ← project-wide invariants (highest authority)
│   ├── _dir.md                 ← root overview
│   ├── _design/                ← module design authority (intended truth)
│   │   └── architecture.md
│   ├── _features/              ← in-flight feature workspaces
│   │   └── 001-add-x/
│   │       ├── _dir.md
│   │       ├── spec.md         ← what + why
│   │       ├── plan.md         ← how + [[link]]'d touch set
│   │       └── tasks.md        ← ordered, parallelizable work
│   ├── _notes/                 ← ADRs, cross-cutting decisions
│   ├── _audit/<date>/          ← /binote:verify + /binote:analyze reports
│   ├── _index.json             ← derived link graph (gitignored)
│   └── src/
│       ├── _dir.md             ← directory overview
│       ├── index.ts.md         ← annotation for src/index.ts
│       └── utils/helpers.ts.md
```

Notes are plain markdown with `[[bidirectional links]]`:

```markdown
# src/index.ts

Entry point. Orchestrates [[src/utils/helpers.ts]] and follows [[_design/architecture.md]].
```

`read_note(notePath, forwardDepth: 1)` returns the note in full **plus every linked note as an excerpt** (description + first paragraph + heading outline + a `links:` nav line) — the recommended default when entering a file. Drill into a specific neighbour with a follow-up read; `detail: "full"` inlines whole bodies when you really want them.

## Authority hierarchy

When two sources disagree, the higher rank wins — or, more usefully, the disagreement *is* the bug-report:

| Rank | Kind                                | Answers                                |
| ---- | ----------------------------------- | -------------------------------------- |
| 0    | `_constitution.md`                  | project-wide invariants (bedrock)      |
| 1    | Source code                         | what *runs*                            |
| 1    | `_design/<topic>.md`                | module intent — what *should be*       |
| 2    | `_features/<NNN-slug>/spec.md`      | feature-scoped intent (in-flight work) |
| 3    | `<dir>/_dir.md`, `<file>.md`        | module / per-file context              |
| 4    | `_notes/<topic>.md`                 | ADRs, decisions                        |
| 5    | `_audit/<date>/*.md`                | historical snapshot                    |

`_constitution.md` outranks everything else — it's the project's bedrock and is loaded into context whenever `/binote:mode` activates. `_design/` and source code tie at rank 1: code answers *"what runs"*, `_design/` answers *"what was intended at the module level"*. When they diverge, surface the gap — don't silently follow either.

## Feature workflow

Binote ships a forward workflow that lives **inside the link graph** — every spec, plan, and task is a node, every plan must `[[link]]` the files it will touch:

```
/binote:feature add ignore command     ← scaffold _features/001-add-ignore-command/
   ↓
edit spec.md                           ← human writes problem / goal / success criteria
   ↓
/binote:plan _features/001-…           ← agent derives touch set, drafts approach,
                                          [[link]]'s every file the change will hit
   ↓
/binote:tasks _features/001-…          ← topological-sort into T001..T_NNN with
                                          [P] parallel-safe markers + acceptance criteria
   ↓
execute (manually or via parallel subagents)
   ↓
/binote:save                           ← distill what was learned back into notes
```

Unlike spec-kit's isolated `.specify/` folder, the touch set in `plan.md` is a real `[[link]]` set — the plan becomes part of the binote graph and is audited by `/binote:verify` and `/binote:analyze` like any other note.

## Staleness, verification, audit

Every note carries an implicit drift signal:

- source change time vs note change time — has the file changed since the note was written? Change times are **git-aware**: last commit touching the path (survives `git checkout`/`clone`, which rewrite mtimes), falling back to fs mtime for dirty/untracked files and non-git projects.
- `lastVerified` (frontmatter) — has a human/agent re-confirmed the note?

Derived level: `fresh | warning | stale | unverified`. `read_note` attaches `staleness` to any node above `fresh`. The `audit_status` tool ranks notes by drift severity. `/binote:verify` spawns parallel subagents that extract falsifiable claims from each note, grep them against source, and write read-only reports to `_audit/<date>/` — never mutating notes automatically.

## Install

```bash
npm install -g binote
```

## Setup

### Claude Code plugin (recommended)

```
/plugin marketplace add Guxi11/binote
/plugin install binote
```

Brings both MCP tools and slash commands.

### Claude Code, MCP only

```bash
claude mcp add binote -- binote
```

MCP tools without slash commands.

### Other MCP clients

```json
{
  "mcpServers": {
    "binote": { "command": "binote" }
  }
}
```

Works in Claude Desktop, any MCP-compliant client.

### Local dev

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Slash commands

| Command            | Purpose                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------- |
| `/binote:mode`     | Activate binote-first mode in the current conversation. Loads `_constitution.md` + reads notes before source. |
| `/binote:rule`     | Emit a `CLAUDE.md` snippet for always-on binote-first behavior.                               |
| `/binote:save`     | Distill the current session's learnings into notes (decisions → `_design/`, invariants → `_constitution.md`). |
| `/binote:feature`  | Scaffold `_features/<NNN-slug>/` with `spec.md / plan.md / tasks.md / _dir.md` stubs.         |
| `/binote:plan`     | Read a feature's `spec.md`, derive the touch set with `[[link]]`s, write `plan.md`.           |
| `/binote:tasks`    | Decompose `plan.md` into an ordered `tasks.md` with `[P]` parallel markers + acceptance.      |
| `/binote:verify`   | Audit notes against current source via parallel subagents. Writes reports to `_audit/`.       |
| `/binote:clarify`  | Find coverage gaps — demand-ranked missing mirrors, orphan notes, empty mirrors, thin design docs, drifted notes. |
| `/binote:analyze`  | Cross-note consistency: do dependents respect `_constitution.md` / `_design/` invariants?     |
| `/binote:ignore`   | Append binote's private artifacts (cache, logs, audits) to `.gitignore`.                      |

## MCP tools

| Tool             | Purpose                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `init`           | Scaffold `.binote/` from project tree (gitignore-aware scan). Idempotent. |
| `read_note`      | Graph read: root in full, linked/backlinked nodes as excerpts (`detail: "full"` opts out). Markdown output. |
| `write_note`     | Create/update a note. Invalidates the index.                             |
| `search`         | Relevance-ranked full-text search (fuzzy, path/heading-boosted); hits carry scores + resolved `[[links]]`. `regex: true` for exact line scans. |
| `sync`           | Detect orphaned notes (source deleted, mirror survives). No rename guess. |
| `rebuild_index`  | Force `_index.json` rebuild without LLM token cost. Use after bulk writes. |
| `audit_status`   | Report stale/unverified notes ranked by drift (git-aware).               |
| `knowledge_gaps` | Demand-ranked gaps: missing mirrors (dangling targets that are real files, by inbound refs) + orphan notes (zero backlinks). |
| `mark_verified`  | Stamp `lastVerified: <ISO>` into a note's frontmatter.                   |
| `ignore`         | Append private artifacts to `.gitignore`. Idempotent.                    |
| `list_notes`     | Enumerate notes (no content read).                                       |

## CLI

Same surface as MCP tools — anything the server can do, the CLI can do:

```bash
binote init     [--root D]
binote list     [--root D]
binote read     <notePath>... [--from N] [--to M] [--lines N:M] [--root D]
binote write    <notePath> <content> [--root D]
binote links    <notePath> [--detail] [--root D]
binote search   <query> [--regex] [--max N] [--context N] [--root D]
binote resolve  <target> [--root D]
binote dangling [--root D]
binote sync     [--dry-run] [--root D]
binote ignore   [--root D]
```

No arguments → starts the MCP server (stdio transport).

## `[[link]]` resolution

Strategies tried in order — defined in `src/core/binote-paths.ts`:

1. **exact**     — `<target>.md` exists
2. **as-is**     — already ends in `.md` or lives under `_notes/`
3. **dir**       — `<target>/_dir.md` exists
4. **basename**  — unique basename across all notes (ambiguous → unresolved)
5. **substring** — case-insensitive basename substring (typo recovery)

Prefer full project-relative paths: `[[src/core/scanner.ts]]`, not `[[scanner]]`. Bare basenames silently drop when ambiguous.

## Workflow

**Setup (once per project)**

1. `binote init` (or `init` MCP tool) — scaffold empty notes mirroring source.
2. `/binote:ignore` — gitignore the private artifacts.
3. Draft `_constitution.md` (project-wide invariants) — `/binote:save` can extract it from existing notes.

**Every session**

4. `/binote:mode` at conversation start — loads constitution, tells Claude to read notes before code.
5. Work normally. When something non-obvious is learned, run `/binote:save` to capture it.

**For non-trivial changes (the forward workflow)**

6. `/binote:feature <desc>` → edit `spec.md` → `/binote:plan <slug>` → `/binote:tasks <slug>` → execute → `/binote:save`.

**Maintenance**

7. After a refactor, `binote sync` finds orphans.
8. `/binote:clarify` finds coverage gaps; `/binote:verify` audits drifted notes against source; `/binote:analyze` checks cross-note consistency.

## Design principles

- **Plain markdown.** Human-readable, editable, diffable.
- **No database.** `_index.json` is a derived cache; delete it freely and `rebuild_index` reconstructs from notes.
- **No `_meta/` shadow tree.** Frontmatter (`lastVerified` only) is the sole durable per-note metadata; everything else is computed on demand.
- **Backlinks opt-in.** `backDepth: 0` is the default; set 1 for "who depends on me". `_audit/` reports are excluded from the link graph so backlinks stay signal, not noise.
- **Mixed authorship.** Humans and agents both write notes. `_design/` outranks file annotations on conflict.
- **Non-code filtered.** JSON, YAML, lockfiles, images aren't mirrored. The ignore list lives in `binote-paths.ts`.

## What it deliberately is not

- Not an approval gate. Spec-kit and OpenSpec gate code on docs; binote has a forward workflow (`/binote:feature` → `plan` → `tasks`) but **no approval step** — every artifact is advisory context, not a release block. See [docs/comparison.md](docs/comparison.md).
- Not a rename detector. Renames are a write-time concern handled by the agent; `sync` only detects deletions.
- Not multi-project. Each `.binote/` is its own world.

## License

MIT
