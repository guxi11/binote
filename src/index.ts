#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { stat } from "node:fs/promises";
import { join } from "node:path";

import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror, resolveLinkDetailed, classifyNote } from "./core/binote-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { searchNotes } from "./core/search.js";
import { sync } from "./core/sync-engine.js";
import { stalenessFor, markVerified } from "./core/meta.js";
import { parseFrontmatter } from "./core/frontmatter.js";
import { applyIgnore, PRIVATE_PATHS } from "./core/gitignore.js";
import { emptyNoteHint, expandGraph, attachStaleness, collectIds, renderGraph, type GraphNode } from "./core/graph-read.js";
import { ensureDir, appendLog } from "./util/fs-helpers.js";
import { readDemand } from "./core/read-demand.js";
import { pkg } from "./util/pkg.js";
import type { Staleness } from "./types.js";

const server = new McpServer({
  name: pkg.name,
  version: pkg.version,
});

const jsonText = (obj: unknown) =>
  ({ content: [{ type: "text" as const, text: JSON.stringify(obj, null, 2) }] });

const dateStamp = () => new Date().toISOString().slice(0, 10);
const sessionLogPath = (sessionsDir: string) => join(sessionsDir, `${dateStamp()}.jsonl`);

/** Revealed read demand outweighs latent graph demand in fused rankings. */
const READ_DEMAND_WEIGHT = 2;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ── init ──────────────────────────────────────────────────────────────

server.registerTool(
  "init",
  {
    description: "Initialize .binote/ directory from project structure. Scans files (gitignore-aware) and creates skeleton notes. Safe to re-run.",
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

    return jsonText({
      status: "initialized",
      projectFiles: files.length,
      directories: dirs.length,
      notesCreated: created,
      binoteDir: config.binoteDir,
    });
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

/** Strip frontmatter, then either show body or fall back to emptyNoteHint. */
const renderFlatNote = (text: string, path: string, from?: number, to?: number): string => {
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

server.registerTool(
  "read_note",
  {
    description: [
      "Read one or more Binote notes via the link graph. Auto-resolves [[link]] targets with fuzzy fallback. Output is markdown.",
      "",
      "Pick depths intentionally:",
      "- forwardDepth=0 → known file, want a slice, batch preview",
      "- forwardDepth=1 → DEFAULT for entering a file/dir: root note in full, each [[linked]] note as a compact excerpt (description + first paragraph + heading outline + its `links:` line). Drill into any excerpt with a follow-up read of that path.",
      "- forwardDepth=2-3 → rare; tracing a causal chain (excerpts throughout)",
      "- backDepth=1 → \"who depends on / references me?\" — incoming refs as excerpts, expanded for the requested note only (_audit reports no longer pollute backlinks)",
      "- detail:\"full\" → inline full bodies on linked nodes instead of excerpts (token-expensive; prefer drilling in)",
      "",
      "Nodes carry a `<!-- staleness: ... -->` line when the source outpaced the note (git-aware: last commit time, mtime for dirty files). Cycles collapse to \"(shown above)\".",
    ].join("\n"),
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      notePath: z.string().optional().describe("Single note path; ignored if notePaths is provided"),
      notePaths: z.array(z.string()).optional().describe("Batch read — shares visited set across all roots"),
      from: z.number().int().positive().optional().describe("1-indexed start line (inclusive, flat reads only)"),
      to: z.number().int().positive().optional().describe("1-indexed end line (inclusive, flat reads only)"),
      forwardDepth: z.number().int().min(0).max(3).optional().describe("Forward [[link]] expansion. 0 = note only. 1 = recommended default for new files. 2+ rare."),
      backDepth: z.number().int().min(0).max(1).optional().describe("Backlink expansion. 0 = ignore (default). 1 = include incoming refs ('who depends on me')."),
      detail: z.enum(["excerpt", "full"]).optional().describe("Linked-node rendering. Default 'excerpt' (compact); 'full' inlines whole bodies (token-expensive)."),
      depth: z.number().int().min(0).max(3).optional().describe("DEPRECATED legacy alias. Maps to forwardDepth (backDepth stays 0). Prefer the explicit params."),
    },
  },
  async ({ projectRoot, notePath, notePaths, from, to, forwardDepth, backDepth, detail, depth }) => {
    const config = makeConfig(projectRoot);
    const fDepth = forwardDepth ?? depth ?? 0;
    const bDepth = backDepth ?? 0;
    const isFlat = fDepth === 0 && bDepth === 0;

    const resolve = (p: string) => resolveNotePath(config, p);

    // Flat path: render plain text, optionally prepend a staleness banner.
    const readFlat = async (p: string): Promise<{ path: string; text: string } | null> => {
      const r = await resolve(p);
      if (!r) return null;
      const c = await readNote(config, r.path);
      if (c === null) return null;
      const rendered = renderFlatNote(c, r.path, from, to);
      const stale = (await stalenessFor(config, [r.path]))[r.path];
      const text = stale && (stale.level === "warning" || stale.level === "stale")
        ? `<!-- staleness: ${stale.hint} -->\n${rendered}`
        : rendered;
      return { path: r.path, text };
    };

    // Graph path: expand roots (sequentially — deterministic shared visited set),
    // attach staleness in one batch, render as markdown.
    const readGraph = async (paths: readonly string[]): Promise<string | null> => {
      const resolved = await Promise.all(paths.map(resolve));
      const realPaths = [...new Set(resolved.filter(Boolean).map((r) => r!.path))];
      if (realPaths.length === 0) return null;
      const index = await getOrBuildIndex(config);
      const visited = new Set<string>();
      const opts = { fDepth, bDepth, full: detail === "full" };
      const nodes: GraphNode[] = [];
      for (const p of realPaths) {
        nodes.push(await expandGraph(config, index, p, opts, 0, visited));
      }
      const ids = new Set<string>();
      for (const n of nodes) collectIds(n, ids);
      const stalenessMap = await stalenessFor(config, [...ids]);
      for (const n of nodes) attachStaleness(n, stalenessMap);
      return renderGraph(nodes);
    };

    type Built = { text: string; isError?: boolean };
    const makeResult = async (): Promise<Built> => {
      if (notePaths && notePaths.length > 0) {
        if (isFlat) {
          const sections = await Promise.all(
            notePaths.map(async (p) => {
              const r = await readFlat(p);
              return r ? `# ${r.path}\n\n${r.text}` : `# ${p}\n\n(not found)`;
            }),
          );
          return { text: sections.join("\n\n---\n\n") };
        }
        const graph = await readGraph(notePaths);
        return graph === null
          ? { text: `No notes found for: ${notePaths.join(", ")}`, isError: true }
          : { text: graph };
      }

      if (!notePath) return { text: "Provide notePath or notePaths", isError: true };

      if (isFlat) {
        const flat = await readFlat(notePath);
        return flat === null
          ? { text: `Note not found: ${notePath}`, isError: true }
          : { text: flat.text };
      }

      const graph = await readGraph([notePath]);
      return graph === null
        ? { text: `Note not found: ${notePath}`, isError: true }
        : { text: graph };
    };

    const { text, isError } = await makeResult();

    // Log the read demand — paths requested, not the bodies returned. The old
    // (pre-0.4.0) logger persisted full result content, which is why it was
    // dropped; this lean record is all the demand ranker needs. Field name
    // `input` is kept so older session logs stay consumable.
    const input = notePaths && notePaths.length > 0 ? notePaths : notePath ? [notePath] : [];
    if (input.length > 0) {
      await appendLog(
        sessionLogPath(config.sessionsDir),
        JSON.stringify({ ts: new Date().toISOString(), input, forwardDepth: fDepth, backDepth: bDepth, chars: text.length }) + "\n",
      ).catch(() => {});
    }

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
    description: "Relevance-ranked full-text search across all Binote notes (fuzzy + prefix matching, note-path and heading terms boosted). Hits carry a score and the resolved [[link]] targets on the matched line. regex:true switches to an exact line scan (unranked). Plain queries that rank to nothing fall back to a substring scan automatically.",
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
    return jsonText({ query, totalHits: hits.length, hits });
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
    return jsonText(await sync(config, dryRun ?? false));
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

    return jsonText({
      status: "rebuilt",
      indexPath: config.indexPath,
      notes: Object.keys(index.links).length,
      links: Object.values(index.links).reduce((n, refs) => n + refs.length, 0),
      dangling: Object.keys(index.dangling).length,
    });
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

    return jsonText({ status: "verified", notePath: resolved.path, at: new Date().toISOString() });
  }
);

// ── audit_status ──────────────────────────────────────────────────────

server.registerTool(
  "audit_status",
  {
    description: "Report which notes are stale, unverified, or empty — sorted by drift severity, then by read demand within each level (a stale note agents keep reading ranks above an equally-stale one nobody reads). Staleness is git-aware (last commit touching the source vs the note; mtime for dirty files). Each row carries `kind` (file/dir/design/feature/notes/audit/constitution), `contentLength` (chars of body, excluding frontmatter), and `readFreq` (recency-weighted read count from _sessions/ logs). Used by /binote:verify (drift) and /binote:clarify (coverage gaps).",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      level: z.enum(["fresh", "warning", "stale", "unverified"]).optional().describe("Filter by staleness level. Omit to return all (sorted)."),
      kind: z.enum(["constitution", "design", "feature", "notes", "audit", "dir", "file"]).optional().describe("Filter by note kind. Useful for clarify: kind='file' surfaces empty mirrored notes; kind='design' shows design coverage."),
      limit: z.number().int().positive().optional().describe("Max entries to return (default: 20)"),
    },
  },
  async ({ projectRoot, level, limit, kind }) => {
    const config = makeConfig(projectRoot);
    const cap = limit ?? 20;

    const allNotes = await scanExistingNotes(config);
    const [stalenessMap, lengthEntries, demand] = await Promise.all([
      stalenessFor(config, allNotes),
      Promise.all(
        allNotes.map(async (p): Promise<readonly [string, number]> => {
          const raw = await readNote(config, p);
          return [p, raw === null ? 0 : parseFrontmatter(raw).body.trim().length];
        }),
      ),
      readDemand(config, Date.now()),
    ]);
    const lengthMap: Readonly<Record<string, number>> = Object.fromEntries(lengthEntries);

    type Row = {
      readonly notePath: string;
      readonly level: Staleness["level"];
      readonly daysSourceAheadOfNote: number | null;
      readonly daysSinceVerified: number | null;
      readonly hint: string;
      readonly kind: ReturnType<typeof classifyNote>;
      readonly contentLength: number;
      readonly readFreq: number;
    };

    const rows: Row[] = Object.entries(stalenessMap).map(([notePath, s]) => ({
      notePath,
      level: s.level,
      daysSourceAheadOfNote: s.daysSourceAheadOfNote,
      daysSinceVerified: s.daysSinceVerified,
      hint: s.hint,
      kind: classifyNote(notePath),
      contentLength: lengthMap[notePath] ?? 0,
      readFreq: round2(demand[notePath] ?? 0),
    }));

    const filtered = rows
      .filter(r => !level || r.level === level)
      .filter(r => !kind || r.kind === kind);

    // Sort: stale > warning > unverified > fresh; within a level, rank by drift
    // amplified by read demand — a stale note agents keep reading needs fixing
    // before an equally-stale note nobody touches. Heavy drift still dominates.
    const levelRank = { stale: 3, warning: 2, unverified: 1, fresh: 0 } as const;
    const driftScore = (r: Row) => ((r.daysSourceAheadOfNote ?? 0) + 1) * (1 + READ_DEMAND_WEIGHT * r.readFreq);
    const sorted = [...filtered].sort((a, b) => {
      const lr = levelRank[b.level] - levelRank[a.level];
      if (lr !== 0) return lr;
      return driftScore(b) - driftScore(a);
    });

    return jsonText({
      total: filtered.length,
      shown: Math.min(cap, sorted.length),
      notes: sorted.slice(0, cap),
    });
  }
);

// ── knowledge_gaps ────────────────────────────────────────────────────

server.registerTool(
  "knowledge_gaps",
  {
    description: "Demand-ranked sedimentation gaps from the link graph. (1) missingMirrors: dangling [[targets]] that map to real project files, ranked by a fused demandScore = inbound [[ref]] count (latent demand) + read frequency (revealed demand, recency-weighted from _sessions/ read logs) — files agents keep reaching for, or the graph keeps pointing at, get written first. (2) orphanNotes: _notes/ and _design/ notes with zero backlinks — reachable only via search; cite them from the notes that should link there. Used by /binote:clarify.",
    inputSchema: {
      projectRoot: z.string().describe("Absolute path to the project root"),
      limit: z.number().int().positive().optional().describe("Max missing-mirror entries (default: 15)"),
    },
  },
  async ({ projectRoot, limit }) => {
    const config = makeConfig(projectRoot);
    const cap = limit ?? 15;
    const index = await getOrBuildIndex(config);
    const demand = await readDemand(config, Date.now());

    const fileExists = async (rel: string): Promise<boolean> => {
      try { return (await stat(join(config.projectRoot, rel))).isFile(); } catch { return false; }
    };

    // Fused demand: latent graph pull (inbound [[refs]]) + revealed read demand
    // (how often agents actually tried to read this yet-unwritten note). A file
    // agents keep reaching for outranks one that is merely linked a lot.
    const missing = (await Promise.all(
      Object.entries(index.dangling).map(async ([raw, refs]) => {
        const candidate = raw.replace(/\.md$/, "");
        if (!(await fileExists(candidate)) || !shouldMirror(candidate)) return null;
        const readFreq = round2(demand[`${candidate}.md`] ?? 0);
        return {
          projectPath: candidate,
          notePath: `${candidate}.md`,
          inboundRefs: refs.length,
          readFreq,
          demandScore: round2(refs.length + READ_DEMAND_WEIGHT * readFreq),
          referencedFrom: [...new Set(refs.map((r) => r.from))].slice(0, 5),
        };
      }),
    ))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => b.demandScore - a.demandScore || b.inboundRefs - a.inboundRefs);

    const notes = await scanExistingNotes(config);
    const orphanNotes = notes
      .filter((n) => {
        const k = classifyNote(n);
        return (k === "notes" || k === "design") && (index.backlinks[n] ?? []).length === 0;
      })
      .sort();

    return jsonText({
      missingMirrors: {
        total: missing.length,
        shown: Math.min(cap, missing.length),
        items: missing.slice(0, cap),
      },
      orphanNotes: { total: orphanNotes.length, items: orphanNotes },
    });
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
    return jsonText(await applyIgnore(config));
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
    return jsonText({ total: notes.length, notes });
  }
);

// ── start ─────────────────────────────────────────────────────────────

import { runCli } from "./cli.js";

const isCli = await runCli(process.argv.slice(2));
if (!isCli) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
