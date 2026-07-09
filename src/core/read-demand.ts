import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { BinoteConfig } from "../types.js";
import { readFileSafe } from "../util/fs-helpers.js";

/**
 * Read-demand signal: how often each note path was actually read at the MCP
 * boundary, recency-weighted. Consumes `_sessions/<date>.jsonl` — the read log
 * that `read_note` appends to. Recovers a real usage signal the graph alone
 * cannot see: `[[link]]` inbound count is *latent* demand; read frequency is
 * *revealed* demand. Fused into knowledge_gaps and audit_status ranking.
 *
 * Computed on demand from the logs — never persisted (constitution §5/§8: reads
 * are logged, but no derived signal becomes a durable meta sidecar).
 */

const DAY_MS = 86_400_000;
const DEFAULT_HALF_LIFE_DAYS = 21;

/** notePath → summed decayed read weight (recent reads count for ~1, a read one
 *  half-life ago for ~0.5, etc.). Absent paths are zero-demand. */
export type ReadDemand = Readonly<Record<string, number>>;

type LogRecord = { readonly ts?: string; readonly input?: readonly unknown[] };

/**
 * Parse a stream of concatenated JSON objects. The current producer writes
 * compact single-line JSONL; pre-0.4.0 logs were pretty-printed and span many
 * lines each. A brace-depth scanner (string/escape-aware) reads both formats
 * uniformly, skipping any malformed object rather than failing the whole file.
 */
export const parseConcatenatedJson = (text: string): readonly unknown[] => {
  const out: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth++ === 0) start = i; }
    else if (ch === "}" && depth > 0 && --depth === 0 && start >= 0) {
      try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* skip malformed */ }
      start = -1;
    }
  }
  return out;
};

const sessionFiles = async (config: BinoteConfig): Promise<readonly string[]> => {
  try {
    const names = await readdir(config.sessionsDir);
    return names.filter((n) => n.endsWith(".jsonl")).map((n) => join(config.sessionsDir, n));
  } catch {
    return [];
  }
};

/** Exponential recency decay: weight = 0.5^(ageDays / halfLife). */
const decayWeight = (ts: string | undefined, now: number, halfLifeDays: number): number => {
  if (!ts) return 1;
  const ms = Date.parse(ts);
  if (Number.isNaN(ms)) return 1;
  const ageDays = Math.max(0, (now - ms) / DAY_MS);
  return Math.exp((-Math.LN2 * ageDays) / halfLifeDays);
};

/**
 * Aggregate recency-weighted read frequency per note path across all session
 * logs. `now` is injected (ms epoch) so the caller owns the clock boundary.
 */
export const readDemand = async (
  config: BinoteConfig,
  now: number,
  halfLifeDays: number = DEFAULT_HALF_LIFE_DAYS,
): Promise<ReadDemand> => {
  const files = await sessionFiles(config);
  const demand: Record<string, number> = {};
  for (const file of files) {
    const raw = await readFileSafe(file);
    if (!raw) continue;
    for (const rec of parseConcatenatedJson(raw) as LogRecord[]) {
      if (!Array.isArray(rec.input)) continue;
      const w = decayWeight(rec.ts, now, halfLifeDays);
      for (const p of rec.input) {
        if (typeof p === "string" && p.length > 0) demand[p] = (demand[p] ?? 0) + w;
      }
    }
  }
  return demand;
};
