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

## Release & local plugin update

This repo IS the marketplace plugin `binote@binote-marketplace`. New commands under `commands/*.md` only appear in a session after a **version bump + reinstall** — editing the file in the repo is not enough (Claude Code loads commands from the pinned install cache at session start, not from this working tree).

**Release (publish a new version):**
1. Bump the version in **all three** files to the same value: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json`.
2. Commit with the bare version number as the message (repo convention: `git commit -m "0.4.3"`).
3. `git tag v<ver>` and `git push origin main --tags`.

**Local install update (no interactive `/plugin`)** — patch the three coordinates under `~/.claude/plugins/`:
1. Pull the marketplace clone: `git -C ~/.claude/plugins/marketplaces/binote-marketplace fetch origin --tags && git -C … reset --hard origin/main`.
2. Build a new version cache: `cp -R cache/binote-marketplace/binote/<old>` → `<new>` (inherits `node_modules`), then overlay `commands/ .claude-plugin/ src/ docs/ package.json …` from the clone.
3. Repoint `installed_plugins.json` → `plugins["binote@binote-marketplace"][0]`: set `installPath`, `version`, `gitCommitSha` (new HEAD sha), `lastUpdated`.
Leave the old version cache in place (the running session holds it via `.in_use/`). The update takes effect in the **next** session, not the current one.

The runtime MCP server uses the global `binote` binary (`mcpServers.binote.command`), so the cache's `node_modules` is not load-critical for commands — only `commands/` and `.claude-plugin/plugin.json` matter for command availability.
