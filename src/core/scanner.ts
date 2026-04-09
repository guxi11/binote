import type { RoamConfig } from "../types.js";
import { walkDir, walkDirWithDirs } from "../util/fs-helpers.js";

/** Scan project files (excluding ignored dirs) */
export const scanProjectFiles = (config: RoamConfig): Promise<readonly string[]> =>
  walkDir(config.projectRoot, config.ignore);

/** Scan project files and directories */
export const scanProjectStructure = (config: RoamConfig) =>
  walkDirWithDirs(config.projectRoot, config.ignore);

/** Scan existing notes under .roam/ */
export const scanExistingNotes = async (config: RoamConfig): Promise<readonly string[]> => {
  const files = await walkDir(config.roamDir, []);
  return files.filter((f) => f.endsWith(".md"));
};
