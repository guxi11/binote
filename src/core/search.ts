import type { BacknoteConfig, SearchHit, MatchedLink, LinkRef } from "../types.js";
import { scanExistingNotes } from "./scanner.js";
import { readNote } from "./note-io.js";
import { getOrBuildIndex } from "./link-index.js";
import { resolveLinkDetailed } from "./backnote-paths.js";

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

export type SearchOptions = {
  readonly regex?: boolean;
  readonly maxResults?: number;
  /** Lines of context above and below the match (default 1 → 3-line window). */
  readonly contextLines?: number;
};

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

/** Shared search engine used by both CLI and MCP search tools. */
export const searchNotes = async (
  config: BacknoteConfig,
  query: string,
  opts: SearchOptions = {}
): Promise<readonly SearchHit[]> => {
  const limit = opts.maxResults ?? 20;
  const ctx = opts.contextLines ?? 1;
  const pattern = opts.regex ? new RegExp(query, "gi") : null;
  const lowerQuery = query.toLowerCase();

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

  const hits: SearchHit[] = [];
  for (const notePath of notes) {
    if (hits.length >= limit) break;
    const content = await readNote(config, notePath);
    if (!content) continue;

    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= limit) break;
      const line = lines[i]!;
      const match = pattern ? pattern.test(line) : line.toLowerCase().includes(lowerQuery);
      if (pattern) pattern.lastIndex = 0;
      if (!match) continue;

      const start = Math.max(0, i - ctx);
      const end = Math.min(lines.length, i + ctx + 1);
      hits.push({
        notePath,
        lineNumber: i + 1,
        lineContent: line,
        context: lines.slice(start, end).join("\n"),
        links: linksForLine(notePath, i + 1, line),
      });
    }
  }
  return hits;
};
