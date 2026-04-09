import type { RoamConfig } from "../types.js";
import { noteAbsPath } from "./roam-paths.js";
import { readFileSafe, writeFileSafe, removeFile } from "../util/fs-helpers.js";

export const readNote = async (config: RoamConfig, noteRelPath: string): Promise<string | null> =>
  readFileSafe(noteAbsPath(config, noteRelPath));

export const writeNote = async (config: RoamConfig, noteRelPath: string, content: string): Promise<void> =>
  writeFileSafe(noteAbsPath(config, noteRelPath), content);

export const deleteNote = async (config: RoamConfig, noteRelPath: string): Promise<boolean> =>
  removeFile(noteAbsPath(config, noteRelPath));

export const noteExists = async (config: RoamConfig, noteRelPath: string): Promise<boolean> =>
  (await readFileSafe(noteAbsPath(config, noteRelPath))) !== null;
