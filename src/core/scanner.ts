import type { BinoteConfig } from "../types.js";
import { walkDir, walkDirWithDirs } from "../util/fs-helpers.js";

/** Scan project files (excluding ignored dirs) */
export const scanProjectFiles = (config: BinoteConfig): Promise<readonly string[]> =>
  walkDir(config.projectRoot, config.ignore);

/** Scan project files and directories */
export const scanProjectStructure = (config: BinoteConfig) =>
  walkDirWithDirs(config.projectRoot, config.ignore);

/** Scan existing notes under .binote/ */
export const scanExistingNotes = async (config: BinoteConfig): Promise<readonly string[]> => {
  const files = await walkDir(config.binoteDir, []);
  return files.filter((f) => f.endsWith(".md"));
};
