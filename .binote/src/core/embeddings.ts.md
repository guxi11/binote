# src/core/embeddings.ts — Semantic Recall Backend (Tier 0)

Feature `_features/001-tiered-retrieval` Phase 1. Embeds whole note bodies with a local quantized model and ranks them by cosine similarity to a query. Consumed only by [[src/core/search.ts]] `searchNotes` for RRF fusion.

## Key decisions

- **Optional by construction.** `@huggingface/transformers` is an `optionalDependency`, loaded via dynamic `import()` inside a memoized promise. Any failure (package absent, network-blocked model download, `BINOTE_NO_EMBED=1`) → `semanticRank` returns `null` and search degrades silently to lexical. Failure is memoized per process — one attempt, not one per search.
- **No chunking.** binote's curation unit (one note per file/module) IS the chunk. Whole body, capped at 8 000 chars (~model context).
- **e5 asymmetric prefixes.** Passages embed as `passage: …`, queries as `query: …`. Default model `Xenova/multilingual-e5-small` (384-dim, q8) — notes are zh/en mixed, so multilingual is load-bearing. Override with `BINOTE_EMBED_MODEL`.
- **Cache is a derived index (constitution §4, ruled in §8 side-note).** `.binote/_embeddings/<model>.json` — schema `EmbeddingsCache` in [[src/types.ts]]. Invalidated wholesale on `EMBEDDINGS_VERSION`/`INDEX_VERSION`/model mismatch, per-entry on body sha1 mismatch. Deleted notes prune on the next full rewrite. Gitignored via [[src/core/gitignore.ts]] `PRIVATE_PATHS`.
- **Vectors stored as base64 Float32**, copied out of the Buffer pool on decode (pool offsets are not 4-byte aligned).
- **Unit-normalized at embed time** (`normalize: true`), so dot product = cosine.
- Model weights cache in `~/.cache/binote/models` (plugin install dirs may be read-only). `HF_ENDPOINT` respected for blocked networks (e.g. `https://hf-mirror.com`).
- Empty note bodies are skipped — an empty mirror is unembeddable and unrecallable by any search; that gap belongs to `knowledge_gaps`.

## Costs

- First ever run: model download (~100 MB via mirror) + corpus embed. Cached thereafter.
- Warm process-start: ~0.6 s model load; per-query embed ~0.1 s.

## Links

- [[src/core/search.ts]] — sole consumer (RRF fusion)
- [[src/types.ts]] — `EmbeddingsCache`, `EMBEDDINGS_VERSION`
- [[src/core/binote-paths.ts]] — `embeddingsDir` in `makeConfig`
- [[src/core/gitignore.ts]] — `_embeddings/` in `PRIVATE_PATHS`
- [[_features/001-tiered-retrieval/plan.md]] — origin
