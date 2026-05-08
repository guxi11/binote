import { join } from "node:path";

import type { BinoteConfig } from "../types.js";
import { readFileSafe, writeFileSafe } from "../util/fs-helpers.js";

/**
 * Paths under .binote/ that should NOT be checked into version control.
 *
 * Policy: notes (_dir.md, _notes/, file mirrors) are the collaborative truth
 * and SHOULD be committed. Everything else is either derived (regenerable
 * from notes) or per-developer activity logs.
 *
 * - _index.json   — derived from [[link]] scan; rebuild_index regenerates
 * - _meta.json    — legacy artifact from earlier design; if present, ignore
 * - _sessions/    — per-developer read logs (jsonl)
 * - _audit/       — transient verify reports; rerun /binote:verify to refresh
 * - _read.log     — legacy single-file log (pre-_sessions)
 */
export const PRIVATE_PATHS: readonly string[] = [
  ".binote/_index.json",
  ".binote/_meta.json",
  ".binote/_sessions/",
  ".binote/_audit/",
  ".binote/_read.log",
];

const HEADER = "# binote — local-only artifacts (regenerable / per-developer)";

const splitLines = (text: string): readonly string[] =>
  text.length === 0 ? [] : text.replace(/\r\n/g, "\n").split("\n");

export type IgnoreResult = {
  readonly gitignorePath: string;
  readonly added: readonly string[];
  readonly alreadyPresent: readonly string[];
  readonly created: boolean;
};

/**
 * Idempotently append binote's private paths to <projectRoot>/.gitignore.
 * Existing entries are preserved in place; missing entries are appended under
 * a header comment so the section is easy to spot.
 */
export const applyIgnore = async (config: BinoteConfig): Promise<IgnoreResult> => {
  const gitignorePath = join(config.projectRoot, ".gitignore");
  const existing = await readFileSafe(gitignorePath);
  const created = existing === null;
  const lines = existing ? splitLines(existing) : [];

  // Trim trailing empties only when comparing — preserve them on write-back.
  const have = new Set(lines.map((l) => l.trim()).filter(Boolean));

  const missing = PRIVATE_PATHS.filter((p) => !have.has(p));
  const present = PRIVATE_PATHS.filter((p) => have.has(p));

  if (missing.length === 0) {
    return { gitignorePath, added: [], alreadyPresent: present, created: false };
  }

  const trailing = lines.length > 0 && lines[lines.length - 1] !== "" ? ["", ""] : [];
  const block = [...trailing, HEADER, ...missing, ""];
  const next = [...lines, ...block].join("\n");
  await writeFileSafe(gitignorePath, next);

  return { gitignorePath, added: missing, alreadyPresent: present, created };
};
