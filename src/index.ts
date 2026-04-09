#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror } from "./core/roam-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { sync } from "./core/sync-engine.js";
import { dirNoteTemplate } from "./util/markdown.js";
import { ensureDir } from "./util/fs-helpers.js";
import type { SearchHit } from "./types.js";

const server = new McpServer({
  name: "roammem",
  version: "0.1.0",
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
        await writeNote(config, notePath, dirNoteTemplate(dir));
        created++;
      }
    }

    if (!(await noteExists(config, "_dir.md"))) {
      await writeNote(config, "_dir.md", dirNoteTemplate(projectRoot.split("/").pop() ?? "project"));
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

server.registerTool(
  "read_note",
  {
    description: "Read a RoamMem note. Path is relative to .roam/ (e.g. 'src/index.ts.md', '_notes/arch.md', 'src/_dir.md')",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Path to the note relative to .roam/"),
    },
  },
  async ({ projectRoot, notePath }) => {
    const config = makeConfig(projectRoot);
    const content = await readNote(config, notePath);
    if (content === null) {
      return { content: [{ type: "text" as const, text: `Note not found: ${notePath}` }], isError: true };
    }
    return { content: [{ type: "text" as const, text: content }] };
  }
);

// ── write_note ────────────────────────────────────────────────────────

server.registerTool(
  "write_note",
  {
    description: "Create or update a RoamMem note. Use [[filename]] or [[path/to/file]] for bidirectional links.",
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
  "query_links",
  {
    description: "Get forward links (outgoing) and backlinks (incoming) for a note. Rebuilds index if needed.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().describe("Path to the note relative to .roam/"),
    },
  },
  async ({ projectRoot, notePath }) => {
    const config = makeConfig(projectRoot);
    const index = await getOrBuildIndex(config);

    const forward = index.forward[notePath] ?? [];
    const backlinks = index.reverse[notePath] ?? [];

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ notePath, forward, backlinks }, null, 2),
        },
      ],
    };
  }
);

// ── search ────────────────────────────────────────────────────────────

server.registerTool(
  "search",
  {
    description: "Full-text search across all RoamMem notes. Returns matching lines with context.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      query: z.string().describe("Search query (plain text or regex)"),
      regex: z.boolean().optional().describe("Treat query as regex (default: false)"),
      maxResults: z.number().optional().describe("Max results (default: 20)"),
    },
  },
  async ({ projectRoot, query, regex, maxResults }) => {
    const config = makeConfig(projectRoot);
    const notes = await scanExistingNotes(config);
    const limit = maxResults ?? 20;
    const pattern = regex ? new RegExp(query, "gi") : null;
    const hits: SearchHit[] = [];

    for (const notePath of notes) {
      if (hits.length >= limit) break;
      const content = await readNote(config, notePath);
      if (!content) continue;

      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (hits.length >= limit) return;
        const match = pattern ? pattern.test(line) : line.toLowerCase().includes(query.toLowerCase());
        if (pattern) pattern.lastIndex = 0;
        if (match) {
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          hits.push({
            notePath,
            lineNumber: i + 1,
            lineContent: line,
            context: lines.slice(start, end).join("\n"),
          });
        }
      });
    }

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

// ── list_notes ────────────────────────────────────────────────────────

server.registerTool(
  "list_notes",
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
