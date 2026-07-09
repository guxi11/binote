import { join, basename } from "node:path";
import type { BinoteConfig, ResolveDetail } from "../types.js";

const DEFAULT_IGNORE = [".binote", ".git", ".gitignore", ".claude", "node_modules", ".DS_Store", "dist", "build", ".next", ".nuxt"];
const SKIP_EXTENSIONS = new Set([".json", ".md", ".txt", ".lock", ".yaml", ".yml", ".toml", ".csv", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf", ".eot", ".map", ".log"]);

/** Whether a file should be mirrored based on extension and name */
export const shouldMirror = (filePath: string): boolean => {
  const name = basename(filePath);
  // Skip dotfiles (e.g. .npmrc, .env, .eslintrc)
  if (name.startsWith(".")) return false;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return true;
  return !SKIP_EXTENSIONS.has(name.slice(dot).toLowerCase());
};

export const makeConfig = (projectRoot: string, extraIgnore: readonly string[] = []): BinoteConfig => {
  const binoteDir = join(projectRoot, ".binote");
  return {
    projectRoot,
    binoteDir,
    notesDir: join(binoteDir, "_notes"),
    indexPath: join(binoteDir, "_index.json"),
    auditDir: join(binoteDir, "_audit"),
    sessionsDir: join(binoteDir, "_sessions"),
    embeddingsDir: join(binoteDir, "_embeddings"),
    ignore: [...DEFAULT_IGNORE, ...extraIgnore],
  };
};

/** src/index.ts → src/index.ts.md */
export const projectPathToNotePath = (projectRelPath: string): string =>
  `${projectRelPath}.md`;

/** src/ → src/_dir.md */
export const dirToNotePath = (dirRelPath: string): string =>
  join(dirRelPath || ".", "_dir.md");

/** src/index.ts.md → src/index.ts, _dir.md → null, _notes/x.md → null, _design/x.md → null, _features/x/y.md → null */
export const notePathToProjectPath = (noteRelPath: string): string | null => {
  if (isNonMirrorNote(noteRelPath) || isDirNote(noteRelPath)) return null;
  return noteRelPath.replace(/\.md$/, "");
};

const firstSegment = (p: string): string => p.split(/[\\/]/, 1)[0] ?? "";

/** Any note with no source-file counterpart: top-level `_<name>/` dir or root `_<name>.md` file. */
export const isNonMirrorNote = (noteRelPath: string): boolean =>
  firstSegment(noteRelPath).startsWith("_");

export const isStandaloneNote = (noteRelPath: string): boolean =>
  firstSegment(noteRelPath) === "_notes";

export const isDesignNote = (noteRelPath: string): boolean =>
  firstSegment(noteRelPath) === "_design";

export const isFeatureNote = (noteRelPath: string): boolean =>
  firstSegment(noteRelPath) === "_features";

export const isConstitutionNote = (noteRelPath: string): boolean =>
  noteRelPath === "_constitution.md";

export const isDirNote = (noteRelPath: string): boolean =>
  basename(noteRelPath) === "_dir.md";

export const isMetaFile = (noteRelPath: string): boolean =>
  noteRelPath === "_index.json" || basename(noteRelPath).startsWith("_");

/** Classify a note for audit / coverage reports. Order matters — most specific first. */
export type NoteClass = "constitution" | "design" | "feature" | "notes" | "audit" | "dir" | "file";
export const classifyNote = (noteRelPath: string): NoteClass => {
  if (isConstitutionNote(noteRelPath)) return "constitution";
  if (isDesignNote(noteRelPath)) return "design";
  if (isFeatureNote(noteRelPath)) return "feature";
  if (isStandaloneNote(noteRelPath)) return "notes";
  if (firstSegment(noteRelPath) === "_audit") return "audit";
  if (isDirNote(noteRelPath)) return "dir";
  return "file";
};

/**
 * Resolve a [[link target]] to a note path with full detail.
 * Strategies tried in order:
 *   1. exact     — `target.md` exists
 *   2. as-is     — target already has .md / is a standalone note
 *   3. dir       — `target/_dir.md` exists
 *   4. basename  — unique basename match (returns candidates if multiple)
 *   5. substring — case-insensitive basename substring match (lenient typo recovery)
 */
export const resolveLinkDetailed = (
  linkTarget: string,
  allNotePaths: readonly string[]
): ResolveDetail => {
  const exactPath = `${linkTarget}.md`;
  if (allNotePaths.includes(exactPath))
    return { resolved: exactPath, candidates: [], strategy: "exact" };

  if (allNotePaths.includes(linkTarget))
    return { resolved: linkTarget, candidates: [], strategy: "as-is" };

  const dirPath = join(linkTarget, "_dir.md");
  if (allNotePaths.includes(dirPath))
    return { resolved: dirPath, candidates: [], strategy: "dir" };

  const target = basename(linkTarget);
  const basenameMatches = allNotePaths.filter(
    (p) => basename(p) === `${target}.md` || basename(p) === target
  );
  if (basenameMatches.length === 1)
    return { resolved: basenameMatches[0]!, candidates: [], strategy: "basename" };
  if (basenameMatches.length > 1)
    return { resolved: null, candidates: basenameMatches, strategy: "basename" };

  const needle = target.toLowerCase();
  const substringMatches = allNotePaths.filter((p) =>
    basename(p).toLowerCase().includes(needle)
  );
  if (substringMatches.length === 1)
    return { resolved: substringMatches[0]!, candidates: [], strategy: "substring" };
  if (substringMatches.length > 1)
    return { resolved: null, candidates: substringMatches.slice(0, 10), strategy: "substring" };

  return { resolved: null, candidates: [], strategy: "none" };
};

/**
 * Strict link resolver. Preserves the original behavior: never falls back to
 * substring matching, returns string|null. Internally delegates to the detailed
 * version so resolution logic stays in one place.
 */
export const resolveLink = (
  linkTarget: string,
  allNotePaths: readonly string[]
): string | null => {
  const detail = resolveLinkDetailed(linkTarget, allNotePaths);
  return detail.strategy === "substring" ? null : detail.resolved;
};

/** Absolute path for a note */
export const noteAbsPath = (config: BinoteConfig, noteRelPath: string): string =>
  join(config.binoteDir, noteRelPath);
