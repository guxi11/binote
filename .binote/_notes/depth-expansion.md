# Depth Expansion in read_note

## Problem

`read_note` returned raw markdown with `[[links]]` as plain text. LLMs had to manually chase links (2+ round trips). In practice, LLMs rarely follow links unless system-prompted.

## Decision (current shape, 0.4.0)

`forwardDepth` (0-3) expands forward `[[links]]`; `backDepth` (0-1) expands incoming refs at the root only. The old `depth` param survives as a deprecated alias; `query_links` was folded into the same tool long ago.

**Excerpt-by-default (0.4.0):** the requested root renders in full; every linked/backlinked node renders as a compact excerpt (frontmatter description + first paragraph + heading outline + a `links:` nav line) — `detail: "full"` restores body inlining. Output is markdown, not pretty-printed JSON. Rationale: measured 12.6× payload blow-up at `forwardDepth: 1` when full bodies were inlined (avg 118 KB/read, worst 487 KB); excerpts cut ~78% while keeping enough signal to decide where to drill. Implementation: [[src/core/graph-read.ts]], [[src/core/excerpt.ts]].

## Tradeoffs

- **Pro**: Single call still gets the context graph; token cost now scales with what the agent actually drills into.
- **Con**: Details behind an excerpt need a second read — deliberate: progressive disclosure beats speculative inlining.
