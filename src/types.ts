export const INDEX_VERSION = 2 as const;

export type BinoteConfig = {
  readonly projectRoot: string;
  readonly binoteDir: string;
  readonly notesDir: string;
  readonly indexPath: string;
  readonly sessionsDir: string;
  readonly ignore: readonly string[];
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
  /** Per-note outgoing links with line numbers + resolution state. */
  readonly links: Record<string, readonly LinkRef[]>;
  /** Per-note incoming links (derived from links, stored for O(1) lookup). */
  readonly backlinks: Record<string, readonly Backlink[]>;
  /** Flat projection of links (resolved targets only). Legacy. */
  readonly forward: Record<string, readonly string[]>;
  /** Flat projection of backlinks (source paths only). Legacy. */
  readonly reverse: Record<string, readonly string[]>;
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
};

export type ResolveStrategy = "exact" | "as-is" | "dir" | "basename" | "substring" | "none";

export type ResolveDetail = {
  readonly resolved: string | null;
  readonly candidates: readonly string[];
  readonly strategy: ResolveStrategy;
};
