# RoamMem

Bidirectional-linked project memory for AI. Mirrors your codebase into `.roam/` with `[[wiki-style links]]`, giving AI agents structured context about your project's architecture, design decisions, and file relationships.

## Why

AI tools read code but lack project context — why a file exists, how modules relate, what design tradeoffs were made. RoamMem fills this gap with a local knowledge graph that lives alongside your code.

## How it works

```
myproject/
├── src/
│   ├── index.ts
│   └── utils/
│       └── helpers.ts
├── .roam/                  ← generated
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
npm install -g roammem
```

## Setup

### Claude Plugin (recommended)

```bash
/plugin marketplace add Guxi11/roammem
/plugin install roammem@roammem
```

This gives you both MCP tools and slash commands.

### Claude MCP only

```bash
claude mcp add roammem -- roammem
```

MCP tools only — no slash commands.

### Local dev

```bash
claude --plugin-dir /path/to/roammem
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for dev setup.

### Manual MCP config

Add to your MCP config (`.mcp.json`, `claude_desktop_config.json`, etc.):

```json
{
  "mcpServers": {
    "roammem": {
      "command": "roammem"
    }
  }
}
```

## Slash Commands

| Command | Description |
|---------|-------------|
| `/roammem:roam` | Activate roam-first mode — reads `.roam/` notes before source files. When you `@file`, the roam note is read first. |
| `/roammem:gen` | Generate note content by reading source files. Fills empty skeletons with summaries and `[[links]]`. |
| `/roammem:save` | Save current session's learnings (design decisions, discoveries) into `.roam/` notes. |
| `/roammem:rule` | Emit a CLAUDE.md snippet for always-on roam-first behavior. |

Slash commands require plugin install. See Setup above.

## MCP Tools

| Tool | Description |
|------|-------------|
| `init` | Scan project and generate `.roam/` skeleton |
| `read_note` | Read a note by path |
| `write_note` | Create or update a note with `[[links]]` |
| `query_links` | Get forward links and backlinks for a note |
| `search` | Full-text search across all notes |
| `sync` | Detect file renames/deletes, mark orphaned notes |
| `list_notes` | List all notes in `.roam/` |

## CLI

```bash
roammem init   [projectRoot]                  # Initialize .roam/
roammem list   [projectRoot]                  # List all notes
roammem read   <notePath> [projectRoot]       # Read a note
roammem write  <notePath> <content> [root]    # Write a note
roammem links  <notePath> [projectRoot]       # Query forward/backlinks
roammem search <query> [projectRoot]          # Full-text search
roammem sync   [projectRoot]                  # Detect changes, mark orphans
```

No arguments starts the MCP server (stdio transport).

## Workflow

1. `init` — scaffold `.roam/` with empty notes mirroring your source files
2. `/roammem:gen` — fill notes with summaries, exports, and `[[links]]`
3. `/roammem:roam` — activate roam-first mode in any conversation
4. Work normally — Claude reads roam notes before source files for faster context
5. `/roammem:save` — capture session learnings back into notes
6. `sync` — after refactoring, detect structural changes and mark orphans

## Design

- **Plain markdown** — human-readable, editable, git-friendly
- **No database** — link index is a JSON cache rebuilt on demand
- **Mixed authorship** — AI and human can both read and write notes
- **Non-code files filtered** — JSON, YAML, images, etc. are not mirrored
- **Zero config** — just `init` and go

## License

MIT
