# cli.ts

## Summary

CLI dispatcher for roammem. Exports a single `runCli(args)` function that returns `false` when no command is given (so the caller falls through to MCP mode) and `true` after handling a command. Mirrors the MCP tool surface: init, list, read, write, links, search, sync.

## Key Exports

- `runCli(args)` — async dispatcher; returns `false` when no command, `true` after handling one. May call `process.exit(1)` on usage errors.

## Notes

- All commands resolve `projectRoot` from a trailing positional arg or fall back to `process.cwd()` via `resolveRoot`.
- Output is JSON via a local `log` helper, except `read` which prints raw note content.
- The local `search` command duplicates the MCP `search` logic with a simpler shape — they are intentionally not shared because the CLI returns a flat array while the MCP tool returns context windows.
- Errors call `process.exit(1)` directly — fine for a CLI but not reusable as a library.

## Links

- [[index.ts]] — caller; passes `process.argv.slice(2)`
- [[roam-paths.ts]] — config construction
- [[scanner.ts]] — project + note walks
- [[note-io.ts]] — note CRUD
- [[link-index.ts]] — index ops
- [[sync-engine.ts]] — `sync` command
- [[markdown.ts]] — directory skeleton
- [[fs-helpers.ts]] — `ensureDir`
