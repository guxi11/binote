# commands/roam.md

## Summary

Defines the `/roam` slash command that activates roam-first mode for the rest of the conversation. Sets the rule "always read `.roam/` notes before source files" and runs an activation routine.

## Notes

### Design decision: on-demand loading, not upfront scan (2026-04-09)

The activation routine deliberately does **not** glob and read all `_dir.md` files in the project. It only loads:

1. `.roam/_dir.md` (root overview)
2. `.roam/_index.json` (link graph)

**Why:** A previous version globbed `.roam/**/_dir.md` and read every directory overview at activation. For large projects this fans out into many file reads and burns context/tokens before any user task has been stated.

**How to apply:** Directory and file notes load lazily — only when the user references a specific path. The link graph in `_index.json` is small and gives Claude enough surface area to know what exists without reading the contents.

**Trade-off:** Claude has less ambient project knowledge at activation, but the root `_dir.md` plus `_index.json` are sufficient for navigation, and on-demand loads stay focused on what the user actually asks about.

### Refinement: one-line status output + skeleton detection (2026-04-09)

Even after restricting activation to 2 file reads, the output summary itself was too verbose (multi-bullet dumps of empty skeletons). Activation now requires:

- **Skeleton detection:** if `_dir.md` has empty sections or `_index.json` is nearly empty, output: `roam-first mode active · notes not initialized, run /roam-gen to populate`
- **Initialized case:** output `roam-first mode active · N nodes in graph` + one short sentence about the project
- **Hard constraint:** no raw dumps, no file-by-file summaries, no globbing of `_dir.md` files

**Why:** The activation message is pure overhead before the user's real task. When notes are empty there is literally nothing to summarize — pointing at `/roam-gen` is the only useful signal. When notes exist, a terse status is enough; any deeper content should wait for the user to reference a specific path.

**How to apply:** Treat the activation output as a status line, not a briefing. If you catch yourself writing bullet lists during activation, stop.

## Links

- [[commands/_dir.md]]
- [[_dir.md]]
