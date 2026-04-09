# index.ts

## Summary

Entry point for the roammem MCP server. Registers seven tools (`init`, `read_note`, `write_note`, `query_links`, `search`, `sync`, `list_notes`) on a `McpServer` instance and starts a stdio transport. If CLI args are present it delegates to `runCli` and skips MCP startup — the same binary serves both modes.

## Key Exports

None (executable entry; effect is starting the server or dispatching the CLI).

## Notes

- Dual-mode: any args → CLI; no args → MCP server. The check happens **after** tool registration so the same `McpServer` instance is constructed regardless — slightly wasted work in CLI mode, but keeps the dispatch trivial.
- Tool handlers reconstruct a `RoamConfig` from `projectRoot` on every call — stateless, safe across concurrent invocations.
- `init` writes a root `_dir.md` only if it doesn't already exist; existing notes are never overwritten by `init`.
- `search` runs a synchronous `pattern.lastIndex = 0` reset because the regex is reused across lines.

## Links

- [[cli.ts]] — receives control when args are present
- [[roam-paths.ts]] — config construction and path mapping
- [[scanner.ts]] — initial project walk
- [[note-io.ts]] — note reads/writes
- [[link-index.ts]] — index build/save/invalidate
- [[sync-engine.ts]] — `sync` tool implementation
- [[markdown.ts]] — `dirNoteTemplate` for skeletons
- [[fs-helpers.ts]] — `ensureDir` for bootstrap
- [[types.ts]] — `SearchHit`
