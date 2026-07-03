import { stat } from "node:fs/promises";
import { join } from "node:path";

import type { BinoteConfig, Staleness, StalenessLevel, StalenessInputs } from "../types.js";
import { writeFileSafe } from "../util/fs-helpers.js";
import { noteAbsPath, notePathToProjectPath } from "./binote-paths.js";
import { readNote } from "./note-io.js";
import { parseFrontmatter, fmString, updateFrontmatter } from "./frontmatter.js";
import { getGitTimes, gitChangeTimeIso, type GitTimes } from "./git-times.js";

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

/** Pure derivation: change times + frontmatter → Staleness. */
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

/**
 * Change time for a projectRoot-relative path: last commit time when the path
 * is tracked and clean (survives checkout/clone, which rewrite mtimes);
 * fs mtime when dirty, untracked, or outside git.
 */
const changeTimeIso = async (
  config: BinoteConfig,
  relPath: string,
  git: GitTimes | null,
): Promise<string | null> =>
  gitChangeTimeIso(git, relPath) ?? mtimeIso(join(config.projectRoot, relPath));

const stalenessForOne = async (
  config: BinoteConfig,
  notePath: string,
  git: GitTimes | null,
): Promise<Staleness | null> => {
  // Note existence gate stays fs-based: a committed-then-deleted note must skip.
  const noteMtime = await mtimeIso(noteAbsPath(config, notePath));
  if (noteMtime === null) return null;
  const noteTime = gitChangeTimeIso(git, `.binote/${notePath}`) ?? noteMtime;

  const projPath = notePathToProjectPath(notePath);
  const sourceTime = projPath === null
    ? null
    : await changeTimeIso(config, projPath, git);

  const raw = await readNote(config, notePath);
  const lastVerified = raw
    ? fmString(parseFrontmatter(raw).frontmatter, "lastVerified")
    : null;
  return computeStaleness({ sourceMtime: sourceTime, noteMtime: noteTime, lastVerified });
};

/** Batch staleness lookup. Skips notes that don't exist on disk. */
export const stalenessFor = async (
  config: BinoteConfig,
  notePaths: readonly string[],
): Promise<Readonly<Record<string, Staleness>>> => {
  const git = await getGitTimes(config.projectRoot);
  const entries = await Promise.all(
    notePaths.map(async (p): Promise<readonly [string, Staleness] | null> => {
      const s = await stalenessForOne(config, p, git);
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
