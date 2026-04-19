import type { BinoteConfig } from "../types.js";
import { noteAbsPath } from "./binote-paths.js";
import { readFileSafe, writeFileSafe, removeFile } from "../util/fs-helpers.js";

export const readNote = async (config: BinoteConfig, noteRelPath: string): Promise<string | null> =>
  readFileSafe(noteAbsPath(config, noteRelPath));

export const writeNote = async (config: BinoteConfig, noteRelPath: string, content: string): Promise<void> =>
  writeFileSafe(noteAbsPath(config, noteRelPath), content);

export const deleteNote = async (config: BinoteConfig, noteRelPath: string): Promise<boolean> =>
  removeFile(noteAbsPath(config, noteRelPath));

export const noteExists = async (config: BinoteConfig, noteRelPath: string): Promise<boolean> =>
  (await readFileSafe(noteAbsPath(config, noteRelPath))) !== null;
