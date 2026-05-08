import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { BinoteConfig, Staleness, StalenessLevel, StalenessInputs } from "../types.js";
import { writeFileSafe } from "../util/fs-helpers.js";
import { noteAbsPath, notePathToProjectPath } from "./binote-paths.js";
import { readNote } from "./note-io.js";
import { parseFrontmatter, updateFrontmatter } from "./frontmatter.js";

const DAY_MS = 86_400_000;
const WARNING_DAYS = 7;
const STALE_DAYS = 30;

const mtimeIso = async (absPath: string): Promise<string | null> => {
  try {
    return (await stat(absPath)).mtime.toISOString();
  } catch {
    return null;
  }
};

const daysBetween = (laterIso: string, earlierIso: string): number =>
  Math.floor((Date.parse(laterIso) - Date.parse(earlierIso)) / DAY_MS);

const daysSince = (iso: string): number =>
  Math.floor((Date.now() - Date.parse(iso)) / DAY_MS);

const levelFromDrift = (drift: number): StalenessLevel =>
  drift < WARNING_DAYS ? "fresh"
    : drift < STALE_DAYS ? "warning"
    : "stale";

/** Pure derivation: stats + frontmatter → Staleness. */
export const computeStaleness = (m: StalenessInputs): Staleness => {
  const daysSinceVerified = m.lastVerified ? daysSince(m.lastVerified) : null;

  if (m.sourceMtime === null) {
    const level: StalenessLevel = m.lastVerified ? "fresh" : "unverified";
    return {
      level,
      daysSourceAheadOfNote: null,
      daysSinceVerified,
      hint: level === "fresh"
        ? `verified ${daysSinceVerified}d ago`
        : "no source / never verified",
    };
  }

  // The "last review" reference point is whichever happened later: a manual
  // edit (noteMtime) or an explicit verify (lastVerified). Both reset drift.
  const reference = m.lastVerified && Date.parse(m.lastVerified) > Date.parse(m.noteMtime)
    ? m.lastVerified
    : m.noteMtime;
  const drift = daysBetween(m.sourceMtime, reference);
  const level = levelFromDrift(drift);
  const hint = level === "fresh"
    ? drift <= 0
      ? "fresh (source older than note)"
      : `fresh (source +${drift}d vs note)`
    : `${level} (source +${drift}d)`;
  return { level, daysSourceAheadOfNote: drift, daysSinceVerified, hint };
};

const stalenessForOne = async (
  config: BinoteConfig,
  notePath: string,
): Promise<Staleness | null> => {
  const noteMtime = await mtimeIso(noteAbsPath(config, notePath));
  if (noteMtime === null) return null;
  const projPath = notePathToProjectPath(notePath);
  const sourceMtime = projPath
    ? await mtimeIso(join(config.projectRoot, projPath))
    : null;
  const raw = await readNote(config, notePath);
  const lastVerified = raw
    ? parseFrontmatter(raw).frontmatter.lastVerified ?? null
    : null;
  return computeStaleness({ sourceMtime, noteMtime, lastVerified });
};

/** Batch staleness lookup. Skips notes that don't exist on disk. */
export const stalenessFor = async (
  config: BinoteConfig,
  notePaths: readonly string[],
): Promise<Readonly<Record<string, Staleness>>> => {
  const entries = await Promise.all(
    notePaths.map(async (p): Promise<readonly [string, Staleness] | null> => {
      const s = await stalenessForOne(config, p);
      return s ? [p, s] : null;
    }),
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, Staleness] => e !== null));
};

/**
 * Stamp `lastVerified: <ISO now>` into the note's frontmatter.
 * Preserves body and any other frontmatter keys. Skips link-index invalidation
 * because frontmatter changes don't introduce or remove [[wiki links]].
 */
export const markVerified = async (
  config: BinoteConfig,
  notePath: string,
): Promise<void> => {
  const raw = await readNote(config, notePath);
  if (raw === null) return;
  const updated = updateFrontmatter(raw, { lastVerified: new Date().toISOString() });
  await writeFileSafe(noteAbsPath(config, notePath), updated);
};
