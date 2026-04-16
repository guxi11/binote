## Backnote-First Context Rule

This project uses `.backnote/` for bidirectional-linked notes. Follow these rules:

- When the user references a file path, read `.backnote/<full-path-with-extension>.md` BEFORE reading the source file (e.g. `src/foo.tsx` → `.backnote/src/foo.tsx.md`)
- For directories, read `.backnote/<dir>/_dir.md` first
- Follow `[[links]]` in notes to gather related context
- If a backnote is empty, fall back to reading source directly
- Use `/backnote:gen` to populate empty notes after reading source
