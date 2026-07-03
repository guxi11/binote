import MiniSearch from "minisearch";
import { stat } from "node:fs/promises";

import type { BinoteConfig, SearchHit, MatchedLink, LinkRef } from "../types.js";
import { scanExistingNotes } from "./scanner.js";
import { readNote } from "./note-io.js";
import { getOrBuildIndex } from "./link-index.js";
import { resolveLinkDetailed, noteAbsPath } from "./binote-paths.js";
import { parseFrontmatter } from "./frontmatter.js";

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export type SearchOptions = {
  readonly regex?: boolean;
  readonly maxResults?: number;
  /** Lines of context above and below the match (default 1 → 3-line window). */
  readonly contextLines?: number;
};

// ── ranked engine (MiniSearch) ────────────────────────────────────────

type Doc = {
  readonly id: string;
  readonly title: string;
  readonly headings: string;
  readonly body: string;
};

const toDoc = (notePath: string, raw: string): Doc => {
  const { body } = parseFrontmatter(raw);
  return {
    id: notePath,
    // Path segments as title terms: "src/lib/expand/foo.ts.md" should win on "foo".
    title: notePath.replace(/\.md$/, "").split("/").join(" "),
    headings: body.split("\n").filter((l) => /^#{1,6}\s/.test(l)).join(" "),
    body,
  };
};

const newEngine = (): MiniSearch<Doc> =>
  new MiniSearch<Doc>({
    fields: ["title", "headings", "body"],
    searchOptions: {
      boost: { title: 4, headings: 2 },
      fuzzy: 0.2,
      prefix: true,
    },
  });

type CachedEngine = {
  readonly stamp: string;
  readonly engine: MiniSearch<Doc>;
  readonly bodies: ReadonlyMap<string, string>;
};

const engineCache = new Map<string, CachedEngine>();

/** Same freshness semantics as the link index: note count + newest mtime. */
const notesStamp = async (config: BinoteConfig, notes: readonly string[]): Promise<string> => {
  const mtimes = await Promise.all(
    notes.map((n) => stat(noteAbsPath(config, n)).then((s) => s.mtimeMs).catch(() => 0)),
  );
  return `${notes.length}:${mtimes.reduce((a, b) => Math.max(a, b), 0)}`;
};

const getEngine = async (config: BinoteConfig, notes: readonly string[]): Promise<CachedEngine> => {
  const stamp = await notesStamp(config, notes);
  const cached = engineCache.get(config.projectRoot);
  if (cached && cached.stamp === stamp) return cached;

  const engine = newEngine();
  const bodies = new Map<string, string>();
  for (const notePath of notes) {
    const raw = await readNote(config, notePath);
    if (!raw) continue;
    const doc = toDoc(notePath, raw);
    bodies.set(notePath, doc.body);
    engine.add(doc);
  }
  const fresh: CachedEngine = { stamp, engine, bodies };
  engineCache.set(config.projectRoot, fresh);
  return fresh;
};

// ── shared line helpers ───────────────────────────────────────────────

/** Build a per-note, per-line lookup of LinkRef[] from the index. */
const indexLinkRefsByLine = (
  links: Record<string, readonly LinkRef[]>
): ReadonlyMap<string, ReadonlyMap<number, readonly LinkRef[]>> => {
  const out = new Map<string, Map<number, LinkRef[]>>();
  for (const [notePath, refs] of Object.entries(links)) {
    const inner = new Map<number, LinkRef[]>();
    for (const ref of refs) {
      const bucket = inner.get(ref.lineNumber);
      if (bucket) bucket.push(ref);
      else inner.set(ref.lineNumber, [ref]);
    }
    out.set(notePath, inner);
  }
  return out;
};

const refToMatchedLink = (ref: LinkRef): MatchedLink =>
  ref.candidates && ref.candidates.length > 0
    ? { raw: ref.raw, resolved: ref.resolved, candidates: ref.candidates }
    : { raw: ref.raw, resolved: ref.resolved };

type LineContext = {
  readonly lineNumber: number;
  readonly lineContent: string;
  readonly context: string;
};

const windowAt = (lines: readonly string[], i: number, ctx: number): LineContext => ({
  lineNumber: i + 1,
  lineContent: lines[i]!,
  context: lines.slice(Math.max(0, i - ctx), Math.min(lines.length, i + ctx + 1)).join("\n"),
});

/** First line containing any of the matched terms (case-insensitive). */
const bestLine = (lines: readonly string[], terms: readonly string[], ctx: number): LineContext => {
  const lowered = terms.map((t) => t.toLowerCase());
  const i = lines.findIndex((l) => {
    const ll = l.toLowerCase();
    return lowered.some((t) => ll.includes(t));
  });
  // Title-only matches (path terms) have no body line — show the head of the note.
  return windowAt(lines, Math.max(0, i), ctx);
};

// ── search entry point ────────────────────────────────────────────────

/**
 * Shared search engine used by both CLI and MCP search tools.
 * Plain queries → MiniSearch (relevance-ranked, fuzzy, path/heading-boosted),
 * with a substring-scan fallback when ranking finds nothing (exact code tokens).
 * regex: true → line scan in note order (no ranking).
 */
export const searchNotes = async (
  config: BinoteConfig,
  query: string,
  opts: SearchOptions = {}
): Promise<readonly SearchHit[]> => {
  const limit = opts.maxResults ?? 20;
  const ctx = opts.contextLines ?? 1;

  const notes = await scanExistingNotes(config);
  const index = await getOrBuildIndex(config);
  const refsByLine = indexLinkRefsByLine(index.links);

  const linksForLine = (
    notePath: string,
    lineNumber: number,
    lineContent: string
  ): readonly MatchedLink[] => {
    const cached = refsByLine.get(notePath)?.get(lineNumber);
    if (cached) return cached.map(refToMatchedLink);
    // Fallback when index is stale relative to current file content.
    const found: MatchedLink[] = [];
    for (const m of lineContent.matchAll(LINK_RE)) {
      const detail = resolveLinkDetailed(m[1]!, notes);
      found.push(
        detail.candidates.length > 0
          ? { raw: m[1]!, resolved: detail.resolved, candidates: detail.candidates }
          : { raw: m[1]!, resolved: detail.resolved }
      );
    }
    return found;
  };

  const scanHits = async (matches: (line: string) => boolean): Promise<readonly SearchHit[]> => {
    const hits: SearchHit[] = [];
    for (const notePath of notes) {
      if (hits.length >= limit) break;
      const content = await readNote(config, notePath);
      if (!content) continue;
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= limit) break;
        if (!matches(lines[i]!)) continue;
        const w = windowAt(lines, i, ctx);
        hits.push({ notePath, ...w, links: linksForLine(notePath, w.lineNumber, w.lineContent) });
      }
    }
    return hits;
  };

  if (opts.regex) {
    const pattern = new RegExp(query, "i");
    return scanHits((line) => pattern.test(line));
  }

  const { engine, bodies } = await getEngine(config, notes);
  const ranked = engine.search(query).slice(0, limit);
  if (ranked.length === 0) {
    // Tokenizer-hostile queries (exact operators, punctuation) → substring scan.
    const lower = query.toLowerCase();
    return scanHits((line) => line.toLowerCase().includes(lower));
  }

  return ranked.map((r) => {
    const notePath = r.id as string;
    const lines = (bodies.get(notePath) ?? "").split("\n");
    const w = bestLine(lines, r.terms, ctx);
    return {
      notePath,
      ...w,
      links: linksForLine(notePath, w.lineNumber, w.lineContent),
      score: Math.round(r.score * 100) / 100,
    };
  });
};
