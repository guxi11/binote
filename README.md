# Binote

Bidirectional-linked project memory for AI. Mirrors your codebase into `.binote/` with `[[wiki-style links]]`, giving AI agents structured context about your project's architecture, design decisions, and file relationships.

## Why

AI tools read code but lack project context — why a file exists, how modules relate, what design tradeoffs were made. Binote fills this gap with a local knowledge graph that lives alongside your code, inspired by Zettelkasten and bidirectional-linking note systems.

## How it works

```
myproject/
├── src/
│   ├── index.ts
│   └── utils/
│       └── helpers.ts
├── .binote/              ← generated
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
npm install -g binote
```

## Setup

### Claude Plugin (recommended)

```bash
/plugin marketplace add Guxi11/binote
/plugin install binote@binote
```

This gives you both MCP tools and slash commands.

### Claude MCP only

```bash
claude mcp add binote -- binote
```

MCP tools only — no slash commands.

### Local dev

```bash
claude --plugin-dir /path/to/binote
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup.

### Manual MCP config

Add to your MCP config (`.mcp.json`, `claude_desktop_config.json`, etc.):

```json
{
  "mcpServers": {
    "binote": {
      "command": "binote"
    }
  }
}
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/binote:mode` | Activate binote-first mode — reads `.binote/` notes before source files. When you `@file`, the binote is read first. |
| `/binote:gen`  | Generate note content by reading source files. Fills empty skeletons with summaries and `[[links]]`. |
| `/binote:save` | Save current session's learnings (design decisions, discoveries) into `.binote/` notes. |
| `/binote:rule` | Emit a CLAUDE.md snippet for always-on binote-first behavior. |

Slash commands require plugin install. See Setup above.

## MCP Tools

| Tool | Description |
|------|-------------|
| `init` | Scan project and generate `.binote/` skeleton |
| `read_note` | Read a note by path |
| `write_note` | Create or update a note with `[[links]]` |
| `query_links` | Get forward links and backlinks for a note |
| `search` | Full-text search across all notes |
| `sync` | Detect file renames/deletes, mark orphaned notes |
| `list_notes` | List all notes in `.binote/` |

## CLI

```bash
binote init   [projectRoot]                  # Initialize .binote/
binote list   [projectRoot]                  # List all notes
binote read   <notePath> [projectRoot]       # Read a note
binote write  <notePath> <content> [root]    # Write a note
binote links  <notePath> [projectRoot]       # Query forward/backlinks
binote search <query> [projectRoot]          # Full-text search
binote sync   [projectRoot]                  # Detect changes, mark orphans
```

No arguments starts the MCP server (stdio transport).

## Workflow

1. `init` — scaffold `.binote/` with empty notes mirroring your source files
2. `/binote:gen` — fill notes with summaries, exports, and `[[links]]`
3. `/binote:mode` — activate binote-first mode in any conversation
4. Work normally — Claude reads binotes before source files for faster context
5. `/binote:save` — capture session learnings back into notes
6. `sync` — after refactoring, detect structural changes and mark orphans

## Design

- **Plain markdown** — human-readable, editable, git-friendly
- **No database** — link index is a JSON cache rebuilt on demand
- **Mixed authorship** — AI and human can both read and write notes
- **Non-code files filtered** — JSON, YAML, images, etc. are not mirrored
- **Zero config** — just `init` and go

## Migrating from `roammem`

Binote was previously published as `roammem`. To upgrade:

```bash
npm uninstall -g roammem
npm install -g binote
mv .roam .binote        # in each project that used roammem
```

Slash command prefix changed from `/roammem:*` to `/binote:*`, and `/roammem:roam` was renamed to `/binote:mode`.

## License

MIT
