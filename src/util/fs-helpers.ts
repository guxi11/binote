import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";

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

export const removeFile = async (path: string): Promise<boolean> => {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
};
