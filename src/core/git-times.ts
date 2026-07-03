/**
 * Git-backed change times for staleness.
 *
 * fs mtime lies after `git checkout`/`clone`/branch switches (every file looks
 * freshly modified). The durable signal is the last commit that touched a
 * path; the working tree overrides it only for currently-dirty files.
 *
 * One `git log --name-only` walk per HEAD (cached per process) yields
 * last-commit times for every path; `git status` (cheap, uncached) yields the
 * dirty set. Non-git projects → null, callers fall back to mtime.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export type GitTimes = {
  /** repo-relative path (from projectRoot) → last commit time, epoch ms. */
  readonly lastCommitMs: ReadonlyMap<string, number>;
  /** Paths with uncommitted changes (staged, unstaged, or untracked). */
  readonly dirty: ReadonlySet<string>;
};

const git = async (root: string, args: readonly string[]): Promise<string | null> => {
  try {
    const { stdout } = await run("git", ["-C", root, ...args], {
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  } catch {
    return null;
  }
};

/** Parse `git log --format=%x01%ct --name-only`: newest-first, first-seen wins. */
const parseLogTimes = (out: string, prefix: string): Map<string, number> => {
  const times = new Map<string, number>();
  let currentMs = 0;
  for (const line of out.split("\n")) {
    if (line.startsWith("\x01")) {
      currentMs = Number(line.slice(1)) * 1000;
      continue;
    }
    if (line.length === 0) continue;
    // Paths are repo-root-relative; strip the projectRoot prefix.
    const rel = prefix.length > 0
      ? line.startsWith(prefix) ? line.slice(prefix.length) : null
      : line;
    if (rel !== null && !times.has(rel)) times.set(rel, currentMs);
  }
  return times;
};

/** `git status --porcelain` → projectRoot-relative dirty paths. */
const parseStatus = (out: string, prefix: string): Set<string> => {
  const dirty = new Set<string>();
  for (const line of out.split("\n")) {
    if (line.length < 4) continue;
    const raw = line.slice(3);
    // Renames render as "old -> new"; both sides count as dirty.
    for (const p of raw.split(" -> ")) {
      const clean = p.replace(/^"|"$/g, "");
      const rel = prefix.length > 0
        ? clean.startsWith(prefix) ? clean.slice(prefix.length) : null
        : clean;
      if (rel !== null) dirty.add(rel);
    }
  }
  return dirty;
};

const logCache = new Map<string, { head: string; prefix: string; times: Map<string, number> }>();

export const getGitTimes = async (projectRoot: string): Promise<GitTimes | null> => {
  const head = (await git(projectRoot, ["rev-parse", "HEAD"]))?.trim();
  if (!head) return null;

  // projectRoot may sit below the repo root — log/status paths are repo-relative.
  const prefix = (await git(projectRoot, ["rev-parse", "--show-prefix"]))?.trim() ?? "";

  let cached = logCache.get(projectRoot);
  if (!cached || cached.head !== head) {
    const out = await git(projectRoot, ["log", "--format=%x01%ct", "--name-only", "--no-renames"]);
    if (out === null) return null;
    cached = { head, prefix, times: parseLogTimes(out, prefix) };
    logCache.set(projectRoot, cached);
  }

  const status = await git(projectRoot, ["status", "--porcelain"]);
  const dirty = status === null ? new Set<string>() : parseStatus(status, cached.prefix);

  return { lastCommitMs: cached.times, dirty };
};

/**
 * Change time for a projectRoot-relative path: last commit time when tracked
 * and clean; null when the caller should fall back to fs mtime (dirty,
 * untracked, or no git).
 */
export const gitChangeTimeIso = (times: GitTimes | null, relPath: string): string | null => {
  if (!times || times.dirty.has(relPath)) return null;
  const ms = times.lastCommitMs.get(relPath);
  return ms === undefined ? null : new Date(ms).toISOString();
};

/** Test seam: drop the per-process log cache. */
export const clearGitTimesCache = (): void => logCache.clear();
