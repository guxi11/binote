---
description: "Generate a CLAUDE.md rule snippet for always-on roam-first behavior. Drop into any project with .roam/ notes. Triggers on: '/roammem:rule'."
---

# Generate Roam-First CLAUDE.md Rule

Write the following snippet into the project's `CLAUDE.md` (append if exists, create if not):

```markdown
## Roam-First Context Rule

This project uses `.roam/` for bidirectional-linked notes. Follow these rules:

- When the user references a file path, read `.roam/<path>.md` BEFORE reading the source file
- For directories, read `.roam/<dir>/_dir.md` first
- Follow `[[links]]` in notes to gather related context
- If a roam note is empty, fall back to reading source directly
- Use `/roammem:gen` to populate empty notes after reading source
```

After writing, confirm to the user what was added and where.
