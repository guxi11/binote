#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror, resolveLinkDetailed, notePathToProjectPath, isDirNote, isStandaloneNote } from "./core/roam-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { searchNotes } from "./core/search.js";
import { sync } from "./core/sync-engine.js";
import { ensureDir } from "./util/fs-helpers.js";
import { pkg } from "./util/pkg.js";

const server = new McpServer({
  name: pkg.name,
  version: pkg.version,
});

// ── init ──────────────────────────────────────────────────────────────

server.registerTool(
  "init",
  {
    description: "Initialize .roam/ directory from project structure. Scans files and creates skeleton notes. Safe to re-run.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root directory"),
      ignore: z.array(z.string()).optional().describe("Additional glob patterns to ignore"),
    },
  },
  async ({ projectRoot, ignore }) => {
    const config = makeConfig(projectRoot, ignore ?? []);
    await ensureDir(config.roamDir);
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
            roamDir: config.roamDir,
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

server.registerTool(
  "read",
  {
    description: "Read one or more roamem notes. Path is relative to .roam/ (e.g. 'src/index.ts.md'). Use notePaths for batch reads, from/to for line ranges.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().optional().describe("Single note path; ignored if notePaths is provided"),
      notePaths: z.array(z.string()).optional().describe("Batch read; returns {[path]: content|null}"),
      from: z.number().int().positive().optional().describe("1-indexed start line (inclusive)"),
      to: z.number().int().positive().optional().describe("1-indexed end line (inclusive)"),
    },
  },
  async ({ projectRoot, notePath, notePaths, from, to }) => {
    const config = makeConfig(projectRoot);

    if (notePaths && notePaths.length > 0) {
      const entries = await Promise.all(
        notePaths.map(async (p): Promise<readonly [string, string | null]> => {
          const c = await readNote(config, p);
          return [p, c === null ? null : renderNote(c, p, from, to)];
        })
      );
      return { content: [{ type: "text" as const, text: JSON.stringify(Object.fromEntries(entries), null, 2) }] };
    }

    if (!notePath) {
      return { content: [{ type: "text" as const, text: "Provide notePath or notePaths" }], isError: true };
    }
    const content = await readNote(config, notePath);
    if (content === null) {
      return { content: [{ type: "text" as const, text: `Note not found: ${notePath}` }], isError: true };
    }
    return { content: [{ type: "text" as const, text: renderNote(content, notePath, from, to) }] };
  }
);

// ── write_note ────────────────────────────────────────────────────────

server.registerTool(
  "write",
  {
    description: "Create or update a roamem note. Use [[filename]] or [[path/to/file]] for bidirectional links.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Path relative to .roam/. Use '_notes/my-note.md' for standalone notes."),
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

// ── query_links ───────────────────────────────────────────────────────

server.registerTool(
  "links",
  {
    description: "Get forward links and backlinks for a note. Returns flat lists plus detailed line-aware variants and any dangling [[X]] from this note.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Path to the note relative to .roam/"),
    },
  },
  async ({ projectRoot, notePath }) => {
    const config = makeConfig(projectRoot);
    const index = await getOrBuildIndex(config);

    const forwardDetails = index.links[notePath] ?? [];
    const backlinkDetails = index.backlinks[notePath] ?? [];
    const danglingFromHere = forwardDetails.filter((r) => r.resolved === null);

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            notePath,
            forward: index.forward[notePath] ?? [],
            backlinks: index.reverse[notePath] ?? [],
            forwardDetails,
            backlinkDetails,
            dangling: danglingFromHere,
          }, null, 2),
        },
      ],
    };
  }
);

// ── search ────────────────────────────────────────────────────────────

server.registerTool(
  "search",
  {
    description: "Full-text search across all roamem notes. Hits include resolved [[link]] targets on the matched line — use those instead of a follow-up links call.",
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

// ── resolve_link ──────────────────────────────────────────────────────

server.registerTool(
  "resolve",
  {
    description: "Resolve a [[target]] string to a concrete note path. Returns candidates if ambiguous. Falls back to substring matching for typos. Use before chasing a link whose destination isn't obvious.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      target: z.string().describe("The text inside [[...]], e.g. 'multiset-not-diff'"),
    },
  },
  async ({ projectRoot, target }) => {
    const config = makeConfig(projectRoot);
    const notes = await scanExistingNotes(config);
    const detail = resolveLinkDetailed(target, notes);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            target,
            resolved: detail.resolved,
            candidates: detail.candidates,
            strategy: detail.strategy,
          }, null, 2),
        },
      ],
    };
  }
);

// ── sync ──────────────────────────────────────────────────────────────

server.registerTool(
  "sync",
  {
    description: "Detect renamed/deleted project files and update .roam/ notes. Marks orphaned notes.",
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
  "rebuild",
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
  "list",
  {
    description: "List all existing notes in .roam/ directory.",
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
