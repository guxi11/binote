import { resolve } from "node:path";
import { pkg } from "./util/pkg.js";
import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror, resolveLinkDetailed, notePathToProjectPath, isDirNote, isStandaloneNote } from "./core/backnote-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { searchNotes } from "./core/search.js";
import { sync } from "./core/sync-engine.js";
import { ensureDir } from "./util/fs-helpers.js";

const log = (obj: unknown) => console.log(JSON.stringify(obj, null, 2));

// ── flag parser ───────────────────────────────────────────────────────

type ParsedArgs = {
  readonly positional: readonly string[];
  readonly flags: Readonly<Record<string, string | boolean>>;
};

const parseArgs = (
  argv: readonly string[],
  booleanFlags: ReadonlySet<string> = new Set()
): ParsedArgs => {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-")) { positional.push(a); continue; }
    const body = a.replace(/^--?/, "");
    const eq = body.indexOf("=");
    if (eq !== -1) { flags[body.slice(0, eq)] = body.slice(eq + 1); continue; }
    if (booleanFlags.has(body)) { flags[body] = true; continue; }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith("-")) { flags[body] = next; i++; continue; }
    flags[body] = true;
  }
  return { positional, flags };
};

const numFlag = (flags: ParsedArgs["flags"], key: string): number | undefined => {
  const v = flags[key];
  return typeof v === "string" ? Number(v) : undefined;
};

const strFlag = (flags: ParsedArgs["flags"], key: string): string | undefined => {
  const v = flags[key];
  return typeof v === "string" ? v : undefined;
};

const boolFlag = (flags: ParsedArgs["flags"], key: string): boolean =>
  flags[key] === true;

const rootFromFlags = (flags: ParsedArgs["flags"]): string =>
  resolve(strFlag(flags, "root") ?? process.cwd());

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

// ── commands ──────────────────────────────────────────────────────────

const commands: Record<string, (args: readonly string[]) => Promise<void>> = {
  async init(args) {
    const { flags } = parseArgs(args);
    const root = rootFromFlags(flags);
    const config = makeConfig(root);
    await ensureDir(config.backnoteDir);
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
    log({ status: "initialized", projectFiles: files.length, directories: dirs.length, notesCreated: created });
  },

  async list(args) {
    const { flags } = parseArgs(args);
    const config = makeConfig(rootFromFlags(flags));
    const notes = await scanExistingNotes(config);
    log({ total: notes.length, notes });
  },

  async read(args) {
    const { positional, flags } = parseArgs(args);
    if (positional.length === 0) {
      console.error("Usage: backnote read <notePath> [<notePath>...] [--from N] [--to M] [--lines N:M] [--root D]");
      process.exit(1);
    }
    const config = makeConfig(rootFromFlags(flags));

    let from = numFlag(flags, "from");
    let to = numFlag(flags, "to");
    const lines = strFlag(flags, "lines");
    if (lines) {
      const [a, b] = lines.split(":").map(Number);
      from = Number.isFinite(a) ? a : undefined;
      to = Number.isFinite(b) ? b : undefined;
    }

    const slice = (text: string, path: string): string => {
      if (text.length === 0) return emptyNoteHint(path);
      if (from === undefined && to === undefined) return text;
      const all = text.split("\n");
      const lo = Math.max(1, from ?? 1);
      const hi = Math.min(all.length, to ?? all.length);
      return `# lines ${lo}-${hi} of total ${all.length} in ${path}\n${all.slice(lo - 1, hi).join("\n")}`;
    };

    const notes = await scanExistingNotes(config);
    for (const requested of positional) {
      let content = await readNote(config, requested);
      let actual = requested;
      if (content === null) {
        const detail = resolveLinkDetailed(requested, notes);
        if (detail.resolved) {
          actual = detail.resolved;
          content = await readNote(config, actual);
          console.error(`# did you mean: ${actual} (matched via ${detail.strategy})`);
        } else if (detail.candidates.length > 0) {
          console.error(`Note not found: ${requested}\nDid you mean one of:\n${detail.candidates.map((c) => `  ${c}`).join("\n")}`);
          process.exit(1);
        } else {
          console.error(`Note not found: ${requested}`);
          process.exit(1);
        }
      }
      if (positional.length > 1) console.log(`\n===== ${actual} =====`);
      console.log(slice(content!, actual));
    }
  },

  async write(args) {
    const { positional, flags } = parseArgs(args);
    const [notePath, contentArg] = positional;
    if (!notePath || contentArg === undefined) {
      console.error("Usage: backnote write <notePath> <content> [--root D]");
      process.exit(1);
    }
    const config = makeConfig(rootFromFlags(flags));
    await writeNote(config, notePath, contentArg);
    await invalidateIndex(config);
    console.log(`Note written: ${notePath}`);
  },

  async links(args) {
    const { positional, flags } = parseArgs(args, new Set(["detail"]));
    const [notePath] = positional;
    if (!notePath) {
      console.error("Usage: backnote links <notePath> [--detail] [--root D]");
      process.exit(1);
    }
    const config = makeConfig(rootFromFlags(flags));
    const index = await getOrBuildIndex(config);
    const detail = boolFlag(flags, "detail");
    log(detail
      ? {
          notePath,
          forward: index.forward[notePath] ?? [],
          backlinks: index.reverse[notePath] ?? [],
          forwardDetails: index.links[notePath] ?? [],
          backlinkDetails: index.backlinks[notePath] ?? [],
        }
      : {
          notePath,
          forward: index.forward[notePath] ?? [],
          backlinks: index.reverse[notePath] ?? [],
        });
  },

  async search(args) {
    const { positional, flags } = parseArgs(args, new Set(["regex"]));
    const [query] = positional;
    if (!query) {
      console.error("Usage: backnote search <query> [--regex] [--max N] [--context N] [--root D]");
      process.exit(1);
    }
    const config = makeConfig(rootFromFlags(flags));
    const hits = await searchNotes(config, query, {
      regex: boolFlag(flags, "regex"),
      maxResults: numFlag(flags, "max"),
      contextLines: numFlag(flags, "context"),
    });
    log({ query, totalHits: hits.length, hits });
  },

  async resolve(args) {
    const { positional, flags } = parseArgs(args);
    const [target] = positional;
    if (!target) {
      console.error("Usage: backnote resolve <target> [--root D]");
      process.exit(1);
    }
    const config = makeConfig(rootFromFlags(flags));
    const notes = await scanExistingNotes(config);
    log(resolveLinkDetailed(target, notes));
  },

  async dangling(args) {
    const { flags } = parseArgs(args);
    const config = makeConfig(rootFromFlags(flags));
    const index = await getOrBuildIndex(config);
    log({ total: Object.keys(index.dangling).length, dangling: index.dangling });
  },

  async sync(args) {
    const { flags } = parseArgs(args);
    const config = makeConfig(rootFromFlags(flags));
    const result = await sync(config, boolFlag(flags, "dry-run"));
    log(result);
  },
};

const USAGE = `backnote v${pkg.version} — ${pkg.description}

Usage: backnote <command> [args]
       backnote [--help|-h] [--version|-v]

Commands:
  init     [--root D]                          Initialize .backnote/ from project structure
  list     [--root D]                          List all notes
  read     <notePath> [<notePath>...] [opts]   Read one or more notes (fuzzy fallback on miss)
             [--from N] [--to M] [--lines N:M] [--root D]
  write    <notePath> <content> [--root D]     Write a note
  links    <notePath> [--detail] [--root D]    Forward links + backlinks (--detail adds line numbers)
  search   <query> [--regex] [--max N]         Full-text search (hits include resolved [[links]])
             [--context N] [--root D]
  resolve  <target> [--root D]                 Resolve a [[target]] to a note path
  dangling [--root D]                          List all unresolved [[links]] across the project
  sync     [--dry-run] [--root D]              Detect file changes, mark orphans, rebuild index

No command → start MCP server (stdio transport)

Note: --root defaults to the current working directory.`;

export const runCli = async (args: readonly string[]): Promise<boolean> => {
  const cmd = args[0];
  if (!cmd) return false; // no args → MCP mode

  if (cmd === "--help" || cmd === "-h") {
    console.log(USAGE);
    return true;
  }

  if (cmd === "--version" || cmd === "-v") {
    console.log(pkg.version);
    return true;
  }

  const handler = commands[cmd];
  if (!handler) {
    console.error(`Unknown command: ${cmd}\n\n${USAGE}`);
    process.exit(1);
  }

  await handler(args.slice(1));
  return true;
};
