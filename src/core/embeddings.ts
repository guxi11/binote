import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

import { EMBEDDINGS_VERSION, INDEX_VERSION } from "../types.js";
import type { BinoteConfig, EmbeddingsCache } from "../types.js";
import { readFileSafe, writeFileSafe } from "../util/fs-helpers.js";

/**
 * Semantic recall backend (feature 001 Phase 1 — Tier 0 recall net).
 *
 * Embeds whole note bodies (binote's curation unit IS the chunk — no semantic
 * chunking needed) with a local quantized model via `@huggingface/transformers`,
 * which is an *optional* dependency: when the package or model is unavailable
 * (offline first run, `--omit=optional` install, `BINOTE_NO_EMBED=1`), every
 * entry point returns null and search degrades silently to the lexical path.
 * No network service, no daemon — zero-infra ethos holds.
 *
 * The vector cache under `.binote/_embeddings/` is a derived index like
 * `_index.json` (constitution §4): deletable, regenerable from note bodies,
 * never authoritative. Invalidated wholesale on version/model mismatch and
 * per-entry on note content-hash mismatch. It is a disposable cache, not the
 * persistent meta sidecar §8 forbids.
 */

const DEFAULT_MODEL = "Xenova/multilingual-e5-small";
/** ≈ model context (512 tokens) with headroom; embedding the head of a note is
 *  enough — binote notes front-load their summary. */
const MAX_PASSAGE_CHARS = 8_000;
const BATCH_SIZE = 8;

export type SemanticHit = { readonly notePath: string; readonly similarity: number };

type Embedder = (texts: readonly string[]) => Promise<readonly Float32Array[]>;

const modelName = (): string => process.env["BINOTE_EMBED_MODEL"] ?? DEFAULT_MODEL;

/** Memoized for process lifetime — including failure, so an unavailable
 *  backend costs one attempt, not one per search. */
let embedderPromise: Promise<Embedder | null> | null = null;

const loadEmbedder = (): Promise<Embedder | null> => {
  embedderPromise ??= (async () => {
    if (process.env["BINOTE_NO_EMBED"]) return null;
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Plugin installs may live in read-only dirs — keep model weights in a
      // predictable user-writable cache instead of inside node_modules.
      env.cacheDir = join(homedir(), ".cache", "binote", "models");
      // Standard HF convention — lets blocked networks point at a mirror.
      const endpoint = process.env["HF_ENDPOINT"];
      if (endpoint) env.remoteHost = endpoint;
      const extract = await pipeline("feature-extraction", modelName(), { dtype: "q8" });
      return async (texts) => {
        const out = await extract([...texts], { pooling: "mean", normalize: true });
        const [n, dims] = out.dims as [number, number];
        const data = out.data as Float32Array;
        return Array.from({ length: n }, (_, i) => data.slice(i * dims, (i + 1) * dims));
      };
    } catch {
      return null;
    }
  })();
  return embedderPromise;
};

// ── cache codec ───────────────────────────────────────────────────────

const sha1 = (s: string): string => createHash("sha1").update(s).digest("hex");

const vecToB64 = (v: Float32Array): string =>
  Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");

const b64ToVec = (s: string): Float32Array => {
  const buf = Buffer.from(s, "base64");
  // Copy out of the Buffer pool — pooled offsets are not 4-byte aligned.
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return new Float32Array(copy);
};

const cachePath = (config: BinoteConfig): string =>
  join(config.embeddingsDir, `${modelName().replace(/[^a-zA-Z0-9._-]+/g, "_")}.json`);

const loadCache = async (config: BinoteConfig): Promise<EmbeddingsCache["entries"]> => {
  const raw = await readFileSafe(cachePath(config));
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as EmbeddingsCache;
    const valid =
      parsed.version === EMBEDDINGS_VERSION &&
      parsed.indexVersion === INDEX_VERSION &&
      parsed.model === modelName();
    return valid ? parsed.entries : {};
  } catch {
    return {};
  }
};

const saveCache = (
  config: BinoteConfig,
  dims: number,
  entries: EmbeddingsCache["entries"]
): Promise<void> => {
  const cache: EmbeddingsCache = {
    version: EMBEDDINGS_VERSION,
    indexVersion: INDEX_VERSION,
    model: modelName(),
    dims,
    entries,
  };
  return writeFileSafe(cachePath(config), JSON.stringify(cache));
};

// ── ranking ───────────────────────────────────────────────────────────

const dot = (a: Float32Array, b: Float32Array): number =>
  a.reduce((sum, x, i) => sum + x * (b[i] ?? 0), 0);

const chunk = <T>(xs: readonly T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(xs.length / size) }, (_, i) =>
    xs.slice(i * size, (i + 1) * size)
  );

/**
 * Rank notes by cosine similarity to the query (vectors are unit-normalized,
 * so dot = cosine). Re-embeds only notes whose body hash changed; prunes
 * deleted notes from the cache as a side effect of the full rewrite.
 * Returns null when the semantic backend is unavailable.
 */
export const semanticRank = async (
  config: BinoteConfig,
  bodies: ReadonlyMap<string, string>,
  query: string,
  limit: number
): Promise<readonly SemanticHit[] | null> => {
  const embed = await loadEmbedder();
  if (!embed) return null;

  // e5 models are asymmetric: passages and queries carry distinct prefixes.
  const cached = await loadCache(config);
  const vectors = new Map<string, Float32Array>();
  const hashes = new Map<string, string>();
  const stale: Array<readonly [string, string]> = [];
  for (const [notePath, body] of bodies) {
    if (!body.trim()) continue;
    const hash = sha1(body);
    hashes.set(notePath, hash);
    const entry = cached[notePath];
    if (entry && entry.hash === hash) vectors.set(notePath, b64ToVec(entry.vector));
    else stale.push([notePath, body]);
  }
  for (const batch of chunk(stale, BATCH_SIZE)) {
    const vecs = await embed(batch.map(([, body]) => `passage: ${body.slice(0, MAX_PASSAGE_CHARS)}`));
    batch.forEach(([notePath], i) => vectors.set(notePath, vecs[i]!));
  }
  if (vectors.size === 0) return [];

  const [queryVec] = await embed([`query: ${query}`]);
  if (!queryVec) return [];

  if (stale.length > 0 || Object.keys(cached).length !== vectors.size) {
    const entries = Object.fromEntries(
      [...vectors].map(([notePath, v]) => [
        notePath,
        { hash: hashes.get(notePath)!, vector: vecToB64(v) },
      ])
    );
    await saveCache(config, queryVec.length, entries).catch(() => undefined);
  }

  return [...vectors]
    .map(([notePath, v]) => ({ notePath, similarity: dot(queryVec, v) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};
