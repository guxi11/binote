---
description: "Generate a CLAUDE.md rule snippet for always-on binote-first behavior. Drop into any project with .binote/ notes. Triggers on: '/binote:rule'."
---

# Generate Binote-First CLAUDE.md Rule

Write the following snippet into the project's `CLAUDE.md` (append if exists, create if not):

```markdown
## Binote-First Context Rule (MANDATORY)

This project uses `.binote/` for bidirectional-linked notes. These rules are **non-negotiable**:

1. **At conversation start**, you MUST read `_constitution.md` once via `read_note(notePath: "_constitution.md")`. It holds project-wide invariants and outranks every other artifact on conflict.
2. **BEFORE reading any source file**, you MUST first call `read_note` MCP tool with `forwardDepth: 1` to get the binote note and its [[link]] targets. This applies to EVERY file read — no exceptions.
   - `src/foo.tsx` → `read_note(notePath: "src/foo.tsx.md", forwardDepth: 1)` FIRST, then read source
   - Directories → `read_note(notePath: "<dir>/_dir.md", forwardDepth: 1)`
3. **Never read `.binote/` files directly** with the Read tool — always use `read_note` (fuzzy resolution, staleness banners, cycle-safe graph reads)
4. If a binote note is empty, fall back to reading source directly
5. At `forwardDepth: 1` linked notes arrive as **excerpts** — drill into a specific one with a follow-up `read_note` of that path instead of `detail: "full"`.
6. Set `backDepth: 1` when asking "who depends on this?" (_audit reports are excluded from backlinks, so the answer is clean).
7. Treat any node with `staleness.level` of `warning` or `stale` as a hint, not authority — verify against source before relying on it.
8. **Authority hierarchy on conflict (highest first):**
   - `_constitution.md` — project-wide invariants
   - `_design/<topic>.md` — module-level intent + source code (tie: surface the gap, do not reconcile silently)
   - `_features/<NNN-slug>/spec.md` — feature-scoped intent for in-flight work
   - `<file>.md` annotations, `<dir>/_dir.md`
   - `_notes/<topic>.md` ADRs (frozen at write-time)
   - `_audit/<date>/*.md` snapshots (non-authoritative)
9. **For new feature work**, use the feature workflow: `/binote:feature <desc>` → scaffold; `/binote:plan <slug>` → fill plan with [[link]]'d touch set; `/binote:tasks <slug>` → derive ordered tasks. Do not write code outside this loop for non-trivial changes.
```

After writing, confirm to the user what was added and where.
