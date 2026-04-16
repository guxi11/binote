## Binote-First Context Rule

This project uses `.binote/` for bidirectional-linked notes. Follow these rules:

- When the user references a file path, read `.binote/<full-path-with-extension>.md` BEFORE reading the source file (e.g. `src/foo.tsx` → `.binote/src/foo.tsx.md`)
- For directories, read `.binote/<dir>/_dir.md` first
- Follow `[[links]]` in notes to gather related context
- If a binote is empty, fall back to reading source directly
- Use `/binote:gen` to populate empty notes after reading source
