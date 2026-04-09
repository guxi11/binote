# src/

## Overview

TypeScript source for the roammem MCP server and CLI. Layered as: thin tool/CLI shells (`index.ts`, `cli.ts`) → engine modules (`core/`) → fs and markdown primitives (`util/`).

## Structure

- `index.ts` — MCP server entry; registers tools and dispatches to CLI when args are present
- `cli.ts` — CLI command dispatcher (init / list / read / write / links / search / sync)
- `types.ts` — shared `readonly` type definitions (`RoamConfig`, `LinkIndex`, `SearchHit`, ...)
- `core/` — engine: scanner, note-io, link-parser, link-index, sync-engine, roam-paths
- `util/` — fs helpers and markdown skeleton templates

## Notes

- Pure functions throughout; side effects pushed to the boundary in `note-io.ts` and `fs-helpers.ts`
- ESM with `.js` import suffixes — required so the compiled output resolves under Node's ESM loader

## Links

- [[src/core]] — engine modules
- [[src/util]] — fs primitives and templates
- [[index.ts]] — MCP entry
- [[cli.ts]] — CLI entry
- [[types.ts]] — shared types
