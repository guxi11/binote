---
description: "Generate a CLAUDE.md rule snippet for always-on binote-first behavior. Drop into any project with .binote/ notes. Triggers on: '/binote:rule'."
---

# Generate Binote-First CLAUDE.md Rule

Write the following snippet into the project's `CLAUDE.md` (append if exists, create if not):

```markdown
## Binote-First Context Rule (MANDATORY)

This project uses `.binote/` for bidirectional-linked notes. These rules are **non-negotiable**:

1. **BEFORE reading any source file**, you MUST first call `read_note` MCP tool with `depth: 1` to get the binote note and all linked context. This applies to EVERY file read — no exceptions.
   - `src/foo.tsx` → `read_note(notePath: "src/foo.tsx.md", depth: 1)` FIRST, then read source
   - Directories → `read_note(notePath: "<dir>/_dir.md", depth: 1)`
2. **Never read `.binote/` files directly** with the Read tool — always use `read_note` so reads are logged
3. If a binote note is empty, fall back to reading source directly
```

After writing, confirm to the user what was added and where.
