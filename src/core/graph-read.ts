/**
 * Graph expansion + markdown rendering for read_note.
 *
 * Two context-efficiency rules replace the old "inline every full body as
 * pretty-printed JSON" behavior (measured 12.6× token blow-up at depth 1):
 *   1. Only requested roots render in full — linked/backlinked nodes render
 *      as excerpts (drill in with a follow-up read; `full` opts out).
 *   2. Output is markdown, not JSON — no `\n` escaping, no indentation tax.
 * Backlinks expand at the root only: "who depends on me" is a question about
 * the requested note, not about every neighbour it links to.
 */

import type { BinoteConfig, LinkIndex, Staleness } from "../types.js";
import { classifyNote, notePathToProjectPath } from "./binote-paths.js";
import { readNote } from "./note-io.js";
import { parseFrontmatter, fmString } from "./frontmatter.js";
import { excerptBody } from "./excerpt.js";

/** Sentinel for empty notes — tells the LLM where to look instead of returning ''. */
export const emptyNoteHint = (notePath: string): string => {
  const kind = classifyNote(notePath);
  if (kind === "constitution") return `(empty _constitution.md — run /binote:save to extract project invariants from _design/architecture.md)`;
  if (kind === "design") return `(empty design note: ${notePath} — design authority slot, fill via /binote:save)`;
  if (kind === "feature") return `(empty feature note: ${notePath} — scaffold via /binote:feature or /binote:plan)`;
  if (kind === "notes") return `(empty standalone note: ${notePath})`;
  if (kind === "dir") {
    const dir = notePath.replace(/\/?_dir\.md$/, "") || ".";
    return `(empty dir note — list directory: ${dir})`;
  }
  const projectPath = notePathToProjectPath(notePath);
  return projectPath
    ? `(empty note — read source file: ${projectPath})`
    : `(empty note: ${notePath})`;
};

export type GraphNode = {
  readonly id: string;
  readonly body: string;
  readonly excerpted: boolean;
  readonly cycle: boolean;
  readonly outLinks: readonly string[];
  readonly dangling: readonly string[];
  staleness?: Staleness; // attached post-expansion; omitted when 'fresh'
  readonly forward: readonly GraphNode[];
  readonly back: readonly GraphNode[];
};

const cycleNode = (id: string): GraphNode =>
  ({ id, body: "", excerpted: false, cycle: true, outLinks: [], dangling: [], forward: [], back: [] });

export type ExpandOpts = {
  readonly fDepth: number;
  readonly bDepth: number;
  /** true → inline full bodies on linked nodes (old behavior, token-expensive). */
  readonly full: boolean;
};

/**
 * Recursive unfold of the note graph with cycle detection.
 * depth 0 = a requested root (full body + backlink expansion);
 * depth ≥ 1 = a neighbour (excerpt unless opts.full).
 */
export const expandGraph = async (
  config: BinoteConfig,
  index: LinkIndex,
  id: string,
  opts: ExpandOpts,
  depth: number,
  visited: Set<string>,
): Promise<GraphNode> => {
  if (visited.has(id)) return cycleNode(id);
  visited.add(id);

  const raw = await readNote(config, id);
  const { frontmatter, body: rawBody } = raw === null
    ? { frontmatter: {}, body: `(not found: ${id})` }
    : parseFrontmatter(raw);
  const fullBody = rawBody.trim().length === 0 ? emptyNoteHint(id) : rawBody;
  const excerpted = depth > 0 && !opts.full;
  const body = excerpted
    ? excerptBody(fullBody, fmString(frontmatter, "description"))
    : fullBody;

  const refs = index.links[id] ?? [];
  const outLinks = [...new Set(refs.filter((r) => r.resolved !== null).map((r) => r.resolved!))];
  const dangling = [...new Set(refs.filter((r) => r.resolved === null).map((r) => r.raw))];

  const forwardIds = depth < opts.fDepth ? outLinks : [];
  const backIds = depth === 0 && opts.bDepth > 0
    ? [...new Set((index.backlinks[id] ?? []).map((b) => b.from))]
    : [];

  const [forward, back] = await Promise.all([
    Promise.all(forwardIds.map((fid) => expandGraph(config, index, fid, opts, depth + 1, visited))),
    Promise.all(backIds.map((bid) => expandGraph(config, index, bid, opts, opts.fDepth + 1, visited))),
  ]);

  return { id, body, excerpted, cycle: false, outLinks, dangling, forward, back };
};

/** Walk a graph and attach staleness from a precomputed map. Mutates in place. */
export const attachStaleness = (
  node: GraphNode,
  map: Readonly<Record<string, Staleness>>,
): void => {
  const s = map[node.id];
  if (s && s.level !== "fresh") node.staleness = s;
  for (const c of node.forward) attachStaleness(c, map);
  for (const c of node.back) attachStaleness(c, map);
};

/** Collect all note ids in a graph (for batch staleness lookup). */
export const collectIds = (node: GraphNode, out: Set<string>): void => {
  out.add(node.id);
  for (const c of node.forward) collectIds(c, out);
  for (const c of node.back) collectIds(c, out);
};

// ── markdown rendering ────────────────────────────────────────────────

const MAX_SHOWN_LINKS = 15;

/** The `links:` nav line — shared by graph excerpts and section-scoped reads, so
 *  a body whose inline [[links]] got cut still carries the note's out-edges. */
export const linksLine = (outLinks: readonly string[]): string => {
  const shown = outLinks.slice(0, MAX_SHOWN_LINKS);
  const more = outLinks.length - shown.length;
  return `links: ${shown.map((l) => `[[${l}]]`).join(" ")}${more > 0 ? ` (+${more} more)` : ""}`;
};

/** Resolved, deduped out-links for a note from the index — the input to linksLine. */
export const resolvedOutLinks = (index: LinkIndex, id: string): readonly string[] =>
  [...new Set((index.links[id] ?? []).filter((r) => r.resolved !== null).map((r) => r.resolved!))];

/** Staleness banner comment — one form for both flat and graph renders. */
export const stalenessBanner = (hint: string): string => `<!-- staleness: ${hint} -->`;

const renderNode = (n: GraphNode, level: number, arrow: string): string => {
  const h = "#".repeat(Math.min(level, 6));
  if (n.cycle) return `${h} ${arrow}${n.id} (shown above)`;

  const head = `${h} ${arrow}${n.id}${n.excerpted ? " (excerpt)" : ""}`;
  const parts = [head];
  if (n.staleness) parts.push(stalenessBanner(n.staleness.hint));
  parts.push(n.body);
  // Excerpts drop inline [[links]] with the body — restore them as a nav line.
  if (n.excerpted && n.outLinks.length > 0) parts.push(linksLine(n.outLinks));
  if (!n.excerpted && n.dangling.length > 0)
    parts.push(`dangling: ${n.dangling.map((d) => `[[${d}]]`).join(" ")}`);

  const children = [
    ...n.forward.map((c) => renderNode(c, level + 1, "→ ")),
    ...n.back.map((c) => renderNode(c, level + 1, "← ")),
  ];
  return [parts.join("\n\n"), ...children].join("\n\n");
};

export const renderGraph = (roots: readonly GraphNode[]): string =>
  roots.map((r) => renderNode(r, 1, "")).join("\n\n---\n\n");
