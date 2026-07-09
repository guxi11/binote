# src/core/search.ts — Hybrid Search (Lexical ⊕ Semantic)

Shared engine behind both the MCP `search` tool ([[src/index.ts]]) and the CLI ([[src/cli.ts]]). Three paths:

1. **regex:true** → unranked line scan in note order.
2. **Plain query** → MiniSearch lexical ranking (fields: path-as-title ×4, headings ×2, body; fuzzy 0.2 + prefix), RRF-fused (k=60) with semantic recall from [[src/core/embeddings.ts]] when the embedding backend is available. Hybrid hits carry `via: lexical|semantic|both` and an RRF score; lexical-only hits keep the raw MiniSearch score.
3. **Fallback** → substring scan when both rankers return nothing (tokenizer-hostile queries: exact operators, punctuation).

## Notes

- MiniSearch cannot tokenize CJK — Chinese NL queries rank to ~nothing lexically. The semantic layer is what makes zh queries work at all.
- The MiniSearch engine is cached per projectRoot, keyed by `count:maxMtime` stamp (same freshness semantics as the link index). Its `bodies` map (frontmatter-stripped) is reused as the embedding input, so both rankers see identical corpus state.
- Semantic-only hits have no matched terms → `bestLine` falls back to the head of the note (where binote notes carry their summary).
- Per-hit `[[link]]` enrichment uses the cached index when fresh, inline re-resolution when stale.
- `semanticRank` errors are caught to `null` → indistinguishable from "backend absent"; search never fails because of the semantic layer.

## Links

- [[src/core/embeddings.ts]] — semantic backend
- [[src/core/link-index.ts]] — link enrichment
- [[src/core/scanner.ts]] — note enumeration
- [[src/types.ts]] — `SearchHit` (`score`, `via`)
