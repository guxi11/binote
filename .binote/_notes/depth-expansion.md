# Depth Expansion in read_note

## Problem

`read_note` returned raw markdown with `[[links]]` as plain text. LLMs had to manually chase links via `query_links` → `read_note` (2+ round trips). In practice, LLMs rarely follow links unless system-prompted.

## Decision

Added `depth` param to `read_note` (0 = note only, 1 = expand linked notes). When `depth=1`, uses [[src/core/link-index.ts]] index to resolve forward `[[links]]`, reads all resolved targets in parallel, returns structured `{ content, linked, dangling }`.

## Tradeoffs

- **Pro**: Single call gets full context graph. Eliminates the most common multi-tool pattern.
- **Con**: Could blow up token budget on heavily-linked notes. Capped at depth=1 (no recursive expansion) to bound this.
- **query_links not removed**: Still needed for backlinks ("who links TO me"), which are the reverse direction. Depth expansion only follows forward links.

## Rule update

CLAUDE.md and `commands/rule.md` updated: "Follow [[links]]" → "Use `depth: 1`" + "Use `query_links` only for backlinks".
