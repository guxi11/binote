---
description: "Save current session's learnings into .roam/ notes. Captures design decisions, discoveries, and context from this conversation. Triggers on: '/roam-save', 'save to roam', 'save session notes'."
---

# RoamMem Session Save

You are distilling this conversation's learnings into `.roam/` notes — design decisions made, bugs found, architectural discoveries, non-obvious behaviors uncovered.

## What to capture

- **Design decisions** — why something was built this way, tradeoffs considered
- **Discoveries** — non-obvious behavior, gotchas, implicit dependencies found during debugging
- **Relationships** — file dependencies and module interactions that became clear during the session
- **Context** — the "why" behind changes made, not the "what" (the diff has the what)

## What NOT to capture

- Code summaries derivable from reading the file
- Obvious facts (function names, type signatures)
- Temporary debug state or session-specific noise

## Execution

1. Review the full conversation history
2. Identify files that were read, edited, or discussed
3. For each file with meaningful learnings:
   - Read the existing `.roam/<path>.md` note
   - Merge new insights into the appropriate section (Summary, Notes, Links)
   - Preserve existing content — append, don't overwrite
   - Add `[[links]]` to related files discovered during the session
4. If a discovery spans multiple files or is architectural, write a standalone note to `.roam/_notes/<topic>.md`
5. Report what was saved: which notes updated, which created, key insights captured
