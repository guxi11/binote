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
- **Reads are observable.** Every `read_note` call is logged to `.binote/_sessions/<date>.jsonl`, so an LLM session is replayable.

## How it works

```
myproject/
├── src/
│   ├── index.ts
│   └── utils/helpers.ts
├── .binote/                    ← generated, lives in repo
│   ├── _dir.md                 ← root overview
│   ├── _design/                ← design authority (intended truth)
│   │   └── architecture.md
│   ├── _notes/                 ← ADRs, cross-cutting decisions
│   ├── _audit/<date>/          ← /binote:verify reports (non-authoritative)
│   ├── _sessions/<date>.jsonl  ← read logs (gitignored)
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

`read_note(notePath, forwardDepth: 1)` returns the note **and** all linked notes in one call — the recommended default when entering a file.

## Authority hierarchy

When two sources disagree, the higher rank wins — or, more usefully, the disagreement *is* the bug-report:

| Rank | Kind                              | Answers                |
| ---- | --------------------------------- | ---------------------- |
| 1    | Source code                       | what *runs*            |
| 1    | `_design/<topic>.md`              | what *should be*       |
| 2    | `<dir>/_dir.md`                   | module-level overview  |
| 3    | `<file>.md` annotation            | per-file context       |
| 3    | `_notes/<topic>.md`               | ADRs, decisions        |
| 4    | `_audit/<date>/*.md`              | historical snapshot    |

`_design/` and source code are **both** authority-1: code answers *"what runs"*, `_design/` answers *"what was intended"*. When they diverge, surface the gap — don't silently follow either.

## Staleness, verification, audit

Every note carries an implicit drift signal:

- `sourceMtime` vs `noteMtime` — has the file changed since the note was written?
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

| Command           | Purpose                                                                                  |
| ----------------- | ---------------------------------------------------------------------------------------- |
| `/binote:mode`    | Activate binote-first mode in the current conversation. Reads notes before source.       |
| `/binote:rule`    | Emit a `CLAUDE.md` snippet for always-on binote-first behavior.                          |
| `/binote:save`    | Distill the current session's learnings into notes (design decisions, discoveries).      |
| `/binote:verify`  | Audit notes against current source via parallel subagents. Writes reports to `_audit/`.  |
| `/binote:ignore`  | Append binote's private artifacts (cache, logs, audits) to `.gitignore`.                 |

## MCP tools

| Tool             | Purpose                                                                  |
| ---------------- | ------------------------------------------------------------------------ |
| `init`           | Scaffold `.binote/` from project tree. Idempotent.                       |
| `read_note`      | Read with optional `forwardDepth` (links) and `backDepth` (backlinks). Logged. |
| `write_note`     | Create/update a note. Invalidates the index.                             |
| `search`         | Full-text search; hits include resolved `[[links]]` on the matched line. |
| `sync`           | Detect orphaned notes (source deleted, mirror survives). No rename guess. |
| `rebuild_index`  | Force `_index.json` rebuild without LLM token cost. Use after bulk writes. |
| `audit_status`   | Report stale/unverified notes ranked by drift.                           |
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

No arguments → starts the MCP server (stdio transport). CLI reads are **not** logged (logging exists for replayability of LLM context, not human use).

## `[[link]]` resolution

Strategies tried in order — defined in `src/core/binote-paths.ts`:

1. **exact**     — `<target>.md` exists
2. **as-is**     — already ends in `.md` or lives under `_notes/`
3. **dir**       — `<target>/_dir.md` exists
4. **basename**  — unique basename across all notes (ambiguous → unresolved)
5. **substring** — case-insensitive basename substring (typo recovery)

Prefer full project-relative paths: `[[src/core/scanner.ts]]`, not `[[scanner]]`. Bare basenames silently drop when ambiguous.

## Workflow

1. `binote init` (or `init` MCP tool) — scaffold empty notes mirroring source.
2. `/binote:ignore` — gitignore the private artifacts.
3. `/binote:mode` at conversation start — tell Claude to read notes before code.
4. Work normally. When something non-obvious is learned, run `/binote:save` to capture it.
5. After a refactor, `binote sync` finds orphans. `/binote:verify` audits notes that drifted.

## Design principles

- **Plain markdown.** Human-readable, editable, diffable.
- **No database.** `_index.json` is a derived cache; delete it freely and `rebuild_index` reconstructs from notes.
- **No `_meta/` shadow tree.** Frontmatter (`lastVerified` only) is the sole durable per-note metadata; everything else is computed on demand.
- **Backlinks opt-in.** Forward links are cheap; backlinks are noisy reverse samples — `backDepth: 0` is the default.
- **Mixed authorship.** Humans and agents both write notes. `_design/` outranks file annotations on conflict.
- **Non-code filtered.** JSON, YAML, lockfiles, images aren't mirrored. The ignore list lives in `binote-paths.ts`.

## What it deliberately is not

- Not a spec-driven workflow. Specs gate code in spec-kit/OpenSpec; binote *remembers* code. See [docs/comparison.md](docs/comparison.md).
- Not a rename detector. Renames are a write-time concern handled by the agent; `sync` only detects deletions.
- Not multi-project. Each `.binote/` is its own world.

## License

MIT
