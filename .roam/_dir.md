# roammem/

## Overview

RoamMem is a bidirectional-linked project memory system for AI agents, exposed as both an MCP server and a CLI. It mirrors a project's file tree under `.roam/` so each source file gets a markdown note containing summaries, design decisions, and `[[wiki-style links]]` to related files. The link graph is materialized to `_index.json` for fast forward/backlink queries.

## Structure

- `src/` — TypeScript source for the MCP server, CLI, and core engine
- `commands/` — slash command definitions for the Claude Code plugin
- `.roam/` — the system's own dogfooded notes (this directory)
- `package.json` — npm package metadata, ships the `roammem` bin

## Notes

- Self-hosted: roammem is documented inside its own `.roam/` notes
- The MCP server and CLI share the same engine; `src/index.ts` dispatches to `runCli` when invoked with args, otherwise starts a stdio MCP transport

## Links

- [[src]] — implementation
- [[commands]] — slash command definitions
