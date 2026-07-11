---
description: "Generate a CLAUDE.md rule snippet for always-on binote-first behavior. Drop into any project with .binote/ notes. Triggers on: '/binote:rule'."
---

# Generate Binote-First CLAUDE.md Rule

Write the following snippet into the project's `CLAUDE.md` (append if exists, create if not):

```markdown
## Binote-First Context Rule (search-first, cost-aware)

This project uses `.binote/` for bidirectional-linked notes. Retrieve to locate, read the note on demand, then read source:

1. **At conversation start**, you MUST read `_constitution.md` once via `read_note(notePath: "_constitution.md")`. It holds project-wide invariants and outranks every other artifact on conflict.
2. **To locate, use `search` first.** It is hybrid retrieval (BM25 lexical + local semantic embeddings, RRF-fused) — it matches by meaning, not exact tokens. One ranked `search` converges the scope to the 1-2 relevant notes; do not fan out speculative `read_note` calls per file.
3. **When you read a note, default `forwardDepth: 0`** (root note only — cheap). Escalate to `forwardDepth: 1` **only** when entering an unfamiliar subsystem where you need the neighborhood; it returns the root in full plus every [[link]] as an excerpt (median ~28K tokens on a hub note — not a per-file default).
   - Known file / one slice / batch preview → `read_note(notePath: "src/foo.tsx.md")`
   - Unfamiliar subsystem → `read_note(notePath: "src/foo.tsx.md", forwardDepth: 1)`; drill into one neighbor with a follow-up read of that path — **never** `detail: "full"`.
4. **A file you already understand, or a trivial one-line change:** read source directly, skip the note.
5. **Never read `.binote/` files directly** with the Read tool — always use `read_note` (fuzzy resolution, staleness banners, cycle-safe graph reads)
6. If a binote note is empty, fall back to reading source directly
7. Set `backDepth: 1` when asking "who depends on this?" (_audit reports are excluded from backlinks, so the answer is clean).
8. Treat any node with `staleness.level` of `warning` or `stale` as a hint, not authority — verify against source before relying on it.
9. **Authority hierarchy on conflict (highest first):**
   - `_constitution.md` — project-wide invariants
   - `_design/<topic>.md` — module-level intent + source code (tie: surface the gap, do not reconcile silently)
   - `_features/<NNN-slug>/spec.md` — feature-scoped intent for in-flight work
   - `<file>.md` annotations, `<dir>/_dir.md`
   - `_notes/<topic>.md` ADRs (frozen at write-time)
   - `_audit/<date>/*.md` snapshots (non-authoritative)
10. **For new feature work**, use the feature workflow: `/binote:feature <desc>` → scaffold; `/binote:plan <slug>` → fill plan with [[link]]'d touch set; `/binote:tasks <slug>` → derive ordered tasks. Do not write code outside this loop for non-trivial changes.
```

After writing, confirm to the user what was added and where.
