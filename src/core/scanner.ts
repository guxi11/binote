import type { BacknoteConfig } from "../types.js";
import { walkDir, walkDirWithDirs } from "../util/fs-helpers.js";

/** Scan project files (excluding ignored dirs) */
export const scanProjectFiles = (config: BacknoteConfig): Promise<readonly string[]> =>
  walkDir(config.projectRoot, config.ignore);

/** Scan project files and directories */
export const scanProjectStructure = (config: BacknoteConfig) =>
  walkDirWithDirs(config.projectRoot, config.ignore);

/** Scan existing notes under .backnote/ */
export const scanExistingNotes = async (config: BacknoteConfig): Promise<readonly string[]> => {
  const files = await walkDir(config.backnoteDir, []);
  return files.filter((f) => f.endsWith(".md"));
};
