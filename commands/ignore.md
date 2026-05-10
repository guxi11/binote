---
description: "Add binote's private artifacts (cache, session logs, audit reports) to the project's .gitignore. Idempotent — safe to re-run. Triggers on: '/binote:ignore'."
---

# Binote — Gitignore Private Artifacts

The user wants to keep collaborative notes in version control but skip per-developer / regenerable byproducts. Run the `ignore` MCP tool to update `.gitignore` accordingly.

## What gets ignored

`.binote/` is a mix of two things:

- **Shared truth** (stays tracked): `_dir.md`, `_notes/`, mirror notes like `src/foo.ts.md`. These are the team-readable knowledge graph.
- **Local-only artifacts** (gitignored by this command):
  - `.binote/_index.json` — derived link graph; `rebuild_index` regenerates from notes
  - `.binote/_meta.json` — legacy from earlier design; ignored for migration friendliness
  - `.binote/_sessions/` — per-developer read logs (jsonl)
  - `.binote/_audit/` — `/binote:verify` reports; rerun to refresh
  - `.binote/_read.log` — even older log file (pre-_sessions)

## Procedure

1. Call the `ignore` MCP tool with the project's absolute root path.
2. Tool is idempotent — entries already present are left alone, new ones get appended under a `# binote — local-only artifacts` header so the section is easy to spot in diffs.
3. Report concisely:
   - If `added` is non-empty, list the paths added (one line each).
   - If everything was already in place, say "all binote artifacts already gitignored — no changes."
   - If `created: true`, mention that `.gitignore` was created from scratch.

## Don't

- Don't manually edit `.gitignore` — let the tool handle it (keeps the rule list canonical).
- Don't ignore the `*.md` notes themselves — they ARE the binote project memory.
- Don't ignore `.binote/` wholesale — that would lose all collaborative context.
