# Read Logging Design (SUPERSEDED — removed in 0.4.0)

## Status

**Removed.** Read logging went through two incarnations — `.binote/_read.log`, then per-day `.binote/_sessions/<date>.jsonl` — and was deleted entirely in 0.4.0.

## Why removed

Field data (912 logged reads in one real project) showed the log was **write-only exhaust**: 40 MB on disk, no tool/skill/command ever read it back, and each entry re-embedded the full tool result — roughly doubling the byte cost of every read. The "session is replayable" promise was never implemented, and the useful by-product (which notes are hot) is better answered by the link graph (`knowledge_gaps`) than by read counts.

## What remains

- The CLAUDE.md rule still mandates `read_note` over raw Read — the justification is now fuzzy resolution + staleness banners + excerpt graph reads, not observability.
- `.binote/_sessions/` and `_read.log` stay in `PRIVATE_PATHS` ([[src/core/gitignore.ts]]) so legacy directories remain gitignored.
