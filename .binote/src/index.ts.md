# src/index.ts — MCP Server Entry

## Notes

- `read_note` handler logs all reads to `.binote/_read.log` via local `logRead` closure — both single and batch paths go through it
- The `logRead` is defined inside the handler closure to capture `config` without threading it through
- `read_note` supports `depth` param (0|1). When `depth=1`, `expandLinks` resolves all `[[links]]` via the cached link index and reads their content in parallel, returning `{ content, linked, dangling }`. This eliminates multi-round-trip link chasing by the LLM.
- `expandLinks` deduplicates resolved targets so each linked note is read at most once
- `query_links` is still needed for **backlinks** (who links TO a note) — depth expansion only follows forward links

## Links

- [[src/core/note-io.ts]] — underlying `readNote` function
- [[src/util/fs-helpers.ts]] — `appendLog` used for logging
- [[src/core/link-index.ts]] — `getOrBuildIndex` used by `expandLinks` for link resolution
- [[_notes/read-logging]] — design decision on read logging
- [[_notes/depth-expansion]] — design decision on depth expansion
