## Roam-First Context Rule

This project uses `.roam/` for bidirectional-linked notes. Follow these rules:

- When the user references a file path, read `.roam/<full-path-with-extension>.md` BEFORE reading the source file (e.g. `src/foo.tsx` → `.roam/src/foo.tsx.md`)
- For directories, read `.roam/<dir>/_dir.md` first
- Follow `[[links]]` in notes to gather related context
- If a roam note is empty, fall back to reading source directly
- Use `/roammem:gen` to populate empty notes after reading source
