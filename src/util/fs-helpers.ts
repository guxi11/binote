import { mkdir, readFile, writeFile, readdir, unlink, stat } from "node:fs/promises";
import { join, relative } from "node:path";

export const ensureDir = (dirPath: string): Promise<void> =>
  mkdir(dirPath, { recursive: true }).then(() => undefined);

export const readFileSafe = async (path: string): Promise<string | null> => {
  try {
    return await readFile(path, "utf-8");
  } catch {
    return null;
  }
};

export const writeFileSafe = async (path: string, content: string): Promise<void> => {
  await ensureDir(join(path, ".."));
  await writeFile(path, content, "utf-8");
};

export const fileSize = async (path: string): Promise<number> => {
  try {
    const s = await stat(path);
    return s.size;
  } catch {
    return 0;
  }
};

export const removeFile = async (path: string): Promise<boolean> => {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
};

/** Recursively walk a directory, returning relative paths */
export const walkDir = async (
  dir: string,
  ignore: readonly string[] = [],
  root?: string
): Promise<readonly string[]> => {
  const base = root ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (ignore.includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath, ignore, base)));
    } else {
      results.push(relative(base, fullPath));
    }
  }
  return results;
};

/** Walk and return both files and directories (dirs suffixed with /) */
export const walkDirWithDirs = async (
  dir: string,
  ignore: readonly string[] = [],
  root?: string
): Promise<{ files: readonly string[]; dirs: readonly string[] }> => {
  const base = root ?? dir;
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  const dirs: string[] = [];

  for (const entry of entries) {
    if (ignore.includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      dirs.push(relative(base, fullPath));
      const sub = await walkDirWithDirs(fullPath, ignore, base);
      files.push(...sub.files);
      dirs.push(...sub.dirs);
    } else {
      files.push(relative(base, fullPath));
    }
  }
  return { files, dirs };
};
