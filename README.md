# Backnote

Bidirectional-linked project memory for AI. Mirrors your codebase into `.backnote/` with `[[wiki-style links]]`, giving AI agents structured context about your project's architecture, design decisions, and file relationships.

## Why

AI tools read code but lack project context — why a file exists, how modules relate, what design tradeoffs were made. Backnote fills this gap with a local knowledge graph that lives alongside your code, inspired by Zettelkasten and bidirectional-linking note systems.

## How it works

```
myproject/
├── src/
│   ├── index.ts
│   └── utils/
│       └── helpers.ts
├── .backnote/              ← generated
│   ├── _dir.md             ← root overview
│   ├── _notes/             ← standalone docs (architecture, design, etc.)
│   │   └── architecture.md
│   ├── _index.json         ← link index cache
│   ├── src/
│   │   ├── _dir.md         ← directory overview
│   │   ├── index.ts.md     ← note for index.ts
│   │   └── utils/
│   │       ├── _dir.md
│   │       └── helpers.ts.md
```

Notes use `[[bidirectional links]]` — link to any file or note by path:

```markdown
# src/index.ts

Entry point. Orchestrates [[src/utils/helpers.ts]] and [[_notes/architecture.md]].
```

Query links to traverse the graph in both directions.

## Install

```bash
npm install -g backnote
```

## Setup

### Claude Plugin (recommended)

```bash
/plugin marketplace add Guxi11/backnote
/plugin install backnote@backnote
```

This gives you both MCP tools and slash commands.

### Claude MCP only

```bash
claude mcp add backnote -- backnote
```

MCP tools only — no slash commands.

### Local dev

```bash
claude --plugin-dir /path/to/backnote
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup.

### Manual MCP config

Add to your MCP config (`.mcp.json`, `claude_desktop_config.json`, etc.):

```json
{
  "mcpServers": {
    "backnote": {
      "command": "backnote"
    }
  }
}
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/backnote:mode` | Activate backnote-first mode — reads `.backnote/` notes before source files. When you `@file`, the backnote is read first. |
| `/backnote:gen`  | Generate note content by reading source files. Fills empty skeletons with summaries and `[[links]]`. |
| `/backnote:save` | Save current session's learnings (design decisions, discoveries) into `.backnote/` notes. |
| `/backnote:rule` | Emit a CLAUDE.md snippet for always-on backnote-first behavior. |

Slash commands require plugin install. See Setup above.

## MCP Tools

| Tool | Description |
|------|-------------|
| `init` | Scan project and generate `.backnote/` skeleton |
| `read_note` | Read a note by path |
| `write_note` | Create or update a note with `[[links]]` |
| `query_links` | Get forward links and backlinks for a note |
| `search` | Full-text search across all notes |
| `sync` | Detect file renames/deletes, mark orphaned notes |
| `list_notes` | List all notes in `.backnote/` |

## CLI

```bash
backnote init   [projectRoot]                  # Initialize .backnote/
backnote list   [projectRoot]                  # List all notes
backnote read   <notePath> [projectRoot]       # Read a note
backnote write  <notePath> <content> [root]    # Write a note
backnote links  <notePath> [projectRoot]       # Query forward/backlinks
backnote search <query> [projectRoot]          # Full-text search
backnote sync   [projectRoot]                  # Detect changes, mark orphans
```

No arguments starts the MCP server (stdio transport).

## Workflow

1. `init` — scaffold `.backnote/` with empty notes mirroring your source files
2. `/backnote:gen` — fill notes with summaries, exports, and `[[links]]`
3. `/backnote:mode` — activate backnote-first mode in any conversation
4. Work normally — Claude reads backnotes before source files for faster context
5. `/backnote:save` — capture session learnings back into notes
6. `sync` — after refactoring, detect structural changes and mark orphans

## Design

- **Plain markdown** — human-readable, editable, git-friendly
- **No database** — link index is a JSON cache rebuilt on demand
- **Mixed authorship** — AI and human can both read and write notes
- **Non-code files filtered** — JSON, YAML, images, etc. are not mirrored
- **Zero config** — just `init` and go

## Migrating from `roammem`

Backnote was previously published as `roammem`. To upgrade:

```bash
npm uninstall -g roammem
npm install -g backnote
mv .roam .backnote        # in each project that used roammem
```

Slash command prefix changed from `/roammem:*` to `/backnote:*`, and `/roammem:roam` was renamed to `/backnote:mode`.

## License

MIT
