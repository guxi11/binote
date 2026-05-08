# Read Logging Design

## Decision

All binote note reads are logged to `.binote/_read.log` via the `read_note` MCP tool. The CLAUDE.md rule enforces that AI must use `read_note` instead of directly reading `.binote/` files with the Read tool.

## Why MCP-level logging, not prompt-level output

Three alternatives were considered:
1. **Prompt rule asking AI to list read docs in response** — unreliable (AI may forget), pollutes output, ephemeral (lost after conversation)
2. **Direct file reads with no logging** — original approach, no observability
3. **MCP tool logging** (chosen) — deterministic, silent, persistent, greppable

## How it works

- `read_note` handler in [[src/index.ts]] defines a local `logRead` that appends to `config.logPath`
- Log format: `[ISO timestamp] notePath\n<content>\n---\n`
- `logPath` is `.binote/_read.log`, defined in [[src/core/binote-paths.ts]] via `makeConfig`
- `appendLog` utility lives in [[src/util/fs-helpers.ts]]
- Both single and batch reads are logged

## Related files

- [[src/index.ts]] — read_note handler with logging
- [[src/core/binote-paths.ts]] — `logPath` in config
- [[src/util/fs-helpers.ts]] — `appendLog` helper
- [[src/types.ts]] — `BinoteConfig.logPath` field
- [[commands/rule.md]] — rule template updated to mandate MCP tool usage
