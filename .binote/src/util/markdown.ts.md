# markdown.ts

## Summary

Three pure functions returning skeleton markdown for the three note kinds. Used by `init` to seed empty notes; user content (or `/roammem:gen` output) replaces these skeletons over time.

## Key Exports

- `fileNoteTemplate(projectPath)` — `# path` + `## Summary` / `## Notes` / `## Links`
- `dirNoteTemplate(dirPath)` — `# path/` + `## Overview` / `## Structure` / `## Notes` / `## Links`
- `standaloneNoteTemplate(title)` — `# title` + `## Notes` / `## Links`

## Notes

- Templates are intentionally minimal so the skeleton-detection logic in `/roammem:roam` activation can recognize an empty note by section count alone.
- `fileNoteTemplate` is currently unused — `init` writes `""` for file notes to make the empty state unambiguous (a header-only file would still be "non-empty" by length checks).

## Links

- [[index.ts]] — `init` calls `dirNoteTemplate`
- [[cli.ts]] — `init` calls `dirNoteTemplate`
