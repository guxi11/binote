import { resolve } from "node:path";
import { pkg } from "./util/pkg.js";
import { makeConfig, projectPathToNotePath, dirToNotePath, shouldMirror } from "./core/roam-paths.js";
import { scanProjectStructure, scanExistingNotes } from "./core/scanner.js";
import { readNote, writeNote, noteExists } from "./core/note-io.js";
import { getOrBuildIndex, buildIndex, saveIndex, invalidateIndex } from "./core/link-index.js";
import { sync } from "./core/sync-engine.js";
import { dirNoteTemplate } from "./util/markdown.js";
import { ensureDir } from "./util/fs-helpers.js";

const log = (obj: unknown) => console.log(JSON.stringify(obj, null, 2));

const resolveRoot = (dir?: string) => resolve(dir ?? process.cwd());

const commands: Record<string, (args: string[]) => Promise<void>> = {
  async init(args) {
    const root = resolveRoot(args[0]);
    const config = makeConfig(root);
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
      await writeNote(config, "_dir.md", dirNoteTemplate(root.split("/").pop() ?? "project"));
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
    const config = makeConfig(resolveRoot(args[0]));
    const notes = await scanExistingNotes(config);
    log({ total: notes.length, notes });
  },

  async read(args) {
    const [notePath, dir] = args;
    if (!notePath) { console.error("Usage: roammem read <notePath> [projectRoot]"); process.exit(1); }
    const config = makeConfig(resolveRoot(dir));
    const content = await readNote(config, notePath);
    if (content === null) { console.error(`Note not found: ${notePath}`); process.exit(1); }
    console.log(content);
  },

  async write(args) {
    const [notePath, contentArg, dir] = args;
    if (!notePath || contentArg === undefined) { console.error("Usage: roammem write <notePath> <content> [projectRoot]"); process.exit(1); }
    const config = makeConfig(resolveRoot(dir));
    await writeNote(config, notePath, contentArg);
    await invalidateIndex(config);
    console.log(`Note written: ${notePath}`);
  },

  async links(args) {
    const [notePath, dir] = args;
    if (!notePath) { console.error("Usage: roammem links <notePath> [projectRoot]"); process.exit(1); }
    const config = makeConfig(resolveRoot(dir));
    const index = await getOrBuildIndex(config);
    log({
      notePath,
      forward: index.forward[notePath] ?? [],
      backlinks: index.reverse[notePath] ?? [],
    });
  },

  async search(args) {
    const [query, dir] = args;
    if (!query) { console.error("Usage: roammem search <query> [projectRoot]"); process.exit(1); }
    const config = makeConfig(resolveRoot(dir));
    const notes = await scanExistingNotes(config);
    const hits: { notePath: string; lineNumber: number; line: string }[] = [];
    for (const notePath of notes) {
      const content = await readNote(config, notePath);
      if (!content) continue;
      content.split("\n").forEach((line, i) => {
        if (line.toLowerCase().includes(query.toLowerCase())) {
          hits.push({ notePath, lineNumber: i + 1, line });
        }
      });
    }
    log({ query, totalHits: hits.length, hits: hits.slice(0, 20) });
  },

  async sync(args) {
    const config = makeConfig(resolveRoot(args[0]));
    const result = await sync(config);
    log(result);
  },
};

const USAGE = `roammem v${pkg.version} — ${pkg.description}

Usage: roammem <command> [args]
       roammem [--help|-h] [--version|-v]

Commands:
  init   [projectRoot]                  Initialize .roam/ from project structure
  list   [projectRoot]                  List all notes
  read   <notePath> [projectRoot]       Read a note
  write  <notePath> <content> [root]    Write a note
  links  <notePath> [projectRoot]       Query forward links and backlinks
  search <query> [projectRoot]          Full-text search across notes
  sync   [projectRoot]                  Detect file changes, mark orphans

No command → start MCP server (stdio transport)`;

export const runCli = async (args: string[]): Promise<boolean> => {
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
