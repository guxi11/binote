import type { BacknoteConfig, LinkIndex, LinkRef, Backlink } from "../types.js";
import { INDEX_VERSION } from "../types.js";
import { scanExistingNotes } from "./scanner.js";
import { readNote } from "./note-io.js";
import { resolveLinkDetailed } from "./backnote-paths.js";
import { readFileSafe, writeFileSafe } from "../util/fs-helpers.js";

const LINK_RE = /\[\[([^\[\]]+)\]\]/g;

type Occurrence = { readonly raw: string; readonly lineNumber: number };

/** Single-pass extraction of [[link]] occurrences with line numbers. */
const scanOccurrences = (content: string): readonly Occurrence[] =>
  content.split("\n").flatMap((line, i) =>
    Array.from(line.matchAll(LINK_RE), (m): Occurrence => ({
      raw: m[1]!,
      lineNumber: i + 1,
    }))
  );

/** Build link index from all notes (single pass, line-aware, dangling-tracking). */
export const buildIndex = async (config: BacknoteConfig): Promise<LinkIndex> => {
  const notes = await scanExistingNotes(config);

  // Pass 1: collect raw occurrences per note.
  const occurrencesByNote: Record<string, readonly Occurrence[]> = {};
  for (const notePath of notes) {
    const content = await readNote(config, notePath);
    occurrencesByNote[notePath] = content ? scanOccurrences(content) : [];
  }

  // Pass 2: resolve and fold into links / backlinks / dangling.
  const links: Record<string, LinkRef[]> = {};
  const backlinks: Record<string, Backlink[]> = {};
  const dangling: Record<string, Backlink[]> = {};

  for (const notePath of notes) {
    const refs: LinkRef[] = [];
    for (const { raw, lineNumber } of occurrencesByNote[notePath]!) {
      const detail = resolveLinkDetailed(raw, notes);
      const ref: LinkRef = detail.resolved
        ? { raw, lineNumber, resolved: detail.resolved }
        : { raw, lineNumber, resolved: null, candidates: detail.candidates };
      refs.push(ref);

      if (detail.resolved) {
        (backlinks[detail.resolved] ??= []).push({ from: notePath, lineNumber, raw });
      } else {
        (dangling[raw] ??= []).push({ from: notePath, lineNumber, raw });
      }
    }
    links[notePath] = refs;
  }

  // Derive flat projections for legacy consumers.
  const forward: Record<string, readonly string[]> = Object.fromEntries(
    Object.entries(links).map(([k, refs]) => [
      k,
      refs.flatMap((r) => (r.resolved ? [r.resolved] : [])),
    ])
  );
  const reverse: Record<string, readonly string[]> = Object.fromEntries(
    Object.entries(backlinks).map(([k, bls]) => [k, bls.map((b) => b.from)])
  );

  return { version: INDEX_VERSION, links, backlinks, forward, reverse, dangling };
};

/** Save index to _index.json */
export const saveIndex = async (config: BacknoteConfig, index: LinkIndex): Promise<void> =>
  writeFileSafe(config.indexPath, JSON.stringify(index, null, 2));

/** Load cached index or rebuild. Stale (older version) caches silently rebuild. */
export const getOrBuildIndex = async (config: BacknoteConfig): Promise<LinkIndex> => {
  const cached = await readFileSafe(config.indexPath);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Partial<LinkIndex>;
      if (parsed.version === INDEX_VERSION) return parsed as LinkIndex;
    } catch { /* fall through to rebuild */ }
  }
  const index = await buildIndex(config);
  await saveIndex(config, index);
  return index;
};

/** Invalidate cached index */
export const invalidateIndex = async (config: BacknoteConfig): Promise<void> => {
  const { removeFile } = await import("../util/fs-helpers.js");
  await removeFile(config.indexPath);
};
