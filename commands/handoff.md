---
description: "Distill this long session into a handoff brief — the precision spine (charter + retrieval map + hard constraints + open items) that rides into a clean session, with detail sedimented to .binote/ for on-demand recall via hybrid search. Triggers on: '/binote:handoff [slug]'."
---

# Binote Session Handoff

You are distilling this conversation at a phase boundary into a **handoff brief**: the minimal precision spine a clean session needs to continue the work, plus detail sedimented into `.binote/` notes that the successor recalls on demand through the landed hybrid search (feature 001 Phase 1). The successor session = clean context + this brief's path + the binote search tools. Nothing else.

This protocol was validated once (see `.binote/_notes/session-handoff-experiment.md`): blind-test 6/6, brief 56k vs source 130k+ tokens, structure zero-failure. Every failure mode lived in **assertions that could not be mechanically re-checked**. The five lessons below ARE the distillation contract — they are non-negotiable, not style suggestions.

## The five lessons (the distillation contract)

1. **Runtime assertions must carry a mechanical anchor.** Never write a bare session-state claim. dist freshness → give the `git log -1 --format=%H` command + expected hash. Process/version state → rewrite as a session-independent proposition (e.g. "published versions ≤X lack this feature", not "the running server is stale").
2. **Numbers are single measured values.** One fact, one number, measured now. When several docs cross-reference the same quantity they must agree — no "~approx" that lets 144/100/129 drift apart. If you can't measure it this session, say so; don't guess.
3. **Smoke tests ship an expected baseline.** Any "how to verify X still works" must state the expected signal: latency order of magnitude, what should be hit, how many cache entries, the signature score. Without a baseline the successor cannot tell "broken" from "working as designed".
4. **Mark known dangling links.** The retrieval map must flag every `[[link]]` target whose note is missing/empty, so the successor doesn't chase a void.
5. **Concentrate scrutiny on the non-mechanical.** The spine (charter + recall net) itself never failed; distillation *quality* is everything. Spend your effort on the assertions rule 1 can't fully anchor — the invariants, the "why", the open judgment calls.

## Argument parsing

`/binote:handoff [slug]`. Optional `slug` names the brief (kebab-case). If omitted, derive one from the session's dominant task (e.g. `feature-001-phase1`). Today's date prefixes the filename.

## What to distill (the spine — five sections, in order)

Produce a brief with exactly these sections. Keep each tight; push detail to `[[links]]`.

- **Header truth-block** (blockquote, before the first heading): truth timestamp = today's date + current `main` commit hash; the dist-freshness anchor (lesson 1); one line stating this is a handoff brief. If you revise an existing brief, append a `修订 N (date): …` line noting what changed and why.
- **## 任务宪章 (Charter)** — what the work is, current phase/status, what's DONE vs not-yet-scoped, and the gate for the next phase. Link the spec/plan that hold the authoritative status.
- **## 检索地图 (Retrieval map)** — the `[[links]]` the successor queries for detail: plan status, design authority (`_design/`, `_constitution.md`), the touched source files + their mirror notes. End with a `已知悬空:` line listing missing/empty link targets (lesson 4).
- **## 硬约束 (Hard constraints)** — environment facts true right now that are NOT recoverable from the notes: network reachability, cached model sizes (measured, lesson 2), which published versions lack the feature (session-independent phrasing, lesson 1), how to actually run/verify + the expected baseline (lesson 3), version-gate variables.
- **## 未决事项 (Open items)** — distilled from this session's discussion, no owning note yet: unimplemented alternatives considered, known limits, measured baselines, deferred ideas. This is where scrutiny concentrates (lesson 5) — these are the non-mechanical claims.
- **## 下一步 (Next)** — one or two lines, mirror plan.md §Next.

## Link rules

- **Full project-relative paths in every `[[link]]`**: `[[src/core/search.ts]]`, `[[_features/001-tiered-retrieval/plan.md]]`. Bare basenames drop silently on index build.
- Directories → `[[src/core]]`; standalone notes → `[[_notes/topic]]`.

## Execution

1. Review the full conversation: what was the task, what landed, what was decided, what's still open. Identify the phase boundary you're distilling at.
2. Establish the truth-block anchors mechanically — run `git rev-parse --short HEAD` and `git log -1 --format=%H` for the commit hash; measure any number you cite (cache sizes, entry counts, latencies) rather than recalling it.
3. Write the brief to `.binote/_handoff/<YYYY-MM-DD>-<slug>.md` following the five-section spine. If a brief for this slug already exists, revise it in place and add a `修订 N` line — don't fork.
4. **Sediment the detail**: any discovery/decision that belongs to a specific file's mirror note or a standalone `_notes/` ADR — write it there (this is `/binote:save`'s job; do that work here for anything the brief references but shouldn't inline). The brief holds pointers; the notes hold the detail.
5. Call the `rebuild_index` MCP tool. The brief now lives under `.binote/` and is automatically indexed by hybrid search — no separate session store. (In the validation run the smoke test's #2 hit was the brief itself.) Verify it's recallable if the session touched the search path.
6. Report: the brief path, which mirror/ADR notes you sedimented into, and the single-line successor bootstrap instruction — "new session: read `<brief path>`, then query via `search` / `read_note`."

## Constraints

- The brief is a **spine, not a summary** — if a fact is recoverable from a note via search, link it, don't inline it. Inline only environment facts and open judgments that no note holds.
- Every runtime/version/freshness claim gets a mechanical anchor or session-independent phrasing (lesson 1). No bare "currently the X is Y".
- Never invent a number you didn't measure this session (lesson 2). "Unmeasured" is an honest value; a wrong number is a trap the successor can't detect.
- Do not overwrite an unrelated existing brief. One brief per phase boundary; revise in place.
