## Binote-First Context Rule

This project uses `.binote/` for bidirectional-linked notes. Follow these rules:

- When the user references a file path, use the `read_note` MCP tool (with `projectRoot` and `notePath`) to read the binote note BEFORE reading the source file (e.g. `src/foo.tsx` → `read_note` with notePath `src/foo.tsx.md`)
- For directories, use `read_note` with notePath `<dir>/_dir.md`
- **Always use the `read_note` MCP tool** to read binote notes — never read `.binote/` files directly with the Read tool, so that reads are logged
- Follow `[[links]]` in notes to gather related context
- If a binote note is empty, fall back to reading source directly
- Use `/binote:gen` to populate empty notes after reading source
