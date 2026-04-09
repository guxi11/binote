# Contributing

## Setup

```bash
git clone https://github.com/Guxi11/roammem.git
cd roammem
npm install
npm run build
```

## Dev Loop

```bash
npm run watch          # rebuild on change
claude --plugin-dir .  # load plugin locally (MCP tools + slash commands)
```

After editing `commands/*.md`, run `/reload-plugins` in Claude Code — no restart needed.

## Structure

```
src/                    # TypeScript source → compiles to dist/
  index.ts              # MCP server entry + tool registration
  cli.ts                # CLI subcommands (init, read, write, etc.)
  core/
    scanner.ts          # Project file/dir walker
    note-io.ts          # Read/write .roam/ notes
    roam-paths.ts       # Path conventions, link resolution, config
    link-parser.ts      # [[wiki-link]] extraction/replacement
    link-index.ts       # Build/cache forward+reverse link graph
    sync-engine.ts      # Detect orphaned notes after file changes
  util/
    fs-helpers.ts       # File I/O, recursive walk
    markdown.ts         # Note templates
  types.ts              # Shared types

commands/               # Claude Code slash commands (plugin skills)
  roam.md               # /roam — activate roam-first mode
  roam-gen.md           # /roam-gen — generate note content from source
  roam-save.md          # /roam-save — save session learnings to notes
  roam-rule.md          # /roam-rule — emit CLAUDE.md snippet

.claude-plugin/         # Plugin manifest for Claude marketplace
```

## Architecture

Two layers:

1. **MCP server** (`src/index.ts`) — exposes tools (`init`, `read_note`, `write_note`, `query_links`, `search`, `sync`, `list_notes`) over stdio. Any MCP client can use these.

2. **Slash commands** (`commands/*.md`) — prompt-based skills for Claude Code. These orchestrate the MCP tools with behavioral rules (e.g. "read roam notes before source files").

## Adding a new slash command

Create `commands/<name>.md` with frontmatter:

```markdown
---
description: "One-line description. Triggers on: '/name'."
argument-hint: "[optional args hint]"  # omit if no args
---

Prompt content here.
```

## Adding a new MCP tool

Register in `src/index.ts` via `server.registerTool(...)`. Add a matching CLI subcommand in `src/cli.ts` if useful.

## Publish

```bash
npm version patch
npm publish
```

Plugin marketplace picks up the new version automatically from npm.
