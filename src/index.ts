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
import { join } from "node:path";
import { ensureDir, appendLog } from "./util/fs-helpers.js";
import { pkg } from "./util/pkg.js";

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

const renderNote = (text: string, path: string, from?: number, to?: number): string =>
  text.length === 0 ? emptyNoteHint(path) : sliceWindow(text, path, from, to);

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
};

/** Recursive unfold of the note graph with cycle detection via visited set. */
const expandNote = async (
  config: ReturnType<typeof makeConfig>,
  index: Awaited<ReturnType<typeof getOrBuildIndex>>,
  id: string,
  depth: number,
  visited: Set<string>,
): Promise<NoteNode | string> => {
  if (visited.has(id)) return id; // cycle → id ref
  visited.add(id);

  const raw = await readNote(config, id);
  const content = raw ?? `(not found: ${id})`;
  if (depth <= 0) return { id, content, linked: [], backlinked: [], dangling: [] };

  const refs = index.links[id] ?? [];
  const backrefs = index.backlinks[id] ?? [];
  const dangling = refs.filter(r => r.resolved === null).map(r => r.raw);

  const forwardIds = [...new Set(refs.filter(r => r.resolved !== null).map(r => r.resolved!))];
  const backIds = [...new Set(backrefs.map(r => r.from))];

  const [linked, backlinked] = await Promise.all([
    Promise.all(forwardIds.map(fid => expandNote(config, index, fid, depth - 1, visited))),
    Promise.all(backIds.map(bid => expandNote(config, index, bid, depth - 1, visited))),
  ]);

  return { id, content, linked, backlinked, dangling };
};

server.registerTool(
  "read_note",
  {
    description: "Read one or more Binote notes. Accepts exact paths (e.g. 'src/index.ts.md') or [[link]] targets (e.g. 'helpers') — auto-resolves with fuzzy fallback. Set depth=1+ to recursively expand linked and backlinked notes. Already-visited nodes appear as id strings (cycle-safe).",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().optional().describe("Single note path; ignored if notePaths is provided"),
      notePaths: z.array(z.string()).optional().describe("Batch read — shares visited set across all roots"),
      from: z.number().int().positive().optional().describe("1-indexed start line (inclusive, depth=0 only)"),
      to: z.number().int().positive().optional().describe("1-indexed end line (inclusive, depth=0 only)"),
      depth: z.number().int().min(0).max(3).optional().describe("0 = note only (default). 1+ = recursively expand linked and backlinked notes. Visited nodes become id refs."),
    },
  },
  async ({ projectRoot, notePath, notePaths, from, to, depth }) => {
    const config = makeConfig(projectRoot);
    const logFile = sessionLogPath(config.sessionsDir);
    const d = depth ?? 0;

    // resolve input → real notePath (exact or fuzzy)
    const resolve = async (p: string) => resolveNotePath(config, p);

    // depth=0: plain text (backward compat)
    const readFlat = async (p: string) => {
      const r = await resolve(p);
      if (!r) return null;
      const c = await readNote(config, r.path);
      return c === null ? null : renderNote(c, r.path, from, to);
    };

    // depth>=1: recursive graph expansion
    const readGraph = async (paths: string[]) => {
      const resolved = await Promise.all(paths.map(resolve));
      const realPaths = resolved.filter(Boolean).map(r => r!.path);
      const index = await getOrBuildIndex(config);
      const visited = new Set<string>();
      return Promise.all(
        realPaths.map(p => expandNote(config, index, p, d, visited))
      );
    };

    // build result text
    const makeResult = async (): Promise<{ text: string; isError?: boolean }> => {
      if (notePaths && notePaths.length > 0) {
        if (d === 0) {
          const entries = await Promise.all(
            notePaths.map(async (p): Promise<readonly [string, string | null]> => [p, await readFlat(p)])
          );
          return { text: JSON.stringify(Object.fromEntries(entries), null, 2) };
        }
        return { text: JSON.stringify(await readGraph(notePaths), null, 2) };
      }

      if (!notePath) return { text: "Provide notePath or notePaths", isError: true };

      if (d === 0) {
        const flat = await readFlat(notePath);
        return flat === null
          ? { text: `Note not found: ${notePath}`, isError: true }
          : { text: flat };
      }

      const [node] = await readGraph([notePath]);
      return { text: JSON.stringify(node, null, 2) };
    };

    const { text, isError } = await makeResult();

    // log exactly what the LLM receives
    const input = notePaths && notePaths.length > 0 ? notePaths : [notePath ?? ""];
    await appendLog(logFile, JSON.stringify({ ts: new Date().toISOString(), input, depth: d, chars: text.length, result: text }) + "\n")
      .catch(() => {});

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
