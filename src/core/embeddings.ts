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
/** Hard ceiling per embedded passage — defensive only; structure-aware chunks
 *  are already ≤ CHUNK_TARGET_CHARS, so this just caps a pathological monster
 *  line before it reaches the model. */
const MAX_PASSAGE_CHARS = 8_000;
const BATCH_SIZE = 8;
/** Structure-aware chunk cap. e5 truncates at 512 tokens (~1.5–2.5K chars, less
 *  for CJK); keep every section under it so no section's tail is silently
 *  dropped. Sections above this are sub-split on paragraph breaks. */
const CHUNK_TARGET_CHARS = 1_400;
const HEADING_RE = /^#{1,6}\s/;

export type SemanticHit = {
  readonly notePath: string;
  readonly similarity: number;
  /** Heading of the best-matching section ("" for pre-heading preamble). */
  readonly heading?: string;
};

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

type NoteChunk = { readonly heading: string; readonly text: string };

/** Greedy-pack paragraphs of an oversized section up to `max` chars; a single
 *  paragraph longer than `max` is hard-sliced (last resort). */
const packParagraphs = (text: string, max: number): readonly string[] => {
  const out: string[] = [];
  let buf = "";
  const flush = () => {
    if (buf) out.push(buf);
    buf = "";
  };
  for (const p of text.split(/\n\s*\n/)) {
    if (p.length > max) {
      flush();
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else {
      if (buf.length + p.length + 2 > max) flush();
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  flush();
  return out;
};

/**
 * Split a note body into embeddable chunks at markdown heading boundaries —
 * binote notes are authored markdown, so heading seams are topic seams (free,
 * meaningful boundaries, no model needed). Pre-heading preamble becomes its own
 * chunk (heading ""). Sections above the model window are sub-split on paragraph
 * breaks so no section tail is lost to truncation.
 */
const chunkNote = (body: string): readonly NoteChunk[] => {
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let cur = { heading: "", lines: [] as string[] };
  for (const line of body.split("\n")) {
    if (HEADING_RE.test(line)) {
      if (cur.heading || cur.lines.some((l) => l.trim())) sections.push(cur);
      cur = { heading: line.replace(/^#{1,6}\s+/, "").trim(), lines: [line] };
    } else cur.lines.push(line);
  }
  sections.push(cur);
  return sections
    .map((s) => ({ heading: s.heading, text: s.lines.join("\n").trim() }))
    .filter((s) => s.text.length > 0)
    .flatMap((s) =>
      s.text.length <= CHUNK_TARGET_CHARS
        ? [s]
        : packParagraphs(s.text, CHUNK_TARGET_CHARS).map((text) => ({ heading: s.heading, text }))
    );
};

/**
 * Rank notes by cosine similarity to the query (vectors are unit-normalized,
 * so dot = cosine). Each note is embedded per markdown section (structure-aware
 * chunking); a note's score is the MAX cosine over its section vectors, so a
 * query matching any single section surfaces the whole note — no section tail
 * goes dark past the model window. Re-embeds only notes whose body hash changed;
 * prunes deleted notes via the full rewrite. Returns null when the semantic
 * backend is unavailable.
 */
export const semanticRank = async (
  config: BinoteConfig,
  bodies: ReadonlyMap<string, string>,
  query: string,
  limit: number
): Promise<readonly SemanticHit[] | null> => {
  const embed = await loadEmbedder();
  if (!embed) return null;

  type Vec = { readonly heading: string; readonly vector: Float32Array };
  const cached = await loadCache(config);
  const noteVecs = new Map<string, Vec[]>();
  const hashes = new Map<string, string>();
  // Cache-miss chunks flattened for batched embedding, with backrefs to regroup.
  const staleRefs: Array<{ readonly notePath: string; readonly heading: string }> = [];
  const staleTexts: string[] = [];

  for (const [notePath, body] of bodies) {
    if (!body.trim()) continue;
    const hash = sha1(body);
    hashes.set(notePath, hash);
    const entry = cached[notePath];
    if (entry && entry.hash === hash) {
      noteVecs.set(
        notePath,
        entry.chunks.map((c) => ({ heading: c.heading, vector: b64ToVec(c.vector) }))
      );
    } else {
      noteVecs.set(notePath, []);
      for (const c of chunkNote(body)) {
        staleRefs.push({ notePath, heading: c.heading });
        // e5 asymmetry: passages carry a distinct prefix from queries.
        staleTexts.push(`passage: ${c.text.slice(0, MAX_PASSAGE_CHARS)}`);
      }
    }
  }

  for (const batch of chunk(
    staleTexts.map((text, i) => ({ text, ref: staleRefs[i]! })),
    BATCH_SIZE
  )) {
    const vecs = await embed(batch.map((b) => b.text));
    batch.forEach((b, i) =>
      noteVecs.get(b.ref.notePath)!.push({ heading: b.ref.heading, vector: vecs[i]! })
    );
  }

  const ranked = [...noteVecs].filter(([, vs]) => vs.length > 0);
  if (ranked.length === 0) return [];

  const [queryVec] = await embed([`query: ${query}`]);
  if (!queryVec) return [];

  if (staleTexts.length > 0 || Object.keys(cached).length !== noteVecs.size) {
    const entries = Object.fromEntries(
      ranked.map(([notePath, vs]) => [
        notePath,
        {
          hash: hashes.get(notePath)!,
          chunks: vs.map((v) => ({ heading: v.heading, vector: vecToB64(v.vector) })),
        },
      ])
    );
    await saveCache(config, queryVec.length, entries).catch(() => undefined);
  }

  return ranked
    .map(([notePath, vs]) => {
      const best = vs.reduce(
        (acc, v) => {
          const sim = dot(queryVec, v.vector);
          return sim > acc.sim ? { sim, heading: v.heading } : acc;
        },
        { sim: -Infinity, heading: "" }
      );
      return { notePath, similarity: best.sim, heading: best.heading || undefined };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};
