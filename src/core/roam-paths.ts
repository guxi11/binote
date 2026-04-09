import { join, basename } from "node:path";
import type { RoamConfig } from "../types.js";

const DEFAULT_IGNORE = [".roam", ".git", ".gitignore", ".claude", "node_modules", ".DS_Store", "dist", "build", ".next", ".nuxt"];
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

export const makeConfig = (projectRoot: string, extraIgnore: readonly string[] = []): RoamConfig => {
  const roamDir = join(projectRoot, ".roam");
  return {
    projectRoot,
    roamDir,
    notesDir: join(roamDir, "_notes"),
    indexPath: join(roamDir, "_index.json"),
    ignore: [...DEFAULT_IGNORE, ...extraIgnore],
  };
};

/** src/index.ts → src/index.ts.md */
export const projectPathToNotePath = (projectRelPath: string): string =>
  `${projectRelPath}.md`;

/** src/ → src/_dir.md */
export const dirToNotePath = (dirRelPath: string): string =>
  join(dirRelPath || ".", "_dir.md");

/** src/index.ts.md → src/index.ts, _dir.md → null, _notes/x.md → null */
export const notePathToProjectPath = (noteRelPath: string): string | null => {
  if (isStandaloneNote(noteRelPath) || isDirNote(noteRelPath)) return null;
  return noteRelPath.replace(/\.md$/, "");
};

export const isStandaloneNote = (noteRelPath: string): boolean =>
  noteRelPath.startsWith("_notes/") || noteRelPath.startsWith("_notes\\");

export const isDirNote = (noteRelPath: string): boolean =>
  basename(noteRelPath) === "_dir.md";

export const isMetaFile = (noteRelPath: string): boolean =>
  noteRelPath === "_index.json" || basename(noteRelPath).startsWith("_");

/**
 * Resolve a [[link target]] to a note path.
 * Strategies: exact path match → basename match from all notes.
 */
export const resolveLink = (
  linkTarget: string,
  allNotePaths: readonly string[]
): string | null => {
  // Try exact: [[src/index.ts]] → src/index.ts.md
  const exactPath = `${linkTarget}.md`;
  if (allNotePaths.includes(exactPath)) return exactPath;

  // Try as-is (already has .md or is a standalone note)
  if (allNotePaths.includes(linkTarget)) return linkTarget;

  // Try _dir.md for directory reference
  const dirPath = join(linkTarget, "_dir.md");
  if (allNotePaths.includes(dirPath)) return dirPath;

  // Basename match
  const target = basename(linkTarget);
  const matches = allNotePaths.filter(
    (p) => basename(p) === `${target}.md` || basename(p) === target
  );
  return matches.length === 1 ? matches[0]! : null;
};

/** Absolute path for a note */
export const noteAbsPath = (config: RoamConfig, noteRelPath: string): string =>
  join(config.roamDir, noteRelPath);
