## Binote-First Context Rule (MANDATORY)

This project uses `.binote/` for bidirectional-linked notes. These rules are **non-negotiable**:

1. **BEFORE reading any source file**, you MUST first call `read_note` MCP tool with `forwardDepth: 1` to get the binote note and its [[link]] targets. This applies to EVERY file read — no exceptions.
   - `src/foo.tsx` → `read_note(notePath: "src/foo.tsx.md", forwardDepth: 1)` FIRST, then read source
   - Directories → `read_note(notePath: "<dir>/_dir.md", forwardDepth: 1)`
2. **Never read `.binote/` files directly** with the Read tool — always use `read_note` so reads are logged
3. If a binote note is empty, fall back to reading source directly
4. Set `backDepth: 1` ONLY when asking "who depends on this?". Backlinks default to off — they're noisy and burn tokens.
5. Treat any node with `staleness.level` of `warning` or `stale` as a hint, not authority — verify against source before relying on it.
6. **`_design/*.md` is the design authority.** It holds intended architecture, module contracts, and interface design. Source code is runtime truth; `_design/` is intended truth. When they disagree, surface the gap — do not silently follow code. `_design/` outranks `<file>.md` annotations and `_notes/` ADRs.
