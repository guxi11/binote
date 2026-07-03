import type { BinoteConfig, LinkIndex, LinkRef, Backlink } from "../types.js";
import { INDEX_VERSION } from "../types.js";
import { stat } from "node:fs/promises";
import { scanExistingNotes } from "./scanner.js";
import { readNote } from "./note-io.js";
import { resolveLinkDetailed, noteAbsPath, classifyNote } from "./binote-paths.js";
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

/**
 * Notes that participate in the link graph. _audit/ reports are excluded in
 * both directions: their mass backlinks drowned the reverse graph (the reason
 * backDepth had to stay disabled), and links pointing at them may dangle —
 * they are transient artifacts, not knowledge.
 */
export const indexableNotes = async (config: BinoteConfig): Promise<readonly string[]> =>
  (await scanExistingNotes(config)).filter((n) => classifyNote(n) !== "audit");

/** Build link index from all notes (single pass, line-aware, dangling-tracking). */
export const buildIndex = async (config: BinoteConfig): Promise<LinkIndex> => {
  const notes = await indexableNotes(config);

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

  return { version: INDEX_VERSION, links, backlinks, dangling };
};

/** Save index to _index.json */
export const saveIndex = async (config: BinoteConfig, index: LinkIndex): Promise<void> =>
  writeFileSafe(config.indexPath, JSON.stringify(index, null, 2));

const fileMtimeMs = async (absPath: string): Promise<number> => {
  try { return (await stat(absPath)).mtimeMs; } catch { return 0; }
};

/**
 * Is the cached index newer than every indexable note, with none added/removed?
 * mtime ≥ newest note catches edits + additions; count guards deletes/renames.
 * Self-validation, so out-of-band changes (git merge/checkout, direct fs edits)
 * that bypass `write_note`'s push-invalidation no longer serve a stale graph.
 */
const indexIsFresh = async (config: BinoteConfig, cachedNoteCount: number): Promise<boolean> => {
  const indexMtime = await fileMtimeMs(config.indexPath);
  if (indexMtime === 0) return false;
  const notes = await indexableNotes(config);
  if (notes.length !== cachedNoteCount) return false;
  const mtimes = await Promise.all(notes.map((n) => fileMtimeMs(noteAbsPath(config, n))));
  return mtimes.every((m) => m <= indexMtime);
};

/** Load cached index or rebuild. Rebuilds on version drift or note-mtime/count drift. */
export const getOrBuildIndex = async (config: BinoteConfig): Promise<LinkIndex> => {
  const cached = await readFileSafe(config.indexPath);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as Partial<LinkIndex>;
      if (parsed.version === INDEX_VERSION && parsed.links
          && await indexIsFresh(config, Object.keys(parsed.links).length)) {
        return parsed as LinkIndex;
      }
    } catch { /* fall through to rebuild */ }
  }
  const index = await buildIndex(config);
  await saveIndex(config, index);
  return index;
};

/** Invalidate cached index */
export const invalidateIndex = async (config: BinoteConfig): Promise<void> => {
  const { removeFile } = await import("../util/fs-helpers.js");
  await removeFile(config.indexPath);
};
