import { globby } from "globby";
import type { BinoteConfig } from "../types.js";

/**
 * Name-only ignore entries expand to recursive globs; anything already
 * glob-shaped (contains / or *) passes through. This is what makes init's
 * `ignore` param actually work.
 */
const toGlobs = (ignore: readonly string[]): string[] =>
  ignore.flatMap((e) => (/[*/]/.test(e) ? [e] : [`**/${e}`, `**/${e}/**`]));

/** Scan project files. gitignore-aware; dotfiles excluded. Posix paths. */
export const scanProjectFiles = (config: BinoteConfig): Promise<string[]> =>
  globby(["**/*"], {
    cwd: config.projectRoot,
    gitignore: true,
    ignore: toGlobs(config.ignore),
    dot: false,
  });

/** Scan project files and directories. */
export const scanProjectStructure = async (
  config: BinoteConfig,
): Promise<{ files: readonly string[]; dirs: readonly string[] }> => {
  const [files, dirs] = await Promise.all([
    scanProjectFiles(config),
    globby(["**/*"], {
      cwd: config.projectRoot,
      gitignore: true,
      ignore: toGlobs(config.ignore),
      dot: false,
      onlyDirectories: true,
    }),
  ]);
  return { files, dirs };
};

/** Scan existing notes under .binote/. NOT gitignore-aware — _audit/ etc. must stay visible. */
export const scanExistingNotes = (config: BinoteConfig): Promise<string[]> =>
  globby(["**/*.md"], { cwd: config.binoteDir, gitignore: false, dot: false });
