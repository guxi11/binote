import type { RoamConfig, LinkIndex } from "../types.js";
import { scanExistingNotes } from "./scanner.js";
import { readNote } from "./note-io.js";
import { extractLinks } from "./link-parser.js";
import { resolveLink } from "./roam-paths.js";
import { readFileSafe, writeFileSafe } from "../util/fs-helpers.js";

/** Build link index from all notes */
export const buildIndex = async (config: RoamConfig): Promise<LinkIndex> => {
  const notes = await scanExistingNotes(config);
  const forward: Record<string, string[]> = {};
  const reverse: Record<string, string[]> = {};

  for (const notePath of notes) {
    const content = await readNote(config, notePath);
    if (!content) continue;

    const rawLinks = extractLinks(content);
    const resolved = rawLinks
      .map((target) => resolveLink(target, notes))
      .filter((r): r is string => r !== null);

    forward[notePath] = resolved;
    resolved.forEach((target) => {
      reverse[target] = [...(reverse[target] ?? []), notePath];
    });
  }

  return { forward, reverse };
};

/** Save index to _index.json */
export const saveIndex = async (config: RoamConfig, index: LinkIndex): Promise<void> =>
  writeFileSafe(config.indexPath, JSON.stringify(index, null, 2));

/** Load cached index or rebuild */
export const getOrBuildIndex = async (config: RoamConfig): Promise<LinkIndex> => {
  const cached = await readFileSafe(config.indexPath);
  if (cached) {
    try {
      return JSON.parse(cached) as LinkIndex;
    } catch { /* rebuild */ }
  }
  const index = await buildIndex(config);
  await saveIndex(config, index);
  return index;
};

/** Invalidate cached index */
export const invalidateIndex = async (config: RoamConfig): Promise<void> => {
  const { removeFile } = await import("../util/fs-helpers.js");
  await removeFile(config.indexPath);
};
