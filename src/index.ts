#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror, resolveLinkDetailed, notePathToProjectPath, isDirNote, isStandaloneNote } from "./core/binote-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { searchNotes } from "./core/search.js";
import { sync } from "./core/sync-engine.js";
import { stalenessFor, markVerified } from "./core/meta.js";
import { parseFrontmatter } from "./core/frontmatter.js";
import { applyIgnore, PRIVATE_PATHS } from "./core/gitignore.js";
import { join } from "node:path";
import { ensureDir, appendLog } from "./util/fs-helpers.js";
import { pkg } from "./util/pkg.js";
import type { Staleness } from "./types.js";

const dateStamp = () => new Date().toISOString().slice(0, 10);
const sessionLogPath = (sessionsDir: string) => join(sessionsDir, `${dateStamp()}.jsonl`);

const server = new McpServer({
  name: pkg.name,
  version: pkg.version,
});

// ── init ──────────────────────────────────────────────────────────────

server.registerTool(
  "init",
  {
    description: "Initialize .binote/ directory from project structure. Scans files and creates skeleton notes. Safe to re-run.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root directory"),
      ignore: z.array(z.string()).optional().describe("Additional glob patterns to ignore"),
    },
  },
  async ({ projectRoot, ignore }) => {
    const config = makeConfig(projectRoot, ignore ?? []);
    await ensureDir(config.binoteDir);
    await ensureDir(config.notesDir);

    const { files, dirs } = await scanProjectStructure(config);
    let created = 0;

    for (const dir of dirs) {
      const notePath = dirToNotePath(dir);
      if (!(await noteExists(config, notePath))) {
        await writeNote(config, notePath, "");
        created++;
      }
    }

    if (!(await noteExists(config, "_dir.md"))) {
      await writeNote(config, "_dir.md", "");
      created++;
    }

    for (const file of files) {
      if (!shouldMirror(file)) continue;
      const notePath = projectPathToNotePath(file);
      if (!(await noteExists(config, notePath))) {
        await writeNote(config, notePath, "");
        created++;
      }
    }

    const index = await buildIndex(config);
    await saveIndex(config, index);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "initialized",
            projectFiles: files.length,
            directories: dirs.length,
            notesCreated: created,
            binoteDir: config.binoteDir,
          }, null, 2),
        },
      ],
    };
  }
);

// ── read_note ─────────────────────────────────────────────────────────

const sliceWindow = (text: string, path: string, from?: number, to?: number): string => {
  if (from === undefined && to === undefined) return text;
  const lines = text.split("\n");
  const lo = Math.max(1, from ?? 1);
  const hi = Math.min(lines.length, to ?? lines.length);
  return `# lines ${lo}-${hi} of total ${lines.length} in ${path}\n${lines.slice(lo - 1, hi).join("\n")}`;
};

/** Sentinel for empty notes — tells the LLM where to look instead of returning ''. */
const emptyNoteHint = (notePath: string): string => {
  if (isStandaloneNote(notePath)) return `(empty standalone note: ${notePath})`;
  if (isDirNote(notePath)) {
    const dir = notePath.replace(/\/?_dir\.md$/, "") || ".";
    return `(empty dir note — list directory: ${dir})`;
  }
  const projectPath = notePathToProjectPath(notePath);
  return projectPath
    ? `(empty note — read source file: ${projectPath})`
    : `(empty note: ${notePath})`;
};

/** Strip frontmatter, then either show body or fall back to emptyNoteHint. */
const renderNote = (text: string, path: string, from?: number, to?: number): string => {
  const { body } = parseFrontmatter(text);
  return body.trim().length === 0
    ? emptyNoteHint(path)
    : sliceWindow(body, path, from, to);
};

/** Try exact notePath, fall back to resolveLinkDetailed if not found. */
const resolveNotePath = async (
  config: ReturnType<typeof makeConfig>,
  input: string,
): Promise<{ path: string; strategy: string } | null> => {
  if (await noteExists(config, input)) return { path: input, strategy: "exact" };
  const notes = await scanExistingNotes(config);
  const detail = resolveLinkDetailed(input, notes);
  return detail.resolved ? { path: detail.resolved, strategy: detail.strategy } : null;
};

/** Recursive graph node: expanded when visited, id-ref when already seen. */
type NoteNode = {
  readonly id: string;
  readonly content: string;
  readonly linked: readonly (NoteNode | string)[];
  readonly backlinked: readonly (NoteNode | string)[];
  readonly dangling: readonly string[];
  staleness?: Staleness; // attached post-expansion; omitted when 'fresh' to save tokens
};

/**
 * Recursive unfold of the note graph with cycle detection.
 * `fDepth` controls forward [[link]] expansion; `bDepth` controls backlink expansion.
 * Backlink branches do NOT continue forward chains (their fDepth is forced to 0)
 * — backlinks are noisy reverse samples, not transitive evidence.
 */
const expandNote = async (
  config: ReturnType<typeof makeConfig>,
  index: Awaited<ReturnType<typeof getOrBuildIndex>>,
  id: string,
  fDepth: number,
  bDepth: number,
  visited: Set<string>,
): Promise<NoteNode | string> => {
  if (visited.has(id)) return id; // cycle → id ref
  visited.add(id);

  const raw = await readNote(config, id);
  const content = raw === null
    ? `(not found: ${id})`
    : (() => {
        const { body } = parseFrontmatter(raw);
        return body.trim().length === 0 ? emptyNoteHint(id) : body;
      })();
  if (fDepth <= 0 && bDepth <= 0) return { id, content, linked: [], backlinked: [], dangling: [] };

  const refs = index.links[id] ?? [];
  const backrefs = index.backlinks[id] ?? [];
  const dangling = refs.filter(r => r.resolved === null).map(r => r.raw);

  const forwardIds = fDepth > 0
    ? [...new Set(refs.filter(r => r.resolved !== null).map(r => r.resolved!))]
    : [];
  const backIds = bDepth > 0
    ? [...new Set(backrefs.map(r => r.from))]
    : [];

  const [linked, backlinked] = await Promise.all([
    Promise.all(forwardIds.map(fid => expandNote(config, index, fid, fDepth - 1, bDepth, visited))),
    // backlink neighbours: include their content (fDepth=0 forces no further chain)
    Promise.all(backIds.map(bid => expandNote(config, index, bid, 0, bDepth - 1, visited))),
  ]);

  return { id, content, linked, backlinked, dangling };
};

/** Walk a NoteNode tree and attach staleness from a precomputed map. Mutates in place. */
const attachStaleness = (
  node: NoteNode | string,
  map: Readonly<Record<string, Staleness>>,
): void => {
  if (typeof node === "string") return;
  const s = map[node.id];
  if (s && s.level !== "fresh") node.staleness = s;
  for (const c of node.linked) attachStaleness(c, map);
  for (const c of node.backlinked) attachStaleness(c, map);
};

/** Collect all real (non-id-ref) note ids in a graph. */
const collectIds = (node: NoteNode | string, out: Set<string>): void => {
  if (typeof node === "string") { out.add(node); return; }
  out.add(node.id);
  for (const c of node.linked) collectIds(c, out);
  for (const c of node.backlinked) collectIds(c, out);
};

server.registerTool(
  "read_note",
  {
    description: [
      "Read one or more Binote notes via the link graph. Auto-resolves [[link]] targets with fuzzy fallback.",
      "",
      "Pick depths intentionally:",
      "- forwardDepth=0 → known file, want a slice, batch preview",
      "- forwardDepth=1 → DEFAULT recommended for entering a file/dir (gets [[links]])",
      "- forwardDepth=2+ → rare; tracing a causal chain (\"why does this invariant exist?\")",
      "- backDepth=0 → DEFAULT (backlinks are noisy reverse samples)",
      "- backDepth=1 → only when answering \"who depends on / references me?\"",
      "",
      "Each node carries a `staleness` field when warning/stale (source mtime drifted from note mtime). Visited nodes become id strings (cycle-safe).",
    ].join("\n"),
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().optional().describe("Single note path; ignored if notePaths is provided"),
      notePaths: z.array(z.string()).optional().describe("Batch read — shares visited set across all roots"),
      from: z.number().int().positive().optional().describe("1-indexed start line (inclusive, flat reads only)"),
      to: z.number().int().positive().optional().describe("1-indexed end line (inclusive, flat reads only)"),
      forwardDepth: z.number().int().min(0).max(3).optional().describe("Forward [[link]] expansion. 0 = note only. 1 = recommended default for new files. 2+ rare."),
      backDepth: z.number().int().min(0).max(1).optional().describe("Backlink expansion. 0 = ignore (default). 1 = include incoming refs ('who depends on me')."),
      depth: z.number().int().min(0).max(3).optional().describe("DEPRECATED legacy alias. Maps to forwardDepth (backDepth stays 0). Prefer the explicit params."),
    },
  },
  async ({ projectRoot, notePath, notePaths, from, to, forwardDepth, backDepth, depth }) => {
    const config = makeConfig(projectRoot);
    const logFile = sessionLogPath(config.sessionsDir);
    const fDepth = forwardDepth ?? depth ?? 0;
    const bDepth = backDepth ?? 0;
    const isFlat = fDepth === 0 && bDepth === 0;

    const resolve = async (p: string) => resolveNotePath(config, p);

    // Flat path: render plain text, optionally prepend a staleness banner.
    const readFlat = async (p: string): Promise<string | null> => {
      const r = await resolve(p);
      if (!r) return null;
      const c = await readNote(config, r.path);
      if (c === null) return null;
      const rendered = renderNote(c, r.path, from, to);
      const stale = (await stalenessFor(config, [r.path]))[r.path];
      if (stale && (stale.level === "warning" || stale.level === "stale")) {
        return `<!-- staleness: ${stale.hint} -->\n${rendered}`;
      }
      return rendered;
    };

    // Graph path: expand, then attach staleness in one batch.
    const readGraph = async (paths: string[]) => {
      const resolved = await Promise.all(paths.map(resolve));
      const realPaths = resolved.filter(Boolean).map(r => r!.path);
      const index = await getOrBuildIndex(config);
      const visited = new Set<string>();
      const nodes = await Promise.all(
        realPaths.map(p => expandNote(config, index, p, fDepth, bDepth, visited))
      );
      const ids = new Set<string>();
      for (const n of nodes) collectIds(n, ids);
      const stalenessMap = await stalenessFor(config, [...ids]);
      for (const n of nodes) attachStaleness(n, stalenessMap);
      return nodes;
    };

    type Built = { text: string; isError?: boolean };
    const makeResult = async (): Promise<Built> => {
      if (notePaths && notePaths.length > 0) {
        if (isFlat) {
          const entries = await Promise.all(
            notePaths.map(async (p): Promise<readonly [string, string | null]> => [p, await readFlat(p)])
          );
          return { text: JSON.stringify(Object.fromEntries(entries), null, 2) };
        }
        return { text: JSON.stringify(await readGraph(notePaths), null, 2) };
      }

      if (!notePath) return { text: "Provide notePath or notePaths", isError: true };

      if (isFlat) {
        const flat = await readFlat(notePath);
        return flat === null
          ? { text: `Note not found: ${notePath}`, isError: true }
          : { text: flat };
      }

      const [node] = await readGraph([notePath]);
      return { text: JSON.stringify(node, null, 2) };
    };

    const { text, isError } = await makeResult();

    // Log exactly what the LLM receives.
    const input = notePaths && notePaths.length > 0 ? notePaths : [notePath ?? ""];
    const parsed = (() => { try { return JSON.parse(text); } catch { return text; } })();
    await appendLog(
      logFile,
      JSON.stringify({ ts: new Date().toISOString(), input, forwardDepth: fDepth, backDepth: bDepth, chars: text.length, result: parsed }, null, 2) + "\n",
    ).catch(() => {});

    return { content: [{ type: "text" as const, text }], ...(isError ? { isError } : {}) };
  }
);

// ── write_note ────────────────────────────────────────────────────────

server.registerTool(
  "write_note",
  {
    description: "Create or update a Binote note. Use [[filename]] or [[path/to/file]] for bidirectional links.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Path relative to .binote/. Use '_notes/my-note.md' for standalone notes."),
      content: z.string().describe("Full markdown content. Use [[target]] for links."),
      createOnly: z.boolean().optional().describe("If true, fail when note already exists"),
    },
  },
  async ({ projectRoot, notePath, content, createOnly }) => {
    const config = makeConfig(projectRoot);

    if (createOnly && (await noteExists(config, notePath))) {
      return { content: [{ type: "text" as const, text: `Note already exists: ${notePath}` }], isError: true };
    }

    await writeNote(config, notePath, content);
    await invalidateIndex(config);

    return {
      content: [{ type: "text" as const, text: `Note written: ${notePath} (${content.length} chars)` }],
    };
  }
);

// ── search ────────────────────────────────────────────────────────────

server.registerTool(
  "search",
  {
    description: "Full-text search across all Binote notes. Hits include resolved [[link]] targets on the matched line.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      query: z.string().describe("Search query (plain text or regex)"),
      regex: z.boolean().optional().describe("Treat query as regex (default: false)"),
      maxResults: z.number().optional().describe("Max results (default: 20)"),
      contextLines: z.number().int().nonnegative().optional().describe("Lines above and below the match (default: 1 → 3-line window)"),
    },
  },
  async ({ projectRoot, query, regex, maxResults, contextLines }) => {
    const config = makeConfig(projectRoot);
    const hits = await searchNotes(config, query, { regex, maxResults, contextLines });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ query, totalHits: hits.length, hits }, null, 2),
        },
      ],
    };
  }
);

// ── sync ──────────────────────────────────────────────────────────────

server.registerTool(
  "sync",
  {
    description: "Detect renamed/deleted project files and update .binote/ notes. Marks orphaned notes.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      dryRun: z.boolean().optional().describe("Report changes without applying (default: false)"),
    },
  },
  async ({ projectRoot, dryRun }) => {
    const config = makeConfig(projectRoot);
    const result = await sync(config, dryRun ?? false);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ── rebuild_index ─────────────────────────────────────────────────────

server.registerTool(
  "rebuild_index",
  {
    description: "Rebuild _index.json from all notes by extracting [[links]]. Use after bulk note writes to refresh forward/backlink graph without LLM token cost.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
    },
  },
  async ({ projectRoot }) => {
    const config = makeConfig(projectRoot);
    const index = await buildIndex(config);
    await saveIndex(config, index);

    const noteCount = Object.keys(index.links).length;
    const linkCount = Object.values(index.links).reduce((n, refs) => n + refs.length, 0);
    const danglingCount = Object.keys(index.dangling).length;

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            status: "rebuilt",
            indexPath: config.indexPath,
            notes: noteCount,
            links: linkCount,
            dangling: danglingCount,
          }, null, 2),
        },
      ],
    };
  }
);

// ── mark_verified ─────────────────────────────────────────────────────

server.registerTool(
  "mark_verified",
  {
    description: "Stamp a note as just-verified by writing `lastVerified: <ISO now>` into its frontmatter. Called by /binote:verify subagents after producing an audit report. Frontmatter changes do not affect the [[link]] index.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Note path relative to .binote/, e.g. 'src/index.ts.md'"),
    },
  },
  async ({ projectRoot, notePath }) => {
    const config = makeConfig(projectRoot);

    const resolved = await resolveNotePath(config, notePath);
    if (!resolved) {
      return { content: [{ type: "text" as const, text: `Note not found: ${notePath}` }], isError: true };
    }
    await markVerified(config, resolved.path);

    return {
      content: [{ type: "text" as const, text: JSON.stringify({ status: "verified", notePath: resolved.path, at: new Date().toISOString() }, null, 2) }],
    };
  }
);

// ── audit_status ──────────────────────────────────────────────────────

server.registerTool(
  "audit_status",
  {
    description: "Report which notes are stale or unverified, sorted by drift severity. Used by /binote:verify to pick targets. Stats and frontmatter are read on demand — no persistent meta state.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      level: z.enum(["fresh", "warning", "stale", "unverified"]).optional().describe("Filter by staleness level. Omit to return all (sorted)."),
      limit: z.number().int().positive().optional().describe("Max entries to return (default: 20)"),
    },
  },
  async ({ projectRoot, level, limit }) => {
    const config = makeConfig(projectRoot);
    const cap = limit ?? 20;

    const allNotes = await scanExistingNotes(config);
    const stalenessMap = await stalenessFor(config, allNotes);

    type Row = {
      readonly notePath: string;
      readonly level: Staleness["level"];
      readonly daysSourceAheadOfNote: number | null;
      readonly daysSinceVerified: number | null;
      readonly hint: string;
    };

    const rows: Row[] = Object.entries(stalenessMap).map(([notePath, s]) => ({
      notePath,
      level: s.level,
      daysSourceAheadOfNote: s.daysSourceAheadOfNote,
      daysSinceVerified: s.daysSinceVerified,
      hint: s.hint,
    }));

    const filtered = level ? rows.filter(r => r.level === level) : rows;

    // Sort: stale > warning > unverified > fresh; within group, larger drift first.
    const levelRank = { stale: 3, warning: 2, unverified: 1, fresh: 0 } as const;
    const sorted = [...filtered].sort((a, b) => {
      const lr = levelRank[b.level] - levelRank[a.level];
      if (lr !== 0) return lr;
      const da = a.daysSourceAheadOfNote ?? -1;
      const db = b.daysSourceAheadOfNote ?? -1;
      return db - da;
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            total: filtered.length,
            shown: Math.min(cap, sorted.length),
            notes: sorted.slice(0, cap),
          }, null, 2),
        },
      ],
    };
  }
);

// ── ignore ────────────────────────────────────────────────────────────

server.registerTool(
  "ignore",
  {
    description: `Append binote's private artifact paths to <projectRoot>/.gitignore. Idempotent — already-present entries are skipped. Adds: ${PRIVATE_PATHS.join(", ")}. Notes (_dir.md, _notes/, file mirrors) stay tracked because they are the collaborative truth.`,
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
    },
  },
  async ({ projectRoot }) => {
    const config = makeConfig(projectRoot);
    const result = await applyIgnore(config);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }
);

// ── list_notes ────────────────────────────────────────────────────────

server.registerTool(
  "list_notes",
  {
    description: "List all existing notes in .binote/ directory.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
    },
  },
  async ({ projectRoot }) => {
    const config = makeConfig(projectRoot);
    const notes = await scanExistingNotes(config);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ total: notes.length, notes }, null, 2),
        },
      ],
    };
  }
);

// ── start ─────────────────────────────────────────────────────────────

import { runCli } from "./cli.js";

const isCli = await runCli(process.argv.slice(2));
if (!isCli) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
