export const INDEX_VERSION = 3 as const;
export const EMBEDDINGS_VERSION = 2 as const;

export type BinoteConfig = {
  readonly projectRoot: string;
  readonly binoteDir: string;
  readonly notesDir: string;
  readonly indexPath: string;
  readonly auditDir: string;
  /** Per-day read logs (jsonl). read_note appends here; demand ranking consumes it. */
  readonly sessionsDir: string;
  /** Semantic-embedding cache (derived index, deletable — constitution §4). */
  readonly embeddingsDir: string;
  readonly ignore: readonly string[];
};

/** Inputs to staleness derivation — all looked up on demand, never persisted.
 *  Change times come from git (last commit touching the path) when available
 *  and the path is clean; fs mtime otherwise. */
export type StalenessInputs = {
  /** ISO change time of the source file. null for _dir / _notes / standalone. */
  readonly sourceMtime: string | null;
  /** ISO change time of the .binote/<path>.md file. */
  readonly noteMtime: string;
  /** Parsed from note frontmatter. null if never verified. */
  readonly lastVerified: string | null;
};

export type StalenessLevel = "fresh" | "warning" | "stale" | "unverified";

export type Staleness = {
  readonly level: StalenessLevel;
  /** Days the source was modified after the note. null when no source file. */
  readonly daysSourceAheadOfNote: number | null;
  /** Days since the note's `lastVerified` frontmatter timestamp. null if never verified. */
  readonly daysSinceVerified: number | null;
  /** Single-line human hint, e.g. "stale (source +47d)". */
  readonly hint: string;
};

export type NoteKind = "file" | "directory" | "standalone";

/** A single [[target]] occurrence in a note, resolved against the note set. */
export type LinkRef = {
  readonly raw: string;
  readonly lineNumber: number;
  readonly resolved: string | null;
  readonly candidates?: readonly string[];
};

/** An incoming link: which note linked here, and where in it. */
export type Backlink = {
  readonly from: string;
  readonly lineNumber: number;
  readonly raw: string;
};

export type LinkIndex = {
  readonly version: typeof INDEX_VERSION;
  /** Per-note outgoing links with line numbers + resolution state.
   *  _audit/ reports are excluded from the graph (both directions) — they are
   *  transient artifacts whose mass backlinks drowned the reverse graph. */
  readonly links: Record<string, readonly LinkRef[]>;
  /** Per-note incoming links (derived from links, stored for O(1) lookup). */
  readonly backlinks: Record<string, readonly Backlink[]>;
  /** Unresolved [[X]] occurrences keyed by raw target. */
  readonly dangling: Record<string, readonly Backlink[]>;
};

export type SyncResult = {
  readonly deleted: readonly string[];
  readonly orphaned: readonly string[];
  readonly linksUpdated: number;
};

/** A [[X]] found on a search-matched line. */
export type MatchedLink = {
  readonly raw: string;
  readonly resolved: string | null;
  readonly candidates?: readonly string[];
};

export type SearchHit = {
  readonly notePath: string;
  readonly lineNumber: number;
  readonly lineContent: string;
  readonly context: string;
  readonly links: readonly MatchedLink[];
  /** Relevance score (ranked engine only; absent on regex scans).
   *  MiniSearch score when lexical-only; RRF score when hybrid-fused. */
  readonly score?: number;
  /** Which recall path surfaced the hit (hybrid fusion only). */
  readonly via?: "lexical" | "semantic" | "both";
  /** Markdown heading of the section a semantic hit landed in (hybrid only). */
  readonly heading?: string;
};

/** Embedding cache file (`.binote/_embeddings/<model>.json`). Derived index,
 *  never authoritative: deletable and fully regenerable from note bodies, like
 *  `_index.json` (constitution §4). Invalidated wholesale on version/model
 *  mismatch, per-entry on note content-hash mismatch. */
export type EmbeddingsCache = {
  readonly version: typeof EMBEDDINGS_VERSION;
  readonly indexVersion: typeof INDEX_VERSION;
  readonly model: string;
  readonly dims: number;
  /** notePath → { sha1 of note body, per-section chunk vectors (base64 Float32
   *  unit vectors) tagged with the markdown heading they came from }. */
  readonly entries: Record<
    string,
    {
      readonly hash: string;
      readonly chunks: ReadonlyArray<{ readonly heading: string; readonly vector: string }>;
    }
  >;
};

export type ResolveStrategy = "exact" | "as-is" | "dir" | "basename" | "substring" | "none";

export type ResolveDetail = {
  readonly resolved: string | null;
  readonly candidates: readonly string[];
  readonly strategy: ResolveStrategy;
};
