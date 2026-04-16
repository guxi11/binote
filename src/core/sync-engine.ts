import type { BinoteConfig, SyncResult } from "../types.js";
import { scanProjectFiles, scanExistingNotes } from "./scanner.js";
import { readNote, writeNote } from "./note-io.js";
import { notePathToProjectPath } from "./binote-paths.js";
import { buildIndex, saveIndex } from "./link-index.js";

/** Detect orphaned notes (project file deleted, note still exists) */
const findOrphans = (
  projectFiles: readonly string[],
  noteFiles: readonly string[]
): readonly string[] => {
  const projectSet = new Set(projectFiles);
  return noteFiles.filter((note) => {
    const projPath = notePathToProjectPath(note);
    return projPath !== null && !projectSet.has(projPath);
  });
};

/** Mark a note as orphaned by prepending a comment */
const markOrphaned = async (config: BinoteConfig, notePath: string): Promise<void> => {
  const content = await readNote(config, notePath);
  if (!content || content.includes("<!-- ORPHANED")) return;
  await writeNote(
    config,
    notePath,
    `<!-- ORPHANED: original project file deleted -->\n\n${content}`
  );
};

/** Full sync: detect orphans, mark them, rebuild index */
export const sync = async (config: BinoteConfig, dryRun = false): Promise<SyncResult> => {
  const projectFiles = await scanProjectFiles(config);
  const noteFiles = await scanExistingNotes(config);
  const orphaned = findOrphans(projectFiles, noteFiles);

  if (!dryRun) {
    for (const note of orphaned) {
      await markOrphaned(config, note);
    }
  }

  const index = await buildIndex(config);
  if (!dryRun) {
    await saveIndex(config, index);
  }

  return {
    deleted: [],
    orphaned,
    linksUpdated: 0,
  };
};
